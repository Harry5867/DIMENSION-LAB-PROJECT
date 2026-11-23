import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@dimension-lab/contracts/demo';
import { sampleDatasets } from '@dimension-lab/contracts';
import { MAX_CSV_BYTES, parseCSVString } from '@dimension-lab/algorithms/dataParser';
import { reduceMatrix } from '@dimension-lab/algorithms/projection';
import { computeDBSCAN } from '@dimension-lab/algorithms/dbscan';

test('isolated HTTP: sessions, roles, sample data, CSV CRUD and compute contract', { timeout: 45_000 }, async () => {
  const port = process.env.LAB_TEST_PORT || '5318';
  const origin = 'http://127.0.0.1:' + port;
  const api = origin + '/api';
  const server = spawn(process.execPath, ['--import', 'tsx', 'backend/src/index.ts'], {
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
    return { ...await response.json(), status: response.status, cache: response.headers.get('X-Cache'),
      requestId: response.headers.get('X-Request-Id') };
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
    const openApiResponse = await fetch(origin + '/openapi.json');
    assert.equal(openApiResponse.status, 200);
    const openApi = await openApiResponse.json() as { openapi: string; paths: Record<string, unknown> };
    assert.equal(openApi.openapi, '3.0.3');
    assert.ok(openApi.paths['/api/compute']);
    assert.ok(openApi.paths['/api/datasets/upload']);
    assert.equal(openApi.paths['/api/v1/analyses'], undefined, 'docs must not describe unmounted branch APIs');
    const docsResponse = await fetch(origin + '/docs/');
    assert.equal(docsResponse.status, 200);
    assert.match(docsResponse.headers.get('content-type') || '', /text\/html/);
    assert.match(await docsResponse.text(), /swagger-ui/);

    const health = await call('/health');
    assert.match(health.data.database, /In-Memory/);
    assert.equal(health.database, undefined);
    assert.match(health.requestId, /^[\da-f-]{36}$/);
    const crossOrigin = await fetch(api + '/auth/login', {
      method: 'OPTIONS', headers: { Origin: 'https://example.test', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(crossOrigin.headers.get('Access-Control-Allow-Origin'), null);
    assert.deepEqual((await call('/auth/me')).data, { authenticated: false, user: null });
    const unauthorized = await call('/datasets?marker=private-test-marker');
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.message, undefined);
    assert.equal(typeof unauthorized.error.message, 'string');
    assert.notEqual(unauthorized.requestId, health.requestId);
    for (let i = 0; i < 30 && !logs.includes(unauthorized.requestId); i++) await delay(20);
    assert.ok(logs.includes('"requestId":"' + unauthorized.requestId + '"'));
    assert.ok(!logs.includes('private-test-marker'));
    for (const path of ['/datasets', '/datasets/usage', '/datasets/cancer_wdbc', '/experiments', '/system-health']) {
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
    assert.equal((await call('/system-health', 'GET', undefined, admin)).status, 200);
    assert.equal((await call('/system-health', 'GET', undefined, researcher)).status, 403);
    assert.equal((await call('/datasets/usage', 'GET', undefined, researcher)).data, null);
    const missing = await call('/no-such-api', 'GET', undefined, admin);
    assert.equal(missing.status, 404);
    assert.equal(missing.error.code, 'NOT_FOUND');
    const malformed = await fetch(api + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.ok(malformed.headers.get('X-Request-Id'));
    assert.equal((await call('/auth/me', 'GET', undefined, admin)).data.authenticated, true);
    assert.equal((await call('/cache', 'DELETE')).status, 401);
    assert.equal((await call('/cache', 'DELETE', undefined, viewer)).status, 403);
    const sampleList = await call('/datasets', 'GET', undefined, viewer);
    assert.deepEqual(sampleList.data.filter((item: { is_preloaded?: boolean }) => item.is_preloaded)
      .map((item: { id: string }) => item.id).sort(), sampleDatasets.map(sample => sample.id).sort());
    for (const sample of sampleDatasets) {
      const source = readFileSync('public/' + sample.assetPath, 'utf8');
      const local = parseCSVString(source);
      const samplePath = '/datasets/' + sample.id;
      const result = await call(samplePath, 'GET', undefined, viewer);
      assert.equal(result.data.totalRows, sample.total_rows);
      assert.deepEqual(result.data.rawRows, local.rawRows);
      assert.deepEqual(result.data.features, local.featureColumns);
      assert.equal(result.data.labelColumn, local.labelColumn);
      assert.equal((await call(samplePath, 'PATCH', { name: 'Renamed' }, admin)).status, 403);
      assert.equal((await call(samplePath, 'DELETE', undefined, admin)).status, 403);
      const preview = await call(samplePath + '/preview', 'GET', undefined, viewer);
      assert.deepEqual(preview.data.rows, local.rawRows.slice(0, 20));
      const download = await fetch(api + samplePath + '/download', { headers: { Authorization: 'Bearer ' + viewer } });
      assert.equal(download.status, 200);
      assert.ok(download.headers.get('Content-Disposition')?.includes(sample.filename));
      assert.equal(await download.text(), source);
    }
    const content = 'id,label,a,b,c\n001,A,0,2,3\n002,B,,3,4\n003,B,2,4,5';
    assert.equal((await call('/datasets/upload', 'POST', csv(content))).status, 401);
    assert.equal((await call('/datasets/upload', 'POST', csv(content), viewer)).status, 403);
    assert.equal((await call('/datasets/upload', 'POST', csv(content + ',9'), admin)).status, 400);
    assert.equal((await call('/datasets/upload', 'POST', csv('x'.repeat(MAX_CSV_BYTES + 1)), admin)).status, 413);
    const upload = await call('/datasets/upload', 'POST', csv(content), researcher);
    assert.equal(upload.status, 201);
    assert.equal(upload.id, undefined);
    assert.equal(upload.rawRows, undefined);
    assert.equal(upload.data.rawRows.length, 3);
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

test('production headers and workload limits apply to authenticated requests', { timeout: 25_000 }, async () => {
  const port = process.env.LAB_LIMIT_TEST_PORT || '5321';
  const local = 'http://127.0.0.1:' + port;
  const origin = 'https://workspace.test';
  const server = spawn(process.execPath, ['--import', 'tsx', 'backend/src/index.ts'], {
    env: { ...process.env, NODE_ENV: 'production', LAB_STORAGE_MODE: 'demo', PORT: port, LAB_BIND_HOST: '127.0.0.1',
      LAB_AUTH_EMAIL: DEMO_EMAIL, LAB_AUTH_PASSWORD: DEMO_PASSWORD, LAB_ALLOWED_ORIGIN: origin,
      LAB_ENABLE_HSTS: '1', LAB_UPLOADS_PER_MINUTE: '1', LAB_ANALYSES_PER_MINUTE: '2', LAB_ANALYSIS_CONCURRENCY: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(server, 'close');
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  try {
    for (let i = 0; !logs.includes('Running on'); i++) {
      assert.ok(i < 100 && server.exitCode === null, logs);
      await delay(100);
    }
    const getHealth = (requestOrigin: string) => fetch(local + '/api/health', { headers: { Origin: requestOrigin } });
    const health = await getHealth(origin);
    assert.equal(health.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal((await getHealth('http://localhost:3000')).headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(health.headers.get('X-Powered-By'), null);
    assert.equal(health.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(health.headers.get('Content-Security-Policy-Report-Only') ?? '', /default-src 'self'/);
    assert.match(health.headers.get('Strict-Transport-Security') ?? '', /max-age=/);
    const post = (path: string, data: object, token?: string) => fetch(local + '/api' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(data),
    });
    const login = await post('/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const token = (await login.json()).data.token as string;
    assert.equal((await post('/compute', {})).status, 401);
    const pending = httpRequest(local + '/api/compute', { method: 'POST', headers: {
      Expect: '100-continue', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': '2',
    } });
    const receiving = once(pending, 'continue');
    const completed = once(pending, 'response');
    try {
      pending.flushHeaders();
      await receiving;
      const busy = await post('/unsupervised', {}, token);
      assert.equal(busy.status, 429);
      assert.equal(busy.headers.get('Retry-After'), '2');
      assert.equal((await busy.json()).error.code, 'WORKLOAD_BUSY');
    } finally {
      pending.end('{}');
      const [response] = await completed;
      response.resume();
      assert.equal(response.statusCode, 400);
    }
    assert.equal((await post('/compute', {}, token)).status, 400);
    const throttle = await post('/unsupervised', {}, token);
    assert.equal(throttle.status, 429);
    assert.ok(Number(throttle.headers.get('Retry-After')) > 0);
    assert.equal((await throttle.json()).error.code, 'RATE_LIMITED');
    assert.equal((await post('/datasets/upload', {}, token)).status, 400);
    assert.equal((await post('/datasets/upload', {}, token)).status, 429);
    if (process.platform !== 'win32') {
      server.kill('SIGTERM');
      const [code, signal] = await closed;
      assert.equal(code, 0);
      assert.equal(signal, null);
      assert.ok(logs.includes('"event":"server.shutdown","signal":"SIGTERM"'));
    }
  } finally {
    server.kill();
    await closed;
  }
});

test('Atlas startup failure returns 503 and cannot fall back to demo authentication', { timeout: 20_000 }, async () => {
  const port = Number(process.env.LAB_TEST_PORT || 5318) + 1;
  const api = 'http://127.0.0.1:' + port + '/api';
  const server = spawn(process.execPath, ['--import', 'tsx', 'backend/src/index.ts'], {
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
    assert.deepEqual((await options.json()).data, { mode: 'atlas', google: false, registration: true });
    assert.equal((await fetch(api + '/auth/google')).status, 503);
    assert.equal((await fetch(api + '/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }) })).status, 403);
    for (const endpoint of ['register', 'login']) {
      const response = await fetch(api + '/auth/' + endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, displayName: 'Test' }),
      });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    assert.equal((await fetch(api + '/datasets', { headers: { Cookie: 'lab_session=' + 'a'.repeat(43) } })).status, 503);
    assert.equal((await fetch(api + '/auth/logout', { method: 'POST', headers: { Origin: 'http://localhost:4000' } })).status, 403);
  } finally {
    server.kill();
    await closed;
  }
});
