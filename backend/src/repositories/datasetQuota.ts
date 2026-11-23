import { MongoServerError, ObjectId } from 'mongodb';
import { datasetLimits } from '../config/limits';
import { atlasDatabase, storageUnavailable } from '../database/atlas';
import { AppError } from '../http/errors';

export interface Reservation { id: string; bytes: number; fileId?: ObjectId; reservedAt?: Date }
export interface QuotaLedger { _id: ObjectId; items: Reservation[] }

const ledgers = () => atlasDatabase().collection<QuotaLedger>('dataset_quotas');

async function loadExistingDatasets(owner: ObjectId) {
  // Existing uploads predate the ledger. Derive their exact size from GridFS once,
  // before this application's first quota-protected mutation for the owner.
  const items = await atlasDatabase().collection('datasets').aggregate<Reservation>([
    { $match: { ownerId: owner, visibility: 'private', currentVersionId: { $type: 'objectId' }, deletedAt: { $exists: false } } },
    { $lookup: { from: 'dataset_versions', localField: 'currentVersionId', foreignField: '_id', as: 'versions' } },
    { $lookup: { from: 'dataset_files.files', localField: 'versions.fileId', foreignField: '_id', as: 'files' } },
    { $project: { _id: 0, id: 1, bytes: { $arrayElemAt: ['$files.length', 0] } } },
  ]).toArray();
  if (items.some(item => !Number.isSafeInteger(item.bytes) || item.bytes < 0)) throw storageUnavailable();
  return items;
}

async function ledgerFor(owner: ObjectId) {
  const collection = ledgers();
  const exists = await collection.findOne({ _id: owner }, { projection: { _id: 1 } });
  if (exists) return collection;
  const items = await loadExistingDatasets(owner);
  try {
    await collection.updateOne({ _id: owner }, { $setOnInsert: { items } }, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    if (!await collection.findOne({ _id: owner }, { projection: { _id: 1 } })) throw error;
  }
  return collection;
}

export async function datasetUsage(ownerId: string) {
  const owner = new ObjectId(ownerId);
  const initial = await ledgers().findOne({ _id: owner });
  const legacy = initial ? [] : await loadExistingDatasets(owner);
  const items = (initial ?? await ledgers().findOne({ _id: owner }))?.items ?? legacy;
  return { fileCount: items.length, usedBytes: items.reduce((sum, item) => sum + item.bytes, 0), ...datasetLimits };
}

export async function reserveDataset(ownerId: string, id: string, bytes: number, fileId: ObjectId) {
  const owner = new ObjectId(ownerId);
  const collection = await ledgerFor(owner);
  // The filter and push execute atomically even when requests arrive on different servers.
  const result = await collection.updateOne({
    _id: owner,
    $expr: { $and: [
      { $lt: [{ $size: '$items' }, datasetLimits.maxFiles] },
      { $lte: [{ $sum: '$items.bytes' }, datasetLimits.maxBytes - bytes] },
    ] },
  }, { $push: { items: { id, bytes, fileId, reservedAt: new Date() } } });
  if (!result.modifiedCount) {
    throw new AppError('Your dataset storage limit is reached. Delete a dataset to make room.', 409, 'DATASET_QUOTA_EXCEEDED');
  }
}

export async function finishDatasetReservation(ownerId: string, id: string) {
  await ledgers().updateOne({ _id: new ObjectId(ownerId), 'items.id': id },
    { $unset: { 'items.$.reservedAt': '', 'items.$.fileId': '' } });
}

export async function prepareDatasetRemoval(ownerId: string) {
  await ledgerFor(new ObjectId(ownerId));
}

export async function releaseDataset(ownerId: string, id: string) {
  await ledgers().updateOne({ _id: new ObjectId(ownerId) }, { $pull: { items: { id } } });
}
