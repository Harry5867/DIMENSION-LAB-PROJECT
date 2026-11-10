import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../src/utils/demoSession';
import { MAX_CSV_BYTES, parseCSVString } from '../src/utils/dataParser';
import { reduceMatrix } from '../src/utils/exploration';
import { computeDBSCAN } from '../src/algorithms/dbscan';

test('isolated HTTP: sessions, roles, sample data, CSV CRUD and compute contract', { timeout: 45_000 }, async () => {
  const port = process.env.LAB_TEST_PORT || '5318';
  const api = 'http://127.0.0.1:' + port + '/api';
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, NODE_ENV: 'test', LAB_STORAGE_MODE: 'demo', PORT: port, LAB_BIND_HOST: '127.0.0.1',
      MONGODB_URI: 'mongodb://127.0.0.1:1/dimension_lab_test', LAB_AUTH_EMAIL: DEMO_EMAIL, LAB_AUTH_PASSWORD: DEMO_PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(server, 'close');
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  async function call(path: string, method = 'GET', body?: object, token?: string) {
    const headers = new Headers();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (body && !(body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(api + path, {
      method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    return { ...await response.json(), status: response.status, cache: response.headers.get('X-Cache') };
  }
  const csv = (content: string) => {
    const form = new FormData();
    form.append('file', new Blob([content]), 'test.csv');
    return form;
  };
  try {
    for (let i = 0; !logs.includes('Running on'); i++) {
      assert.ok(i < 80 && server.exitCode === null, 'Isolated server failed to start: ' + logs);
      await delay(100);
    }
    const health = await call('/health');
    assert.match(health.data.database, /In-Memory/);
    const crossOrigin = await fetch(api + '/auth/login', {
      method: 'OPTIONS', headers: { Origin: 'https://example.test', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(crossOrigin.headers.get('Access-Control-Allow-Origin'), null);
    assert.deepEqual((await call('/auth/me')).data, { authenticated: false, user: null });
    for (const path of ['/datasets', '/datasets/cancer_wdbc', '/experiments', '/system-health']) {
      assert.equal((await call(path)).status, 401);
    }
    assert.equal((await call('/auth/login', 'POST', { role: 'admin' })).status, 401);
    assert.equal((await call('/auth/login', 'POST', { email: DEMO_EMAIL, password: 'bad' })).status, 401);
    for (const token of ['admin_token', 'constructor', '__proto__']) {
      assert.equal((await call('/datasets', 'GET', undefined, token)).status, 401);
    }
    const login = async (role: string) => {
      const result = await call('/auth/login', 'POST', { email: DEMO_EMAIL, password: DEMO_PASSWORD, role });
      assert.equal(result.status, 200);
      assert.equal(result.data.user.role, role);
      return String(result.data.token);
    };
    const admin = await login('admin');
    const researcher = await login('researcher');
    const viewer = await login('viewer');
    assert.equal((await call('/auth/me', 'GET', undefined, admin)).data.authenticated, true);
    assert.equal((await call('/cache', 'DELETE')).status, 401);
    assert.equal((await call('/cache', 'DELETE', undefined, viewer)).status, 403);
    assert.equal((await call('/datasets/cancer_wdbc', 'DELETE', undefined, admin)).status, 403);

    for (const [id, file, rows] of [['cancer_wdbc', 'data.csv', 569], ['wholesale_customers', 'wholesale.csv', 440]] as const) {
      const local = parseCSVString(readFileSync('public/' + file, 'utf8'));
      const result = await call('/datasets/' + id, 'GET', undefined, viewer);
      assert.equal(result.data.totalRows, rows);
      assert.deepEqual(result.data.rawRows, local.rawRows);
      assert.deepEqual(result.data.features, local.featureColumns);
      assert.equal(result.data.labelColumn, local.labelColumn);
    }
    const content = 'id,label,a,b,c\n001,A,0,2,3\n002,B,,3,4\n003,B,2,4,5';
    assert.equal((await call('/datasets/upload', 'POST', csv(content))).status, 401);
    assert.equal((await call('/datasets/upload', 'POST', csv(content), viewer)).status, 403);
    assert.equal((await call('/datasets/upload', 'POST', csv(content + ',9'), admin)).status, 400);
    assert.equal((await call('/datasets/upload', 'POST', csv('x'.repeat(MAX_CSV_BYTES + 1)), admin)).status, 413);
    const upload = await call('/datasets/upload', 'POST', csv(content), researcher);
    assert.equal(upload.status, 201);
    const path = '/datasets/' + upload.data.id;
    const firstPage = await fetch(api + '/datasets?limit=1', { headers: { Authorization: 'Bearer ' + admin } });
    assert.equal((await firstPage.json()).data.length, 1);
    assert.equal(firstPage.headers.get('X-Next-Offset'), '1');
    assert.equal((await call('/datasets?offset=-1', 'GET', undefined, admin)).status, 400);
    const preview = await call(path + '/preview', 'GET', undefined, admin);
    assert.equal(preview.data.rows.length, 3);
    assert.equal(preview.data.rawRows, undefined);
    const download = await fetch(api + path + '/download', { headers: { Authorization: 'Bearer ' + admin } });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('Content-Disposition')!, /attachment/);
    assert.equal(await download.text(), content);
    const read = await call(path, 'GET', undefined, admin);
    assert.deepEqual(read.data.rawRows.map((row: { id: string; a: number | null }) => [row.id, row.a]),
      [['001', 0], ['002', null], ['003', 2]]);
    assert.equal((await call(path, 'PATCH', { name: 'Renamed test dataset' }, researcher)).status, 200);
    assert.equal((await call(path, 'GET', undefined, admin)).data.name, 'Renamed test dataset');
    assert.equal((await call(path, 'DELETE', undefined, researcher)).status, 403);
    assert.equal((await call(path, 'DELETE', undefined, admin)).status, 200);
    assert.equal((await call(path, 'GET', undefined, admin)).status, 404);

    const matrix = [[0, 0, 0], [1, 0, 0], [10, 0, 0]];
    const reductionConfig = { method: 'PCA', normalization: 'none', perplexity: 30, learningRate: 100,
      iterations: 250, nNeighbors: 15, minDist: 0.1 } as const;
    const clusteringConfig = { method: 'None', k: 2, epsilon: 1.1, minPts: 2 } as const;
    const payload = { matrix, groundTruth: [], reductionConfig, clusteringConfig };
    const run = (body = payload) => call('/compute', 'POST', body, admin);
    const miss = await run();
    const hit = await run();
    assert.deepEqual([miss.status, miss.cache, hit.status, hit.cache], [200, 'MISS', 200, 'HIT']);
    const local = reduceMatrix(matrix, reductionConfig);
    assert.deepEqual(miss.data.coordinates, local.coordinates);
    assert.deepEqual(hit.data.coordinates, local.coordinates);
    assert.deepEqual(miss.data.clusterAssignments, []);
    assert.deepEqual(miss.data.clusterCounts, {});
    assert.equal(miss.data.silhouetteScore, null);
    assert.equal(miss.data.adjustedRandIndex, null);
    const density = await call('/compute', 'POST', { ...payload, clusteringConfig: { ...clusteringConfig, method: 'DBSCAN' } }, admin);
    assert.deepEqual(density.data.clusterAssignments, computeDBSCAN(local.coordinates, 1.1, 2).clusters);
    assert.deepEqual(density.data.clusterAssignments, [0, 0, -1]);
    assert.equal((await run({ ...payload, matrix: [[1], [2, 3]] })).status, 400);
    assert.equal((await call('/compute', 'POST', { ...payload, clusteringConfig: { ...clusteringConfig, method: 'K-Means', k: 4 } }, admin)).status, 400);
    assert.equal((await call('/cache', 'DELETE', undefined, admin)).status, 200);
    assert.equal((await run()).cache, 'MISS');
    assert.equal((await call('/auth/logout', 'POST', undefined, admin)).status, 200);
    assert.equal((await call('/datasets', 'GET', undefined, admin)).status, 401);
  } finally {
    server.kill();
    await closed;
  }
});

test('Atlas startup failure returns 503 and cannot fall back to demo authentication', { timeout: 20_000 }, async () => {
  const port = Number(process.env.LAB_TEST_PORT || 5318) + 1;
  const api = 'http://127.0.0.1:' + port + '/api';
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, NODE_ENV: 'test', LAB_STORAGE_MODE: 'atlas', PORT: String(port),
      LAB_BIND_HOST: '127.0.0.1', MONGODB_URI: 'mongodb://127.0.0.1:1', MONGODB_DB: 'dimension_lab_test',
      GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(server, 'close');
  let ready = false;
  server.stdout.on('data', chunk => { if (String(chunk).includes('Running on')) ready = true; });
  try {
    for (let i = 0; !ready; i++) {
      assert.ok(i < 120 && server.exitCode === null, 'Atlas-mode server did not start.');
      await delay(100);
    }
    const health = await fetch(api + '/health');
    assert.equal(health.status, 503);
    assert.equal((await health.json()).error.code, 'STORAGE_UNAVAILABLE');
    const options = await fetch(api + '/auth/options');
    assert.deepEqual((await options.json()).data, { mode: 'atlas', google: false });
    assert.equal((await fetch(api + '/auth/google')).status, 503);
    assert.equal((await fetch(api + '/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }) })).status, 401);
    assert.equal((await fetch(api + '/datasets', { headers: { Cookie: 'lab_session=' + 'a'.repeat(43) } })).status, 503);
    assert.equal((await fetch(api + '/auth/logout', { method: 'POST', headers: { Origin: 'http://localhost:4000' } })).status, 403);
  } finally {
    server.kill();
    await closed;
  }
});
