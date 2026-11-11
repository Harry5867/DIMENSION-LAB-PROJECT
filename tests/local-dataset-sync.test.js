import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MongoClient } from 'mongodb';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const serverPath = fileURLToPath(new URL('../server/local-data-server.js', import.meta.url));
const mongoUri = process.env.LOCAL_SYNC_TEST_MONGODB_URI;
const columns = ['sample', 'value'];
const clientHeader = { 'x-dimension-lab-client': 'database-workbench' };
const accountPassword = 'Pineapple_Orbit_7';

async function availablePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

async function request(base, path, { method = 'GET', cookie, data, status = 200 } = {}) {
  const headers = new Headers(clientHeader);
  if (cookie) headers.set('cookie', cookie);
  if (data !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(base + path, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  assert.equal(response.status, status, method + ' ' + path + ' returned ' + JSON.stringify(body.error ?? ''));
  assert.equal(body.success, status < 400);
  return { data: body.data, headers: response.headers };
}

async function launch(port, databaseName) {
  const base = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [serverPath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      LOCAL_DATA_PORT: String(port),
      MONGODB_URI: mongoUri,
      MONGODB_DB_NAME: databaseName,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let logs = '';
  child.stderr.on('data', chunk => { logs = (logs + chunk.toString()).slice(-3000); });
  const closed = new Promise(resolve => child.once('close', resolve));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    const timeout = new AbortController();
    try {
      await Promise.race([
        closed,
        delay(5000, undefined, { signal: timeout.signal }).then(() => {
          throw new Error('Local data API did not exit.');
        }),
      ]);
    } finally {
      timeout.abort();
    }
  };

  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) });
        const health = await response.json();
        if (response.ok && health.data?.mongoConnected) return { base, stop };
      } catch { /* The loopback API may still be starting. */ }
      await delay(100);
    }
    throw new Error('Local data API did not become healthy. ' + logs);
  } catch (error) {
    await stop();
    throw error;
  }
}

async function register(base, name) {
  const { data, headers } = await request(base, '/api/auth/register', {
    method: 'POST',
    data: { name, email: randomUUID() + '@example.test', password: accountPassword },
    status: 201,
  });
  return { id: data.user.id, cookie: headers.get('set-cookie').split(';', 1)[0] };
}

function makeRows(prefix, count) {
  return Array.from({ length: count }, (_, rowIndex) => ({
    recordId: 'row_' + rowIndex,
    rowIndex,
    values: { sample: prefix + '-' + rowIndex, value: String(rowIndex) },
  }));
}

function rowsData(rows) {
  return rows.map(({ recordId, rowIndex, values }) => ({ recordId, rowIndex, values }));
}

const datasetPath = id => '/api/datasets/' + id;
const list = async (base, user) => (await request(base, '/api/datasets', { cookie: user.cookie })).data;
const page = async (base, user, id, query = '', status = 200) => (
  await request(base, datasetPath(id) + '/rows' + query, { cookie: user.cookie, status })
).data;

function start(base, user, { id, syncId, baseRevision = null, rowCount, name = id }, status = 200) {
  return request(base, '/api/datasets/sync/start', {
    method: 'POST',
    cookie: user.cookie,
    data: { syncId, baseRevision, dataset: { id, name, filename: id + '.csv', columns, rowCount } },
    status,
  }).then(result => result.data);
}

function batch(base, user, id, syncId, rows, status = 200) {
  return request(base, datasetPath(id) + '/rows/batch', {
    method: 'POST', cookie: user.cookie, data: { syncId, rows }, status,
  }).then(result => result.data);
}

function finish(base, user, id, syncId, status = 200) {
  return request(base, datasetPath(id) + '/sync/finish', {
    method: 'POST', cookie: user.cookie, data: { syncId }, status,
  }).then(result => result.data);
}

async function publish(base, user, input, rows) {
  const started = await start(base, user, { ...input, rowCount: rows.length });
  for (let offset = 0; offset < rows.length; offset += 500) {
    const chunk = rows.slice(offset, offset + 500);
    const accepted = await batch(base, user, input.id, input.syncId, chunk);
    assert.equal(accepted.receivedRows, chunk.length);
  }
  return { started, finished: await finish(base, user, input.id, input.syncId) };
}

async function assertIndex(collection, keys, unique = false) {
  const indexes = await collection.indexes();
  assert.ok(indexes.some(index => JSON.stringify(index.key) === JSON.stringify(keys)
    && Boolean(index.unique) === unique), 'Missing compatible index ' + JSON.stringify(keys));
}

