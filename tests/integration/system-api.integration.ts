import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@dimension-lab/contracts/demo';
import { MAX_CSV_BYTES, parseCSVString } from '@dimension-lab/algorithms/dataParser';
import { reduceMatrix } from '@dimension-lab/algorithms/projection';
import { computeDBSCAN } from '@dimension-lab/algorithms/dbscan';

test('isolated HTTP: sessions, roles, sample data, CSV CRUD and compute contract', { timeout: 45_000 }, async () => {
  const port = process.env.LAB_TEST_PORT || '5318';
  const api = 'http://127.0.0.1:' + port + '/api';
  const server = spawn(process.execPath, ['--import', 'tsx', 'backend/src/index.ts'], {
    env: { ...process.env, NODE_ENV: 'test', LAB_STORAGE_MODE: 'demo', PORT: port, LAB_BIND_HOST: '127.0.0.1',
      MONGODB_URI: 'mongodb://127.0.0.1:1/dimension_lab_test', LAB_AUTH_EMAIL: DEMO_EMAIL, LAB_AUTH_PASSWORD: DEMO_PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(server, 'close');
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  async function call(path: string, method = 'GET', body?: object, token?: string, idempotencyKey?: string) {
    const headers = new Headers();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    if (body && !(body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(api + path, {
      method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    return { ...await response.json(), status: response.status, cache: response.headers.get('X-Cache') };
  }
  async function waitForJob(id: string, token: string, version = 'v1') {
    for (let attempt = 0; attempt < 200; attempt++) {
      const response = await call(`/${version}/jobs/${id}`, 'GET', undefined, token);
      assert.equal(response.status, 200);
      if (response.data.status === 'succeeded') return response.data;
      if (response.data.status === 'failed') assert.fail(response.data.error?.message ?? `API ${version} job failed.`);
      await delay(50);
    }
    assert.fail(`API ${version} job did not finish in time.`);
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
    const live = await fetch(`http://127.0.0.1:${port}/livez`);
    assert.equal(live.status, 200);
    assert.ok(live.headers.get('X-Request-ID'));
    assert.equal(live.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(live.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(live.headers.get('X-Powered-By'), null);
    const traced = await fetch(api + '/health', { headers: { 'X-Request-ID': 'integration-trace-1' } });
    assert.equal(traced.headers.get('X-Request-ID'), 'integration-trace-1');
    assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200);
    const docs = await fetch(`http://127.0.0.1:${port}/docs/`);
    assert.equal(docs.status, 200);
    assert.match(await docs.text(), /swagger-ui/);
    const openapiResponse = await fetch(`http://127.0.0.1:${port}/openapi.json`);
    assert.equal(openapiResponse.status, 200);
    const openapi = await openapiResponse.json();
    assert.match(openapi.info.description, /Delivery is at least once/);
    const health = await call('/health');
    assert.match(health.data.database, /In-Memory/);
    const crossOrigin = await fetch(api + '/auth/login', {
      method: 'OPTIONS', headers: { Origin: 'https://example.test', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(crossOrigin.headers.get('Access-Control-Allow-Origin'), null);
    const idempotencyPreflight = await fetch(api + '/v1/analyses', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'idempotency-key,x-request-id',
      },
    });
    assert.equal(idempotencyPreflight.status, 204);
    assert.match(idempotencyPreflight.headers.get('Access-Control-Allow-Headers')!, /Idempotency-Key/i);
    assert.match(idempotencyPreflight.headers.get('Access-Control-Allow-Headers')!, /X-Request-ID/i);
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
    const oversizedJson = await fetch(api + '/v1/analyses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + researcher, 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(1_100_000) }),
    });
    assert.equal(oversizedJson.status, 413);
    assert.equal((await call('/metrics')).status, 401);
    assert.equal((await call('/metrics', 'GET', undefined, viewer)).status, 403);
    const metrics = await fetch(api + '/metrics', { headers: { Authorization: 'Bearer ' + admin } });
    assert.equal(metrics.status, 200);
    assert.match(metrics.headers.get('Content-Type')!, /text\/plain/);
    assert.match(await metrics.text(), /dimension_lab_http_requests_total/);
    assert.equal((await call('/auth/me', 'GET', undefined, admin)).data.authenticated, true);
    const v1Login = await call('/v1/auth/login', 'POST', { email: DEMO_EMAIL, password: DEMO_PASSWORD, role: 'admin' });
    assert.equal(v1Login.status, 200);
    assert.equal((await call('/v1/auth/me', 'GET', undefined, v1Login.data.token)).data.authenticated, true);
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

    assert.equal((await call('/v1/auth/me', 'GET', undefined, admin)).data.authenticated, true);
    assert.equal((await call('/v1/health')).status, 200);
    assert.deepEqual((await call('/v1/datasets/cancer_wdbc/versions', 'GET', undefined, researcher)).data.map(
      (item: { version: number }) => item.version), [1]);
    const mixedNumericCsv = 'a,b,c\n' + Array.from({ length: 10 }, (_, index) =>
      `${index === 4 ? 'invalid' : index},${index + 1},${index + 2}`).join('\n');
    assert.equal((await call('/v1/datasets', 'POST', csv(mixedNumericCsv), researcher)).status, 400);
    const v1Upload = await call('/v1/datasets', 'POST', csv(content), researcher);
    assert.equal(v1Upload.status, 201);
    const v1DatasetPath = '/v1/datasets/' + v1Upload.data.id;
    const secondVersion = await call(v1DatasetPath + '/versions', 'POST',
      csv('id,label,a,b,c\n001,A,0,2,3\n002,B,5,3,4\n003,B,2,4,5'), researcher);
    assert.equal(secondVersion.status, 201);
    assert.equal(secondVersion.data.version, 2);
    const originalPreview = await call(v1DatasetPath + '/versions/1/preview', 'GET', undefined, researcher);
    const updatedPreview = await call(v1DatasetPath + '/versions/2/preview', 'GET', undefined, researcher);
    assert.equal(originalPreview.data.rows[1].a, null);
    assert.equal(updatedPreview.data.rows[1].a, 5);
    const uploadedQuality = await call(v1DatasetPath + '/versions/1/quality-checks', 'POST', {},
      researcher, 'quality-check-idem-1');
    const duplicateQuality = await call(v1DatasetPath + '/versions/1/quality-checks', 'POST', {},
      researcher, 'quality-check-idem-1');
    assert.equal(duplicateQuality.data.id, uploadedQuality.data.id);
    const publicQueuedJob = await call('/v1/jobs/' + uploadedQuality.data.id, 'GET', undefined, researcher);
    assert.equal(publicQueuedJob.data.ownerId, undefined);
    assert.equal(publicQueuedJob.data.payload, undefined);
    const uploadedQualityJob = await waitForJob(uploadedQuality.data.id, researcher);
    assert.equal(uploadedQualityJob.result.missingValues, 1);
    assert.equal(uploadedQualityJob.result.status, 'review');
    assert.ok(uploadedQualityJob.result.recommendations.some((item: { code: string; rationale: string }) =>
      item.code === 'MISSING_VALUES' && item.rationale.length > 20));
    const uploadedPreprocessing = await call('/v1/preprocessing-runs', 'POST', {
      datasetId: v1Upload.data.id, version: 1, normalization: 'none', features: ['a', 'b', 'c'],
    }, researcher);
    const uploadedPreprocessingJob = await waitForJob(uploadedPreprocessing.data.id, researcher);
    assert.equal(uploadedPreprocessingJob.result.outputVersion.version, 3);
    const processedPreview = await call(v1DatasetPath + '/versions/3/preview', 'GET', undefined, researcher);
    assert.equal(processedPreview.data.rows[1].a, 1);
    assert.equal((await call(v1DatasetPath, 'DELETE', undefined, admin)).status, 200);
    const quality = await call('/v1/datasets/cancer_wdbc/versions/1/quality-checks', 'POST', {}, viewer);
    assert.equal(quality.status, 202);
    const qualityJob = await waitForJob(quality.data.id, viewer);
    assert.equal(qualityJob.result.datasetId, 'cancer_wdbc');
    assert.equal(qualityJob.result.totalRows, 569);
    const preprocessing = await call('/v1/preprocessing-runs', 'POST', {
      datasetId: 'cancer_wdbc', version: 1, normalization: 'none',
    }, researcher);
    assert.equal(preprocessing.status, 202);
    const preprocessingJob = await waitForJob(preprocessing.data.id, researcher);
    assert.equal(preprocessingJob.result.outputVersion.version, 2);
    assert.equal((await call('/v1/datasets/cancer_wdbc/versions', 'GET', undefined, researcher)).data.length, 2);
    const invalidAnalysis = await call('/v1/analyses', 'POST', {
      datasetId: 'cancer_wdbc',
      features: ['radius_mean', 'texture_mean', 'perimeter_mean'],
      reduction: { method: 'PCA', normalization: 'none', iteration: 250 },
      clustering: { method: 'K-Means', k: 2 },
    }, researcher);
    assert.equal(invalidAnalysis.status, 400);
    const analysis = await call('/v1/analyses', 'POST', {
      datasetId: 'cancer_wdbc',
      version: 2,
      features: ['radius_mean', 'texture_mean', 'perimeter_mean'],
      reduction: { method: 'PCA', normalization: 'none' },
      clustering: { method: 'K-Means', k: 2 },
    }, researcher);
    assert.equal(analysis.status, 202);
    const analysisJob = await waitForJob(analysis.data.id, researcher);
    assert.equal(analysisJob.result.result.coordinates.length, 569);
    const visualization = await call('/v1/analyses/' + analysis.data.id + '/visualization', 'GET', undefined, researcher);
    assert.equal(visualization.data.type, 'scatter3d');
    assert.equal(visualization.data.points.length, 569);
    assert.equal((await call('/v1/analyses/' + analysis.data.id + '/evaluation', 'GET', undefined, researcher)).status, 200);

    const v2Upload = await call('/v2/datasets', 'POST', csv([
      'id,label,x,y,z',
      'p1,A,0,0,0', 'p2,A,0.5,0.05,0.1', 'p3,A,1,0.1,0.2',
      'p4,B,20,2,4', 'p5,B,20.5,2.05,4.1', 'p6,B,21,2.1,4.2', 'p7,B,1000,100,200',
    ].join('\n')), researcher);
    assert.equal(v2Upload.status, 201);
    const v2Analysis = await call('/v2/analyses', 'POST', {
      datasetId: v2Upload.data.id,
      features: ['x', 'y', 'z'],
      reduction: { method: 'PCA', normalization: 'none' },
      clustering: { method: 'DBSCAN', epsilon: 1.1, minPts: 2 },
    }, researcher);
    assert.equal(v2Analysis.status, 202, JSON.stringify(v2Analysis));
    const v2AnalysisJob = await waitForJob(v2Analysis.data.id, researcher, 'v2');
    assert.equal(v2AnalysisJob.result.result.pointDiagnostics.summary.noiseCount, 1);
    assert.equal(v2AnalysisJob.result.result.pointDiagnostics.summary.outlierCount, 1);
    const v2PointsPath = `/v2/analyses/${v2Analysis.data.id}/points`;
    const v2Points = await call(v2PointsPath, 'GET', undefined, researcher);
    assert.deepEqual(v2Points.data.map((point: { label: string }) => point.label), ['A', 'A', 'A', 'B', 'B', 'B', 'B']);
    assert.equal(v2Points.data[6].isNoise, true);
    assert.equal(v2Points.data[6].isOutlier, true);
    assert.equal((await call(`/v2/analyses/${v2Analysis.data.id}/evaluation`, 'GET', undefined, researcher)).data.outliers.outlierCount, 1);
    const filtered = await call(`/v2/analyses/${v2Analysis.data.id}/points/filter`, 'POST', { action: 'exclude-noise' }, researcher);
    assert.equal(filtered.data.excludedCount, 1);
    assert.equal((await call(v2PointsPath, 'GET', undefined, researcher)).data.length, 6);
    assert.equal((await call(v2PointsPath + '?includeExcluded=true', 'GET', undefined, researcher)).data[6].excluded, true);
    assert.equal((await call(`/v2/analyses/${v2Analysis.data.id}/points/6/restore`, 'POST', {}, researcher)).data.excluded, false);
    assert.equal((await call(v2PointsPath, 'GET', undefined, researcher)).data.length, 7);
    assert.equal((await call(`/v2/analyses/${v2Analysis.data.id}/points/filter`, 'POST',
      { action: 'exclude-outliers' }, researcher)).data.excludedCount, 1);
    assert.equal((await call(`/v2/analyses/${v2Analysis.data.id}/points/filter`, 'POST',
      { action: 'restore-all' }, researcher)).data.excludedCount, 0);
    assert.equal((await call(`/v2/analyses/${v2Analysis.data.id}/points/filter`, 'POST',
      { action: 'exclude-outliers-and-noise' }, researcher)).data.excludedCount, 1);
    assert.equal((await call(v2PointsPath, 'GET', undefined, researcher)).data.length, 6);
    assert.equal((await call(`/v2/analyses/${v2Analysis.data.id}/points/filter`, 'POST',
      { action: 'restore-all' }, researcher)).data.excludedCount, 0);
    for (const reduction of [
      { method: 't-SNE', normalization: 'none', perplexity: 2, learningRate: 50, iterations: 10, nNeighbors: 2, minDist: 0.1 },
      { method: 'UMAP', normalization: 'none', perplexity: 2, learningRate: 50, iterations: 10, nNeighbors: 2, minDist: 0.1 },
    ]) {
      const projection = await call('/v2/analyses', 'POST', {
        datasetId: v2Upload.data.id,
        features: ['x', 'y', 'z'],
        reduction,
        clustering: { method: 'GMM', k: 2, epsilon: 1.1, minPts: 2, gmmIterations: 20, seed: 42 },
      }, researcher);
      assert.equal(projection.status, 202);
      const projectionJob = await waitForJob(projection.data.id, researcher, 'v2');
      assert.equal(projectionJob.result.result.coordinates.length, 7);
      assert.equal(projectionJob.result.result.clusterAssignments.length, 7);
      assert.equal(projectionJob.result.result.gmm.probabilities.length, 7);
    }
    const tuning = await call('/v2/analyses/optimize', 'POST', {
      datasetId: v2Upload.data.id,
      features: ['x', 'y', 'z'],
      reduction: { method: 'PCA', normalization: 'none', perplexity: 30, learningRate: 100,
        iterations: 250, nNeighbors: 15, minDist: 0.1 },
      clustering: { method: 'DBSCAN', k: 2, epsilon: 1.1, minPts: 2 },
    }, researcher);
    assert.equal(tuning.status, 202, JSON.stringify(tuning));
    const tuningJob = await waitForJob(tuning.data.id, researcher, 'v2');
    assert.ok(tuningJob.result.candidatesEvaluated > 0);
    assert.ok(tuningJob.result.best);

    const report = await call('/v1/analyses/' + analysis.data.id + '/reports', 'POST', { format: 'html' }, researcher);
    assert.equal(report.status, 202);
    await waitForJob(report.data.id, researcher);
    const downloadedReport = await fetch(api + '/v1/reports/' + report.data.id + '/download', {
      headers: { Authorization: 'Bearer ' + researcher },
    });
    assert.equal(downloadedReport.status, 200);
    assert.match(await downloadedReport.text(), /Analysis report/);
    const users = await call('/v1/users', 'GET', undefined, admin);
    assert.equal(users.status, 200);
    assert.equal((await call('/v1/users/user_01', 'GET', undefined, admin)).data.role, 'admin');
    assert.equal((await call('/v1/users', 'GET', undefined, viewer)).status, 403);
    assert.equal((await call('/auth/logout', 'POST', undefined, admin)).status, 200);
    assert.equal((await call('/v1/auth/logout', 'POST', undefined, researcher)).status, 200);
    assert.equal((await call('/datasets', 'GET', undefined, admin)).status, 401);
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
