import assert from 'node:assert/strict';
import test from 'node:test';
import { MongoClient } from 'mongodb';

test('persistent storage errors propagate instead of acknowledging an in-memory write', async (t) => {
  const previous = process.env.LAB_AUTH_PASSWORD;
  const previousUri = process.env.MONGODB_URI;
  process.env.LAB_AUTH_PASSWORD = 'local-test-password';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/dimension_lab_test';
  const unavailable = async () => { throw new Error('simulated storage failure'); };
  const fakeDatabase = { collection: () => ({
    createIndex: async () => 'test-index',
    countDocuments: async () => 1,
    find: () => ({ toArray: unavailable }),
    findOne: unavailable,
    findOneAndUpdate: unavailable,
    insertOne: unavailable,
    deleteOne: unavailable,
  }) };
  t.mock.method(MongoClient.prototype, 'connect', async function (this: MongoClient) { return this; });
  t.mock.method(MongoClient.prototype, 'db', () => fakeDatabase);
  try {
    const storage = await import('../server/db');
    await storage.initDatabase();
    assert.equal(storage.isMongoConnected, true);
    const data = { id: 'test', name: 'CSV', filename: 'test.csv', features: ['a', 'b', 'c'],
      totalRows: 2, labelColumn: null, idColumn: null, rawRows: [{ a: 1, b: 2, c: 3 }, { a: 4, b: 5, c: 6 }],
      createdAt: new Date().toISOString() };
    await assert.rejects(storage.saveDataset(data), /simulated storage failure/);
    await assert.rejects(storage.getDatasetById(data.id), /simulated storage failure/);
    await assert.rejects(storage.getAllDatasets(), /simulated storage failure/);
    await assert.rejects(storage.updateDataset(data.id, 'new name'), /simulated storage failure/);
    await assert.rejects(storage.deleteDataset(data.id), /simulated storage failure/);
    await assert.rejects(storage.saveExperiment({ datasetId: data.id, datasetName: data.name, reductionMethod: 'PCA',
      clusteringMethod: 'None', k: 2, silhouetteScore: null, ari: null, params: {} }), /simulated storage failure/);
  } finally {
    if (previous === undefined) delete process.env.LAB_AUTH_PASSWORD;
    else process.env.LAB_AUTH_PASSWORD = previous;
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
  }
});