test('local dataset sync against isolated MongoDB', {
  skip: !mongoUri && 'Set LOCAL_SYNC_TEST_MONGODB_URI to an isolated loopback MongoDB with an explicit port.',
  timeout: 90000,
}, async t => {
  const address = new URL(mongoUri);
  assert.equal(address.protocol, 'mongodb:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) && address.port,
    'An explicit loopback MongoDB port is required.');
  const client = new MongoClient(mongoUri, {
    directConnection: true, serverSelectionTimeoutMS: 4000, connectTimeoutMS: 4000,
  });
  const databaseName = 'dimension_lab_sync_test_' + randomUUID().replaceAll('-', '');
  const db = client.db(databaseName);
  let service;
  let needsCleanup = false;
  try {
    await client.connect();
    await db.command({ ping: 1 });
    needsCleanup = true;
    const datasets = db.collection('user_datasets');
    const rows = db.collection('user_dataset_rows');
    const conflicts = db.collection('dataset_conflicts');
    const conflictRows = db.collection('dataset_conflict_rows');
    const versions = db.collection('dataset_versions');

    // Reproduce the pre-existing workbench indexes before the new API initializes.
    await Promise.all([
      datasets.createIndex({ ownerId: 1, id: 1 }, { unique: true }),
      datasets.createIndex({ ownerId: 1, updatedAt: -1 }),
      rows.createIndex({ ownerId: 1, datasetId: 1, recordId: 1 }, { unique: true }),
      rows.createIndex({ ownerId: 1, datasetId: 1, rowIndex: 1 }),
      conflicts.createIndex({ ownerId: 1, datasetId: 1, createdAt: -1 }),
      conflicts.createIndex({ ownerId: 1, datasetId: 1, syncId: 1 }, { unique: true }),
      conflictRows.createIndex({ ownerId: 1, conflictId: 1, rowIndex: 1 }),
    ]);

    const port = await availablePort();
    service = await launch(port, databaseName);
    const owner = await register(service.base, 'Alice Test');
    const other = await register(service.base, 'Bob Test');
    const legacyId = 'legacy-owned';
    const sourceRows = makeRows('legacy', 3);
    const oldTime = new Date('2026-11-01T00:00:00Z');
    await datasets.insertOne({
      ownerId: owner.id, id: legacyId, name: 'Legacy dataset', filename: legacyId + '.csv',
      columns, rowCount: sourceRows.length, revision: 4, syncStatus: 'ready',
      createdAt: oldTime, updatedAt: oldTime,
    });
    await rows.insertMany(sourceRows.map(row => ({
      ...row, ownerId: owner.id, datasetId: legacyId, syncId: 'legacy-sync', updatedAt: oldTime,
    })));
    await versions.insertOne({
      ownerId: owner.id, datasetId: legacyId, syncId: 'legacy-sync', revision: 4, rowCount: 3, createdAt: oldTime,
    });
    const analytics = [
      ['datasets', { id: 'cancer_wdbc', rawRows: [{ diagnosis: 'B' }] }],
      ['experiments', { datasetId: 'cancer_wdbc', reductionMethod: 'PCA' }],
      ['compute_cache', { cacheKey: 'legacy-cache', result: { points: [[1, 2, 3]] } }],
    ];
    for (const [name, document] of analytics) await db.collection(name).insertOne({ ...document });

    await t.test('existing indexes, ready rows, pagination, and owner boundaries', async () => {
      const { base } = service;
      await assertIndex(datasets, { ownerId: 1, id: 1 }, true);
      await assertIndex(datasets, { ownerId: 1, updatedAt: -1 });
      await assertIndex(rows, { ownerId: 1, datasetId: 1, recordId: 1 }, true);
      await assertIndex(rows, { ownerId: 1, datasetId: 1, rowIndex: 1 });
      await assertIndex(conflicts, { ownerId: 1, datasetId: 1, syncId: 1 }, true);
      assert.equal((await list(base, owner))[0].revision, 4);
      assert.deepEqual(await list(base, other), []);
      const first = await page(base, owner, legacyId, '?limit=1');
      assert.equal(first.nextAfter, 0);
      assert.deepEqual(rowsData(first.rows), sourceRows.slice(0, 1));
      const remaining = await page(base, owner, legacyId, '?after=0&limit=2&expectedRevision=4');
      assert.deepEqual(rowsData(remaining.rows), sourceRows.slice(1));
      await page(base, owner, legacyId, '?expectedRevision=3', 409);
      await page(base, other, legacyId, '', 404);
      await request(base, datasetPath(legacyId), { method: 'PATCH', cookie: other.cookie, data: { name: 'Denied' }, status: 404 });
      await request(base, datasetPath(legacyId) + '/rows/row_0', {
        method: 'PATCH', cookie: other.cookie, data: { values: { sample: 'Denied' } }, status: 404,
      });
      await request(base, datasetPath(legacyId), { method: 'DELETE', cookie: other.cookie, status: 404 });
      await request(base, '/api/datasets', { status: 401 });
    });

    await t.test('interrupted initial sync, retry, incomplete finish, and durable finish replay', async () => {
      const id = 'offline-retry';
      const syncId = 'offline-retry-operation';
      const newRows = makeRows('new', 3);
      const input = { id, syncId, rowCount: newRows.length };
      const original = await start(service.base, owner, input);
      assert.equal(original.conflict, false);
      assert.equal(original.serverRevision, 0);
      await batch(service.base, owner, id, syncId, newRows.slice(0, 1));
      assert.equal((await list(service.base, owner)).some(dataset => dataset.id === id), false);
      await page(service.base, owner, id, '', 404);
      await finish(service.base, owner, id, syncId, 409);

      // A stopped API cannot finish the upload. Retry the same persisted sync after restart.
      await service.stop();
      service = undefined;
      await assert.rejects(fetch('http://127.0.0.1:' + port + '/api/health', { signal: AbortSignal.timeout(1000) }), TypeError);
      service = await launch(port, databaseName);
      assert.deepEqual(await start(service.base, owner, input), original);
      const replayedBatch = await batch(service.base, owner, id, syncId, newRows.slice(0, 1));
      assert.equal(replayedBatch.receivedRows, 1);
      await batch(service.base, owner, id, syncId, newRows.slice(1));
      const completed = await finish(service.base, owner, id, syncId);
      assert.equal(completed.revision, 1);
      assert.equal(completed.rowCount, 3);
      await service.stop();
      service = undefined;
      service = await launch(port, databaseName);
      const replayedStart = await start(service.base, owner, input);
      assert.deepEqual(replayedStart, { ...original, completed: true, revision: completed.revision });
      const replayAfterFinish = await batch(service.base, owner, id, syncId, newRows.slice(0, 1));
      assert.equal(replayAfterFinish.receivedRows, 1);
      assert.equal(replayAfterFinish.upsertedRows, 0);
      assert.deepEqual(await finish(service.base, owner, id, syncId), completed);
      assert.equal(await versions.countDocuments({ ownerId: owner.id, datasetId: id, syncId }), 1);
      assert.deepEqual(rowsData((await page(service.base, owner, id)).rows), newRows);
    });

    await t.test('stale offline changes archive the committed revision before atomic publication', async () => {
      const { base } = service;
      const id = legacyId;
      const replacementRows = makeRows('replacement', 2);
      const onlineRows = makeRows('legacy', 3);
      onlineRows[0].values.value = 'edited-online';
      const renamed = await request(base, datasetPath(id), {
        method: 'PATCH', cookie: owner.cookie, data: { name: 'Online rename' },
      });
      assert.equal(renamed.data.revision, 5);
      await request(base, datasetPath(id) + '/rows/row_0', {
        method: 'PATCH', cookie: owner.cookie, data: { values: onlineRows[0].values },
      });
      assert.equal((await page(base, owner, id)).dataset.revision, 6);
      const syncId = 'stale-operation';
      const input = { id, syncId, baseRevision: 4, name: 'Offline replacement', rowCount: replacementRows.length };
      const started = await start(base, owner, input);
      assert.equal(started.conflict, true);
      assert.equal(started.serverRevision, 6);
      assert.equal(started.archivedRows, 3);
      assert.deepEqual(await start(base, owner, input), started);
      await batch(base, owner, id, syncId, replacementRows.slice(0, 1));
      const during = await page(base, owner, id);
      assert.equal(during.dataset.revision, 6);
      assert.equal(during.dataset.name, 'Online rename');
      assert.deepEqual(rowsData(during.rows), onlineRows);
      assert.equal((await list(base, owner)).find(dataset => dataset.id === id).rowCount, 3);
      await finish(base, owner, id, syncId, 409);
      await batch(base, owner, id, syncId, replacementRows.slice(1));
      const completed = await finish(base, owner, id, syncId);
      assert.equal(completed.revision, 7);
      assert.deepEqual(await finish(base, owner, id, syncId), completed);
      const after = await page(base, owner, id);
      assert.equal(after.dataset.name, 'Offline replacement');
      assert.deepEqual(rowsData(after.rows), replacementRows);
      const { data: archive } = await request(base, datasetPath(id) + '/conflicts', { cookie: owner.cookie });
      assert.equal(archive.length, 1);
      assert.equal(archive[0].serverRevision, 6);
      assert.equal(archive[0].serverName, 'Online rename');
      assert.equal(archive[0].archivedRows, 3);
      const path = datasetPath(id) + '/conflicts/' + archive[0].conflictId + '/rows';
      const { data: snapshot } = await request(base, path, { cookie: owner.cookie });
      assert.deepEqual(rowsData(snapshot.rows), onlineRows);
      assert.deepEqual((await request(base, datasetPath(id) + '/conflicts', { cookie: other.cookie })).data, []);
      await request(base, path, { cookie: other.cookie, status: 404 });
    });

    await t.test('future base is rejected, and a superseded concurrent upload cannot publish', async () => {
      const { base } = service;
      const id = 'offline-retry';
      const futureId = 'future-operation';
      await start(base, owner, { id, syncId: futureId, baseRevision: 20, rowCount: 1 }, 409);
      await start(base, owner, { id: 'future-new', syncId: 'future-new-operation', baseRevision: 1, rowCount: 1 }, 409);
      assert.equal(await conflicts.countDocuments({ ownerId: owner.id, datasetId: id, syncId: futureId }), 0);
      assert.equal(await datasets.countDocuments({ ownerId: owner.id, id: 'future-new' }), 0);
      assert.equal((await page(base, owner, id)).dataset.revision, 1);
      const input = { id, syncId: 'owner-concurrent', baseRevision: 1, rowCount: 1 };
      const [left, right] = await Promise.all([start(base, owner, input), start(base, owner, input)]);
      assert.deepEqual(left, right);
      await start(base, owner, { ...input, name: 'Different manifest with reused ID' }, 409);
      const stagedRows = makeRows('superseded', 1);
      await batch(base, owner, id, input.syncId, stagedRows);
      await batch(base, owner, id, input.syncId, makeRows('different row with reused ID', 1), 409);
      const winner = { ...input, syncId: 'different-operation' };
      await start(base, owner, winner);
      await batch(base, owner, id, input.syncId, stagedRows, 409);
      await finish(base, owner, id, input.syncId, 409);
      await finish(base, other, id, winner.syncId, 409);
      const competingRows = makeRows('other-owner', 1);
      const isolated = await publish(base, other, { id, syncId: winner.syncId }, competingRows);
      assert.equal(isolated.finished.revision, 1);
      const ownerRows = makeRows('owner-winner', 1);
      await batch(base, owner, id, winner.syncId, ownerRows);
      const [first, second] = await Promise.all([
        finish(base, owner, id, winner.syncId), finish(base, owner, id, winner.syncId),
      ]);
      assert.deepEqual(first, second);
      assert.equal(first.revision, 2);
      assert.equal(await versions.countDocuments({ ownerId: owner.id, datasetId: id, syncId: winner.syncId }), 1);
      assert.deepEqual(rowsData((await page(base, owner, id)).rows), ownerRows);
      assert.deepEqual(rowsData((await page(base, other, id)).rows), competingRows);
    });

    await t.test('experiment history uses the authenticated owner and the committed dataset revision', async () => {
      const { base } = service;
      const path = '/api/experiments';
      const experiment = {
        datasetId: legacyId,
        datasetName: 'Untrusted client name',
        ownerId: other.id,
        revision: 7,
        reductionMethod: 'PCA',
        clusteringMethod: 'K-Means',
        k: 2,
        silhouetteScore: 0.4,
        ari: null,
        params: { seed: 42 },
      };
      await request(base, path, { method: 'POST', cookie: owner.cookie, data: { ...experiment, revision: 6 }, status: 409 });
      await request(base, path, { method: 'POST', cookie: other.cookie, data: experiment, status: 404 });
      await request(base, path, { method: 'POST', data: experiment, status: 401 });
      const saved = await request(base, path, { method: 'POST', cookie: owner.cookie, data: experiment, status: 201 });
      assert.equal(typeof saved.data.id, 'string');
      const history = (await request(base, path, { cookie: owner.cookie })).data;
      assert.equal(history.length, 1);
      assert.equal(history[0].id, saved.data.id);
      assert.equal(history[0].dataset_id, legacyId);
      assert.equal(history[0].dataset_name, 'Offline replacement');
      assert.equal(history[0].dataset_revision, 7);
      assert.equal(history[0].ownerId, undefined);
      assert.deepEqual((await request(base, path, { cookie: other.cookie })).data, []);
      const stored = await db.collection('user_experiments').findOne({ dataset_id: legacyId });
      assert.equal(stored.ownerId, owner.id);
      assert.equal(stored.dataset_revision, 7);
    });

    await t.test('analytics collections remain unchanged', async () => {
      for (const [name, original] of analytics) {
        const stored = await db.collection(name).find({}, { projection: { _id: 0 } }).toArray();
        assert.deepEqual(stored, [original]);
      }
    });

    await t.test('deletion revokes access and blocks delayed sync replay', async () => {
      const { base } = service;
      const id = 'deleted-dataset';
      const input = { id, syncId: 'deleted-sync', rowCount: 1 };
      const original = makeRows('deleted', 1);
      await publish(base, owner, input, original);
      const remove = () => request(base, datasetPath(id), { method: 'DELETE', cookie: owner.cookie });
      await request(base, datasetPath(id), { method: 'DELETE', cookie: other.cookie, status: 404 });
      assert.equal((await remove()).data.deleted, true);
      assert.equal((await remove()).data.deleted, true);
      assert.ok(!(await list(base, owner)).some(dataset => dataset.id === id));
      await page(base, owner, id, '', 404);
      await start(base, owner, input, 409);
      await finish(base, owner, id, input.syncId, 409);
      assert.equal(await db.collection('user_dataset_revision_rows').countDocuments({ ownerId: owner.id, datasetId: id }), 0);
    });

    await t.test('measure ordinary replacement and offline-wins archive on identical 501-row inputs', async t => {
      const { base } = service;
      const size = 501;
      const rounds = 5;
      const samples = { ordinary: [], archived: [] };
      const initialRows = makeRows('original', size);
      const replacementRows = makeRows('replacement', size);
      for (let round = 0; round < rounds; round += 1) {
        const order = round % 2 === 0 ? ['ordinary', 'archived'] : ['archived', 'ordinary'];
        for (const mode of order) {
          const id = 'timing-' + mode + '-' + round;
          const { finished: original } = await publish(base, owner, { id, syncId: 'timing-seed' }, initialRows);
          const timestamp = performance.now();
          const { started, finished } = await publish(base, owner, {
            id, syncId: 'timing-replacement', baseRevision: mode === 'archived' ? 0 : original.revision,
          }, replacementRows);
          samples[mode].push(performance.now() - timestamp);
          assert.equal(started.archivedRows, mode === 'archived' ? size : 0);
          assert.equal(finished.rowCount, size);
          assert.equal(finished.revision, original.revision + 1);
        }
      }
      for (const [mode, timings] of Object.entries(samples)) {
        const sorted = [...timings].sort((a, b) => a - b);
        t.diagnostic(mode + ' replacement, 501 rows, 5 samples: median=' + sorted[2].toFixed(2)
          + ' ms; samples=' + timings.map(duration => duration.toFixed(2)).join(', ') + ' ms');
      }
      const plan = await db.collection('user_dataset_revision_rows').find({
        ownerId: owner.id, datasetId: 'timing-ordinary-4', syncId: 'timing-replacement', rowIndex: { $gt: 20 },
      }).sort({ rowIndex: 1 }).limit(20).explain('executionStats');
      assert.match(JSON.stringify(plan.queryPlanner.winningPlan), /ownerId_1_datasetId_1_syncId_1_rowIndex_1/);
      assert.equal(plan.executionStats.nReturned, 20);
      assert.equal(plan.executionStats.totalDocsExamined, 20);
      t.diagnostic('Row page index examined ' + plan.executionStats.totalDocsExamined + ' documents for 20 returned rows.');
    });
  } finally {
    try {
      await service?.stop();
    } finally {
      try {
        if (needsCleanup) await db.dropDatabase();
      } finally {
        await client.close();
      }
    }
  }
});
