import { GridFSBucket, ObjectId } from 'mongodb';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_CSV_BYTES, parseCSVString } from '@dimension-lab/algorithms/dataParser';
import type { DatasetDocument, DatasetSummary } from '@dimension-lab/contracts';
import { atlasDatabase, storageUnavailable } from '../database/atlas';
import { finishDatasetReservation, prepareDatasetRemoval, releaseDataset, reserveDataset } from './datasetQuota';

type DatasetMetadata = Omit<DatasetDocument, 'rawRows'>;
type OwnedDataset = DatasetMetadata & { ownerId: ObjectId; visibility: 'private'; currentVersionId: ObjectId; updatedAt: string; deletedAt?: Date };
type DatasetVersion = { _id: ObjectId; datasetId: string; version: number; fileId: ObjectId; rowCount: number;
  features: string[]; headers: string[]; labelColumn: string | null; idColumn: string | null; createdAt: Date };
const bucket = () => new GridFSBucket(atlasDatabase(), { bucketName: 'dataset_files' });
const datasets = () => atlasDatabase().collection<OwnedDataset>('datasets');
const versions = () => atlasDatabase().collection<DatasetVersion>('dataset_versions');
const owned = (id: string, ownerId: string) => ({ id, ownerId: new ObjectId(ownerId), visibility: 'private' as const,
  currentVersionId: { $type: 'objectId' as const }, deletedAt: { $exists: false } });

export function summarizeDataset(dataset: DatasetMetadata, sample = false): DatasetSummary {
  return { id: dataset.id, name: dataset.name, filename: dataset.filename, total_rows: dataset.totalRows,
    features_count: dataset.features.length, label_column: dataset.labelColumn, id_column: dataset.idColumn,
    created_at: dataset.createdAt, is_preloaded: sample };
}

export async function listOwnedDatasets(ownerId: string, offset: number, limit: number) {
  const list = await datasets().find({ ownerId: new ObjectId(ownerId), visibility: 'private',
    currentVersionId: { $type: 'objectId' }, deletedAt: { $exists: false } }, { projection: { rawRows: 0 } })
    .sort({ createdAt: -1, id: 1 }).skip(offset).limit(limit).toArray();
  return list.map(item => summarizeDataset(item));
}

export async function publishDataset(dataset: DatasetDocument, content: Buffer, ownerId: string, headers: string[]) {
  const { rawRows: _rows, ...metadata } = dataset;
  const fileId = new ObjectId(), versionId = new ObjectId(), files = bucket();
  const record: OwnedDataset = { ...metadata, ownerId: new ObjectId(ownerId), visibility: 'private',
    currentVersionId: versionId, updatedAt: dataset.createdAt };
  let publishing = false;
  await reserveDataset(ownerId, dataset.id, content.length, fileId);
  try {
    await pipeline(Readable.from([content]), files.openUploadStreamWithId(fileId, dataset.filename,
      { metadata: { datasetId: dataset.id, version: 1 } }));
    await versions().insertOne({ _id: versionId, datasetId: dataset.id, version: 1, fileId, rowCount: dataset.totalRows,
      features: dataset.features, headers, labelColumn: dataset.labelColumn, idColumn: dataset.idColumn, createdAt: new Date() });
    publishing = true;
    await datasets().insertOne(record);
  } catch (error) {
    // A timed-out publication may already have committed. Never remove its referenced file.
    if (!publishing) {
      const cleanup = await Promise.allSettled([versions().deleteOne({ _id: versionId }), files.delete(fileId)]);
      if (cleanup.every(step => step.status === 'fulfilled')) {
        await releaseDataset(ownerId, dataset.id).catch(() => {
          console.warn(JSON.stringify({ event: 'dataset.reservation_release_failed' }));
        });
      }
    }
    throw error;
  }
  await finishDatasetReservation(ownerId, dataset.id).catch(() => {
    console.warn(JSON.stringify({ event: 'dataset.reservation_finalize_failed' }));
  });
}

export async function openOwnedFile(id: string, ownerId: string) {
  const record = await datasets().findOne(owned(id, ownerId));
  if (!record) return null;
  const version = await versions().findOne({ _id: record.currentVersionId, datasetId: id });
  if (!version) throw storageUnavailable();
  const files = bucket();
  if (!(await files.find({ _id: version.fileId }).limit(1).next())) throw storageUnavailable();
  return { record, stream: files.openDownloadStream(version.fileId) };
}

export async function loadOwnedDataset(id: string, ownerId: string): Promise<DatasetDocument | null> {
  const file = await openOwnedFile(id, ownerId);
  if (!file) return null;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    const stream: AsyncIterable<unknown> = file.stream;
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) throw storageUnavailable();
      size += chunk.length;
      if (size > MAX_CSV_BYTES) throw storageUnavailable();
      chunks.push(chunk);
    }
    const { record } = file;
    const parsed = parseCSVString(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)), record.name);
    if (parsed.totalRows !== record.totalRows) throw storageUnavailable();
    return { id, name: record.name, filename: record.filename, features: record.features, labelColumn: record.labelColumn,
      idColumn: record.idColumn, createdAt: record.createdAt, totalRows: record.totalRows, rawRows: parsed.rawRows };
  } catch { throw storageUnavailable(); }
}

export async function renameOwnedDataset(id: string, ownerId: string, name: string) {
  const record = await datasets().findOneAndUpdate(owned(id, ownerId), { $set: { name, updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' });
  return record && summarizeDataset(record);
}

export async function deleteOwnedDataset(id: string, ownerId: string) {
  await prepareDatasetRemoval(ownerId);
  // The tombstone immediately revokes access and retains the file reference for cleanup.
  const record = await datasets().findOneAndUpdate(owned(id, ownerId),
    { $set: { deletedAt: new Date(), updatedAt: new Date().toISOString() } });
  if (record) await releaseDataset(ownerId, id);
  else if (await datasets().findOne({ id, ownerId: new ObjectId(ownerId), deletedAt: { $exists: true } }, { projection: { _id: 1 } })) {
    // Complete a previous deletion if updating the ledger had failed.
    await releaseDataset(ownerId, id);
  }
  return Boolean(record);
}

export async function ownsDataset(id: string, ownerId: string) {
  return Boolean(await datasets().findOne(owned(id, ownerId), { projection: { _id: 1 } }));
}
