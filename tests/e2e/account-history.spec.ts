import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';
import type { QuotaLedger } from '../../backend/src/repositories/datasetQuota';
import { uploadCsv } from './support';

test('two accounts in the same browser have separate analysis history', async ({ page, baseURL }) => {
  test.skip(!process.env.LAB_E2E_HISTORY_MONGO_PORT, 'Requires the isolated local MongoDB test service.');
  test.setTimeout(90_000);
  const id = randomUUID();
  const headers = { Origin: baseURL! };
  const password = randomUUID();
  const accounts = ['first', 'second'].map(name => ({ email: `${name}-${id}@example.com`, password, displayName: name }));
  for (const data of accounts) {
    expect((await page.request.post('/api/auth/register', { headers, data })).status()).toBe(201);
  }
  const login = async (index: number) => {
    expect((await page.request.post('/api/auth/login', { headers, data: accounts[index] })).ok()).toBe(true);
    await page.goto('/#/datasets');
  };
  const logout = async () => {
    expect((await page.request.post('/api/auth/logout', { headers })).ok()).toBe(true);
    expect((await page.request.get('/api/unsupervised/history')).status()).toBe(401);
  };
  await page.goto('/api/health');
  await page.evaluate(() => localStorage.setItem('unsupervised-runs-v1', 'legacy private rows'));
  await login(0);
  const row = await uploadCsv(page, 'private-first');
  expect(await page.evaluate(() => localStorage.getItem('unsupervised-runs-v1'))).toBeNull();
  await row.getByRole('button', { name: 'Open Explore', exact: true }).click();
  await page.getByRole('button', { name: /^Anomaly Detection/ }).click();
  await page.getByRole('button', { name: 'Run Isolation Forest' }).click();
  const dialog = page.getByRole('dialog', { name: 'Anomaly Detection · Isolation Forest' });
  await dialog.getByRole('button', { name: 'Save to account' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Saved to your account.');
  await logout();
  await login(1);
  const second = await page.request.get('/api/unsupervised/history');
  expect(second.ok()).toBe(true);
  expect((await second.json()).data).toEqual([]);
  const secondDataset = await uploadCsv(page, 'private-second');
  await secondDataset.getByRole('button', { name: 'Open Explore', exact: true }).click();
  await page.getByRole('button', { name: /^Anomaly Detection/ }).click();
  await expect(page.getByText(/Analysis history \(/)).toHaveCount(0);
  await logout();
  await login(0);
  const first = await page.request.get('/api/unsupervised/history');
  expect((await first.json()).data).toMatchObject([{ dataset: expect.stringContaining('private-first') }]);

  const csv = await readFile(new URL('../fixtures/round2-demo.csv', import.meta.url));
  const upload = (name: string) => page.request.post('/api/datasets/upload', {
    headers, multipart: { file: { name, mimeType: 'text/csv', buffer: csv } },
  });
  const usage = async () => (await (await page.request.get('/api/datasets/usage')).json()).data;
  expect(await usage()).toMatchObject({ fileCount: 1, usedBytes: csv.length, maxFiles: 2 });
  const responses = await Promise.all([upload('concurrent-a.csv'), upload('concurrent-b.csv')]);
  expect(responses.map(response => response.status()).sort()).toEqual([201, 409]);
  const created = await responses.find(response => response.status() === 201)!.json();
  const blocked = await responses.find(response => response.status() === 409)!.json();
  expect(blocked.error.code).toBe('DATASET_QUOTA_EXCEEDED');
  expect(await usage()).toMatchObject({ fileCount: 2, usedBytes: 2 * csv.length });
  await page.reload();
  await expect(page.getByText(/2 \/ 2 files/)).toBeVisible();
  const datasetPath = '/api/datasets/' + encodeURIComponent(created.data.id);
  await logout();
  expect((await page.request.get('/api/datasets/usage')).status()).toBe(401);
  await login(1);
  expect(await usage()).toMatchObject({ fileCount: 1, usedBytes: csv.length });
  expect((await page.request.get(datasetPath + '/download')).status()).toBe(404);
  await logout();
  await login(0);
  expect((await page.request.delete(datasetPath, { headers })).status()).toBe(200);
  expect(await usage()).toMatchObject({ fileCount: 1, usedBytes: csv.length });
  expect((await upload('replacement.csv')).status()).toBe(201);
});

test('GridFS maintenance previews and removes only eligible files', async () => {
  const port = process.env.LAB_E2E_HISTORY_MONGO_PORT;
  test.skip(!port, 'Requires the isolated local MongoDB test service.');
  const uri = `mongodb://127.0.0.1:${port}`;
  const client = new MongoClient(uri);
  const db = client.db('maintenance_test_' + randomUUID().replaceAll('-', ''));
  const bucket = new GridFSBucket(db, { bucketName: 'dataset_files' });
  const owner = new ObjectId();
  const old = new Date(Date.now() - 9 * 86_400_000);
  const file = Buffer.from('x,y,z\n1,2,3\n');
  const run = async (execute: boolean) => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      '--import', 'tsx', 'backend/src/maintenance/purgeDatasets.ts', ...(execute ? ['--execute'] : []),
    ], { env: { ...process.env, LAB_MAINTENANCE_URI: uri, LAB_MAINTENANCE_DATABASE: db.databaseName,
      LAB_DATASET_RETENTION_DAYS: '7', LAB_MAINTENANCE_WRITES_PAUSED: execute ? '1' : '' } });
    return JSON.parse(stdout);
  };
  const entries = ['active', 'recent-trash', 'old-trash', 'old-orphan', 'wrong-metadata'];
  try {
    for (const id of entries) {
      const fileId = new ObjectId();
      const version = new ObjectId();
      await pipeline([file], bucket.openUploadStreamWithId(fileId, id + '.csv', {
        metadata: { datasetId: id === 'wrong-metadata' ? 'elsewhere' : id },
      }));
      if (id === 'old-orphan') {
        await db.collection<QuotaLedger>('dataset_quotas').insertOne({ _id: owner, items: [{ id, fileId, bytes: file.length, reservedAt: old }] });
        continue;
      }
      await db.collection('dataset_versions').insertOne({ _id: version, datasetId: id, fileId });
      await db.collection('datasets').insertOne({ id, ownerId: owner, currentVersionId: version,
        ...(id !== 'active' && { deletedAt: id === 'recent-trash' ? new Date() : old }) });
    }
    expect(await run(false)).toMatchObject({ dryRun: true, trash: 1, orphanReservations: 1, skipped: 1, fileBytes: file.length * 2 });
    expect(await db.collection('dataset_files.chunks').countDocuments()).toBe(5);
    expect(await run(true)).toMatchObject({ dryRun: false, trash: 1, orphanReservations: 1, skipped: 1 });
    expect((await bucket.find().sort({ filename: 1 }).toArray()).map(entry => entry.filename))
      .toEqual(['active.csv', 'recent-trash.csv', 'wrong-metadata.csv']);
    expect(await db.collection('dataset_files.chunks').countDocuments()).toBe(3);
    expect(await db.collection('dataset_versions').countDocuments()).toBe(3);
    expect(await db.collection('datasets').countDocuments()).toBe(3);
    expect(await run(true)).toMatchObject({ dryRun: false, trash: 0, orphanReservations: 0, skipped: 1 });
  } finally {
    await client.close();
  }
});
