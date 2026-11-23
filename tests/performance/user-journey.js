/* global open, __VU, __ITER */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const staging = __ENV.LAB_K6_STAGING === '1';
const profile = (__ENV.PROFILE || 'load').toLowerCase();
const runSalt = (Number(__ENV.RUN_ID) || Date.now()) % 1_000_000;
const csvFile = open(staging ? '../../public/samples/wheat-seeds.csv' : '../fixtures/round2-demo.csv', 'b');
const journeySuccess = new Rate('journey_success');
const journeyDuration = new Trend('journey_duration', true);

const profiles = {
  smoke: { executor: 'shared-iterations', vus: 1, iterations: 1, maxDuration: '45s' },
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
  throw new Error(`Unknown PROFILE "${profile}". Choose smoke, load-lite, load, stress, spike, or soak.`);
}
if (staging ? !/^https:\/\/[a-z0-9][a-z0-9.-]+(?::\d+)?$/i.test(baseUrl)
  : !/^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/i.test(baseUrl)) {
  throw new Error('Provide the HTTPS origin of the isolated staging service, or use loopback for the demo.');
}

export const options = {
  scenarios: { user_journey: profiles[profile] },
  maxRedirects: 0,
  thresholds: {
    journey_success: ['rate>0.95'],
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_duration: [{ threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '15s' }],
    'http_req_duration{stage:login}': ['p(95)<3000'],
    'http_req_duration{stage:upload}': ['p(95)<3000'],
    'http_req_duration{stage:compute}': ['p(95)<8000'],
    'http_req_duration{stage:download}': ['p(95)<3000'],
    'http_req_failed{stage:login}': ['rate==0'],
    'http_req_failed{stage:logout}': ['rate==0'],
    dropped_iterations: ['count==0'],
  },
};

function passed(response, name, predicate) {
  return check(response, { [name]: predicate });
}

function logOut(headers) {
  return http.post(`${baseUrl}/api/auth/logout`, null, { headers, tags: { stage: 'logout' } });
}

export function setup() {
  if (!staging) return [];
  const scenario = profiles[profile];
  const count = scenario.vus || Math.max(...scenario.stages.map(stage => stage.target));
  let accounts;
  try { accounts = JSON.parse(__ENV.STAGING_ACCOUNTS_JSON || '[]'); }
  catch { throw new Error('STAGING_ACCOUNTS_JSON is invalid.'); }
  if (!Array.isArray(accounts) || accounts.length < count) throw new Error(`This profile requires ${count} staging accounts.`);
  const selected = accounts.slice(0, count);
  if (selected.some(account => !account || typeof account.email !== 'string' || !account.email.trim()
    || typeof account.password !== 'string' || !account.password)
    || new Set(selected.map(account => account.email.trim().toLowerCase())).size !== count) {
    throw new Error('Provide separate, pre-verified password accounts for staging.');
  }
  const cookies = [];
  for (const { email, password } of selected) {
    const response = http.post(`${baseUrl}/api/auth/login`, JSON.stringify({ email, password }), {
      headers: { Origin: baseUrl, 'Content-Type': 'application/json' }, tags: { stage: 'login' }, timeout: '6s',
    });
    const cookie = response.cookies.lab_session?.[0]?.value;
    http.cookieJar().clear(baseUrl);
    if (!passed(response, 'staging login returns a session', (res) => res.status === 200 && !!cookie)) {
      for (const value of cookies) logOut({ Origin: baseUrl, Cookie: `lab_session=${value}` });
      throw new Error(`Staging sign-in failed with HTTP ${response.status}.`);
    }
    cookies.push(cookie);
  }
  return cookies;
}

export function teardown(cookies) {
  if (!staging) return;
  for (const cookie of cookies) {
    const response = logOut({ Origin: baseUrl, Cookie: `lab_session=${cookie}` });
    if (!passed(response, 'staging logout succeeds', (res) => res.status === 200)) {
      console.error(`Staging logout returned HTTP ${response.status}.`);
    }
  }
}

export default function (cookies) {
  const startedAt = Date.now();
  let workflowOK = false;
  let auth;
  let datasetId;

  try {
    if (staging) {
      const cookie = cookies[__VU - 1];
      if (typeof cookie !== 'string') throw new Error('Missing staging session for this virtual user.');
      auth = { Origin: baseUrl, Cookie: `lab_session=${cookie}` };
    } else {
      const login = http.post(`${baseUrl}/api/auth/login`, JSON.stringify({
        email: __ENV.DEMO_EMAIL || 'demo@dimension.lab',
        password: __ENV.DEMO_PASSWORD || 'Dimension123!',
        role: 'admin',
      }), { headers: { 'Content-Type': 'application/json' }, tags: { stage: 'login' } });
      if (!passed(login, 'login succeeds', (res) => res.status === 200)) return;
      const token = login.json('data.token');
      if (typeof token !== 'string') return;
      auth = { Authorization: `Bearer ${token}` };
    }

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
      clusteringConfig: { method: staging ? 'K-Means' : 'None', k: staging ? 3 : 2, epsilon: 1, minPts: 2 },
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
    if (datasetId && auth) {
      const remove = http.del(`${baseUrl}/api/datasets/${encodeURIComponent(datasetId)}`, null, {
        headers: auth,
        tags: { stage: 'cleanup' },
      });
      if (!passed(remove, 'temporary dataset cleanup succeeds', (res) => res.status === 200)) workflowOK = false;
    }
    if (auth && !staging) {
      const logout = logOut(auth);
      if (!passed(logout, 'logout succeeds', (res) => res.status === 200)) workflowOK = false;
    }
    journeySuccess.add(workflowOK);
    journeyDuration.add(Date.now() - startedAt);
    sleep(staging ? 5 : 1);
  }
}
