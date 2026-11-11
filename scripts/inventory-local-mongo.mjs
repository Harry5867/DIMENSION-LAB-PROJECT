import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_INVENTORY_URI;
if (!uri) {
  console.error('Set MONGODB_INVENTORY_URI to the database connection to inspect.');
  process.exit(1);
}

const collections = {
  users: ['id', 'googleSub', 'email', 'authMode'],
  sessions: ['userId', 'sessionHash', 'tokenHash', 'expiresAt'],
  datasets: ['id', 'ownerId', 'rawRows', 'currentVersionId'],
  experiments: ['datasetId', 'ownerId'],
  user_datasets: ['id', 'ownerId', 'revision', 'publishedSyncId'],
  user_dataset_rows: ['ownerId', 'datasetId', 'recordId', 'rowIndex', 'syncId'],
  user_dataset_revision_rows: ['ownerId', 'datasetId', 'recordId', 'rowIndex', 'syncId'],
  user_dataset_row_edits: ['ownerId', 'datasetId', 'recordId', 'generation', 'editRevision'],
  dataset_versions: ['ownerId', 'datasetId', 'revision', 'version', 'syncId', 'fileId'],
  dataset_sync_receipts: ['ownerId', 'datasetId', 'syncId', 'revision'],
  dataset_conflicts: ['ownerId', 'datasetId', 'syncId', 'serverRevision'],
  dataset_conflict_rows: ['ownerId', 'datasetId', 'conflictId', 'rowIndex'],
  user_experiments: ['ownerId', 'dataset_id', 'dataset_revision'],
  compute_cache: ['cacheKey', 'createdAt'],
};

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000, timeoutMS: 10000 });
try {
  const db = client.db(process.env.MONGODB_INVENTORY_DB || process.env.MONGODB_DB_NAME || 'cancer_explorer');
  const catalog = await db.listCollections({ name: { $in: Object.keys(collections) }, type: 'collection' }, { nameOnly: true }).toArray();
  const inventory = {};
  for (const { name } of catalog.sort((first, second) => first.name.localeCompare(second.name))) {
    const collection = db.collection(name);
    const fields = Object.fromEntries(collections[name].map(field => [field, { $type: '$' + field }]));
    const [indexes, estimatedDocuments, sampledShapes] = await Promise.all([
      collection.listIndexes().toArray(),
      collection.estimatedDocumentCount(),
      collection.aggregate([
        { $limit: 100 },
        { $group: { _id: fields, count: { $sum: 1 } } },
        { $project: { _id: 0, fieldTypes: '$_id', count: 1 } },
      ]).toArray(),
    ]);
    inventory[name] = {
      estimatedDocuments,
      indexes: indexes.map(({ name: index, key, unique, expireAfterSeconds }) => ({ index, key, unique, expireAfterSeconds })),
      sampledShapes,
    };
  }
  console.log(JSON.stringify(inventory, null, 2));
} catch (error) {
  console.error('MongoDB inventory failed (' + error.name + '). Check connection and read access.');
  process.exitCode = 1;
} finally {
  await client.close();
}
