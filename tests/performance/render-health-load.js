import http from 'k6/http';
import { check } from 'k6';

const baseUrl = (__ENV.BASE_URL || 'https://dimension-lab-project.onrender.com').replace(/\/$/, '');

export const options = {
  scenarios: {
    render_health: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 2,
      maxVUs: 10,
      stages: [
        { duration: '30s', target: 1 },
        { duration: '30s', target: 2 },
        { duration: '30s', target: 5 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    dropped_iterations: ['count==0'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/api/health`);
  check(response, {
    'health endpoint returns HTTP 200': (res) => res.status === 200,
    'service and Atlas report healthy': (res) => res.json('data.status') === 'ok',
  });
}
