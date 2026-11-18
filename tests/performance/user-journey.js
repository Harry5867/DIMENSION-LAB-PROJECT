/* global open, __VU, __ITER */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const profile = (__ENV.PROFILE || 'load').toLowerCase();
const runSalt = (Number(__ENV.RUN_ID) || Date.now()) % 1_000_000;
const csvFile = open('../fixtures/round2-demo.csv', 'b');
const journeySuccess = new Rate('journey_success');
const journeyDuration = new Trend('journey_duration', true);

const profiles = {
  'load-lite': {
    executor: 'ramping-vus',
    startVUs: 1,
    stages: [
      { duration: '20s', target: 1 },
      { duration: '20s', target: 2 },
      { duration: '25s', target: 2 },
      { duration: '10s', target: 0 },
    ],
    gracefulRampDown: '5s',
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 1,
    stages: [
      { duration: '20s', target: 1 },
      { duration: '20s', target: 2 },
      { duration: '25s', target: 4 },
      { duration: '10s', target: 0 },
    ],
    gracefulRampDown: '5s',
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 1,
    stages: [
      { duration: '20s', target: 2 },
      { duration: '20s', target: 4 },
      { duration: '20s', target: 6 },
      { duration: '20s', target: 8 },
      { duration: '10s', target: 0 },
    ],
    gracefulRampDown: '5s',
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 1,
    stages: [
      { duration: '20s', target: 1 },
      { duration: '2s', target: 4 },
      { duration: '25s', target: 4 },
      { duration: '2s', target: 1 },
      { duration: '20s', target: 1 },
      { duration: '5s', target: 0 },
    ],
    gracefulRampDown: '5s',
  },
  soak: {
    executor: 'constant-vus',
    vus: 1,
    duration: '5m',
    gracefulStop: '5s',
  },
};

if (!profiles[profile]) {
  throw new Error(`Unknown PROFILE "${profile}". Choose load-lite, load, stress, spike, or soak.`);
}

export const options = {
  scenarios: { user_journey: profiles[profile] },
  thresholds: {
    journey_success: ['rate>0.95'],
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_duration: [{ threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '15s' }],
    dropped_iterations: ['count==0'],
  },
};

function passed(response, name, predicate) {
  return check(response, { [name]: predicate });
}

export default function () {
  const startedAt = Date.now();
  let workflowOK = false;
  let token;
  let datasetId;
  const headers = { 'Content-Type': 'application/json' };

  try {
    const login = http.post(`${baseUrl}/api/auth/login`, JSON.stringify({
      email: __ENV.DEMO_EMAIL || 'demo@dimension.lab',
      password: __ENV.DEMO_PASSWORD || 'Dimension123!',
      role: 'admin',
    }), { headers, tags: { stage: 'login' } });

    if (!passed(login, 'login succeeds', (res) => res.status === 200)) return;
    token = login.json('data.token');
    if (typeof token !== 'string') return;

    const auth = { Authorization: `Bearer ${token}` };
    const list = http.get(`${baseUrl}/api/datasets?limit=20`, { headers: auth, tags: { stage: 'dataset_list' } });
    if (!passed(list, 'dataset list returns HTTP 200', (res) => res.status === 200)) return;

    const upload = http.post(`${baseUrl}/api/datasets/upload`, {
      file: http.file(csvFile, `k6-${profile}-${__VU}-${__ITER}.csv`, 'text/csv'),
    }, { headers: auth, tags: { stage: 'upload' } });
    if (!passed(upload, 'CSV upload returns HTTP 201', (res) => res.status === 201)) return;
    datasetId = upload.json('data.id');
    if (typeof datasetId !== 'string') return;

    const datasetResponse = http.get(`${baseUrl}/api/datasets/${encodeURIComponent(datasetId)}`, {
      headers: auth,
      tags: { stage: 'dataset_read' },
    });
    if (!passed(datasetResponse, 'uploaded dataset can be opened', (res) => res.status === 200)) return;

    const dataset = datasetResponse.json('data');
    const features = dataset?.features;
    const rows = dataset?.rawRows;
    if (!Array.isArray(features) || features.length < 3 || !Array.isArray(rows) || rows.length < 3) return;

    const seed = (__VU * 1000) + __ITER;
    const matrix = rows.map((row, rowIndex) => features.map((feature, featureIndex) => {
      const value = Number(row[feature]);
      return rowIndex === 0 && featureIndex === 0
        ? value + ((runSalt * 100_000) + seed + 1) / 100_000_000_000
        : value;
    }));
    const groundTruth = dataset.labelColumn
      ? rows.map((row) => row[dataset.labelColumn] ?? null)
      : [];

    const compute = http.post(`${baseUrl}/api/compute`, JSON.stringify({
      matrix,
      groundTruth,
      reductionConfig: {
        method: 'PCA', normalization: 'z-score', perplexity: 30, learningRate: 100,
        iterations: 250, nNeighbors: 15, minDist: 0.1,
      },
      clusteringConfig: { method: 'None', k: 2, epsilon: 1, minPts: 2 },
    }), {
      headers: { ...auth, 'Content-Type': 'application/json' },
      timeout: '45s',
      tags: { stage: 'compute' },
    });
    if (!passed(compute, 'PCA compute returns HTTP 200', (res) => res.status === 200)) return;
    if (!passed(compute, 'PCA result is not served from cache', (res) => res.headers['X-Cache'] === 'MISS')) return;

    const download = http.get(`${baseUrl}/api/datasets/${encodeURIComponent(datasetId)}/download`, {
      headers: auth,
      tags: { stage: 'download' },
    });
    if (!passed(download, 'CSV download succeeds', (res) => res.status === 200 && res.body.length > 0)) return;

    workflowOK = true;
  } finally {
    if (datasetId && token) {
      const remove = http.del(`${baseUrl}/api/datasets/${encodeURIComponent(datasetId)}`, null, {
        headers: { Authorization: `Bearer ${token}` },
        tags: { stage: 'cleanup' },
      });
      if (!passed(remove, 'temporary dataset cleanup succeeds', (res) => res.status === 200)) workflowOK = false;
    }
    if (token) {
      const logout = http.post(`${baseUrl}/api/auth/logout`, null, {
        headers: { Authorization: `Bearer ${token}` },
        tags: { stage: 'logout' },
      });
      if (!passed(logout, 'logout succeeds', (res) => res.status === 200)) workflowOK = false;
    }
    journeySuccess.add(workflowOK);
    journeyDuration.add(Date.now() - startedAt);
    sleep(1);
  }
}
