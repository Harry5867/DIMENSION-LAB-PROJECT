import { MongoClient, ObjectId } from 'mongodb';
import type { QuotaLedger } from '../repositories/datasetQuota';

interface DatasetRecord { id: string; ownerId: ObjectId; deletedAt?: Date }
interface DatasetVersion { _id: ObjectId; datasetId: string; fileId: ObjectId }

const defaultRetentionDays = 7;
const retention = process.env.LAB_DATASET_RETENTION_DAYS ?? String(defaultRetentionDays);
const retentionDays = Number(retention);
const uri = process.env.LAB_MAINTENANCE_URI;
const name = process.env.LAB_MAINTENANCE_DATABASE;
const execute = process.argv.includes('--execute');
if (process.argv.slice(2).some(arg => arg !== '--execute')) throw new Error('Unknown maintenance option.');
if (!uri || !name) throw new Error('Set LAB_MAINTENANCE_URI and LAB_MAINTENANCE_DATABASE explicitly.');
if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error('Invalid retention period.');
if (execute && process.env.LAB_MAINTENANCE_WRITES_PAUSED !== '1') throw new Error('Pause application writes before executing GridFS cleanup.');

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, timeoutMS: 12000, writeConcern: { w: 'majority' } });
try {
  const db = client.db(name);
  const datasets = db.collection<DatasetRecord>('datasets');
  const versions = db.collection<DatasetVersion>('dataset_versions');
  const files = db.collection<{ _id: ObjectId; length: number; metadata?: { datasetId?: string } }>('dataset_files.files');
  const chunks = db.collection<{ files_id: ObjectId }>('dataset_files.chunks');
  const ledger = db.collection<QuotaLedger>('dataset_quotas');
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const summary = { event: 'dataset.maintenance', dryRun: !execute, trash: 0, orphanReservations: 0, finalizedReservations: 0,
    skipped: 0, fileBytes: 0 };

  async function removeArtifacts(id: string, expectedFile?: ObjectId) {
    const records = await versions.find({ datasetId: id }).toArray();
    const fileIds = new Map(records.map(version => [version.fileId.toHexString(), version.fileId]));
    if (expectedFile) fileIds.set(expectedFile.toHexString(), expectedFile);
    const versionIds = records.map(version => version._id);
    if (versionIds.length && await datasets.findOne({ id: { $ne: id }, currentVersionId: { $in: versionIds } })) return false;
    let bytes = 0;
    for (const fileId of fileIds.values()) {
      if (await versions.findOne({ fileId, datasetId: { $ne: id } })) return false;
      const file = await files.findOne({ _id: fileId });
      if (file && file.metadata?.datasetId !== id) return false;
      bytes += file?.length ?? 0;
    }
    if (execute) {
      for (const fileId of fileIds.values()) {
        // Delete exact GridFS records. Retrying after an interrupted run also removes
        // remaining chunks when the corresponding file document is already gone.
        await files.deleteOne({ _id: fileId, 'metadata.datasetId': id });
        await chunks.deleteMany({ files_id: fileId });
      }
      if (versionIds.length) await versions.deleteMany({ datasetId: id, _id: { $in: versionIds } });
    }
    summary.fileBytes += bytes;
    return true;
  }

  const examined = new Set<string>();
  for await (const dataset of datasets.find({ deletedAt: { $lte: cutoff } }).sort({ deletedAt: 1 }).limit(100)) {
    examined.add(dataset.id);
    if (!await removeArtifacts(dataset.id)) { summary.skipped++; continue; }
    if (execute) {
      await ledger.updateOne({ _id: dataset.ownerId }, { $pull: { items: { id: dataset.id } } });
      await datasets.deleteOne({ id: dataset.id, ownerId: dataset.ownerId, deletedAt: { $lte: cutoff } });
    }
    summary.trash++;
  }

  for await (const account of ledger.find({ 'items.reservedAt': { $lte: cutoff } }).limit(100)) {
    for (const item of account.items) {
      if (!item.fileId || !item.reservedAt || item.reservedAt > cutoff || examined.has(item.id)) continue;
      const published = await datasets.findOne({ id: item.id });
      if (published) {
        if (!published.ownerId.equals(account._id)) { summary.skipped++; continue; }
        if (execute) await ledger.updateOne({ _id: account._id, 'items.id': item.id },
          { $unset: { 'items.$.reservedAt': '', 'items.$.fileId': '' } });
        summary.finalizedReservations++;
      } else if (await removeArtifacts(item.id, item.fileId)) {
        if (execute) await ledger.updateOne({ _id: account._id }, { $pull: { items: { id: item.id } } });
        summary.orphanReservations++;
      } else summary.skipped++;
    }
  }
  console.log(JSON.stringify(summary));
} catch {
  console.error('Dataset maintenance failed. Confirm the isolated connection and review database availability before retrying.');
  process.exitCode = 1;
} finally {
  await client.close();
}
