import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:5000';
let lastLoadStep = '';

const loadSteps = [
  { endsAt: 45, label: 'holding 5 requests/second' },
  { endsAt: 75, label: 'ramping from 5 to 20 requests/second' },
  { endsAt: 120, label: 'holding 20 requests/second' },
  { endsAt: 150, label: 'ramping from 20 to 40 requests/second' },
  { endsAt: 195, label: 'holding 40 requests/second' },
  { endsAt: 225, label: 'ramping from 40 to 60 requests/second' },
  { endsAt: 270, label: 'holding 60 requests/second' },
  { endsAt: 300, label: 'ramping from 60 to 80 requests/second' },
  { endsAt: 345, label: 'holding 80 requests/second' },
  { endsAt: 375, label: 'ramping down to 0 requests/second' },
];

export const options = {
  scenarios: {
    dataset_reads: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      stages: [
        { duration: '45s', target: 5 },
        { duration: '30s', target: 20 },
        { duration: '45s', target: 20 },
        { duration: '30s', target: 40 },
        { duration: '45s', target: 40 },
        { duration: '30s', target: 60 },
        { duration: '45s', target: 60 },
        { duration: '30s', target: 80 },
        { duration: '45s', target: 80 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [
      { threshold: 'p(95)<800', abortOnFail: true, delayAbortEval: '30s' },
    ],
    dropped_iterations: ['count==0'],
  },
};

export function setup() {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({
      email: __ENV.DEMO_EMAIL || 'demo@dimension.lab',
      password: __ENV.DEMO_PASSWORD || 'Dimension123!',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (!check(response, {
    'demo login succeeds': (res) => res.status === 200,
  })) {
    throw new Error(`Demo login failed with HTTP ${response.status}`);
  }

  const token = response.json('data.token');
  if (typeof token !== 'string') {
    throw new Error('Demo login response did not contain a session token.');
  }

  return { token };
}

export default function ({ token }) {
  const elapsedSeconds = exec.instance.currentTestRunDuration / 1000;
  const loadStep = loadSteps.find((step) => elapsedSeconds < step.endsAt);
  if (exec.vu.idInTest === 1 && loadStep && loadStep.label !== lastLoadStep) {
    console.log(`[LOAD] ${Math.floor(elapsedSeconds)}s — ${loadStep.label}`);
    lastLoadStep = loadStep.label;
  }

  const response = http.get(`${baseUrl}/api/datasets?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(response, {
    'dataset API responds with HTTP 200': (res) => res.status === 200,
  });
}
