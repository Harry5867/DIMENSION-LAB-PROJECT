type JobEvent = 'enqueued' | 'succeeded' | 'failed' | 'retry';

const requestCounts = new Map<string, number>();
const requestDurations = new Map<string, { count: number; sum: number; buckets: number[] }>();
const jobEvents = new Map<string, number>();
const durationBucketsMs = [50, 100, 250, 500, 1000, 5000, 10000];

function label(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

export function recordHttpRequest(method: string, route: string, status: number, durationMs: number) {
  const key = `${method}\u0000${route}\u0000${status}`;
  requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
  const durationKey = `${method}\u0000${route}`;
  const histogram = requestDurations.get(durationKey) ?? { count: 0, sum: 0, buckets: durationBucketsMs.map(() => 0) };
  histogram.count += 1;
  histogram.sum += durationMs / 1000;
  durationBucketsMs.forEach((bucket, index) => {
    if (durationMs <= bucket) histogram.buckets[index] += 1;
  });
  requestDurations.set(durationKey, histogram);
}

export function recordJobEvent(type: string, event: JobEvent) {
  const key = `${type}\u0000${event}`;
  jobEvents.set(key, (jobEvents.get(key) ?? 0) + 1);
}

export function renderMetrics(queueCounts: Record<string, number>) {
  const lines = [
    '# HELP dimension_lab_http_requests_total Completed HTTP requests.',
    '# TYPE dimension_lab_http_requests_total counter',
  ];
  for (const [key, count] of requestCounts) {
    const [method, route, status] = key.split('\u0000');
    lines.push(`dimension_lab_http_requests_total{method="${label(method)}",route="${label(route)}",status="${status}"} ${count}`);
  }
  lines.push(
    '# HELP dimension_lab_http_request_duration_seconds HTTP request duration.',
    '# TYPE dimension_lab_http_request_duration_seconds histogram',
  );
  for (const [key, histogram] of requestDurations) {
    const [method, route] = key.split('\u0000');
    durationBucketsMs.forEach((bucket, index) => lines.push(
      `dimension_lab_http_request_duration_seconds_bucket{method="${label(method)}",route="${label(route)}",le="${bucket / 1000}"} ${histogram.buckets[index]}`,
    ));
    lines.push(`dimension_lab_http_request_duration_seconds_bucket{method="${label(method)}",route="${label(route)}",le="+Inf"} ${histogram.count}`);
    lines.push(`dimension_lab_http_request_duration_seconds_sum{method="${label(method)}",route="${label(route)}"} ${histogram.sum}`);
    lines.push(`dimension_lab_http_request_duration_seconds_count{method="${label(method)}",route="${label(route)}"} ${histogram.count}`);
  }
  lines.push('# HELP dimension_lab_api_jobs_total API job lifecycle events.', '# TYPE dimension_lab_api_jobs_total counter');
  for (const [key, count] of jobEvents) {
    const [type, event] = key.split('\u0000');
    lines.push(`dimension_lab_api_jobs_total{type="${label(type)}",event="${event}"} ${count}`);
  }
  lines.push('# HELP dimension_lab_api_jobs API jobs retained by state.', '# TYPE dimension_lab_api_jobs gauge');
  for (const [status, count] of Object.entries(queueCounts)) {
    lines.push(`dimension_lab_api_jobs{status="${label(status)}"} ${count}`);
  }
  const memory = process.memoryUsage();
  lines.push(
    '# HELP dimension_lab_process_uptime_seconds Node.js process uptime.',
    '# TYPE dimension_lab_process_uptime_seconds gauge',
    `dimension_lab_process_uptime_seconds ${process.uptime()}`,
    '# HELP dimension_lab_process_resident_memory_bytes Resident memory in bytes.',
    '# TYPE dimension_lab_process_resident_memory_bytes gauge',
    `dimension_lab_process_resident_memory_bytes ${memory.rss}`,
    '# HELP dimension_lab_process_heap_used_bytes Heap memory used in bytes.',
    '# TYPE dimension_lab_process_heap_used_bytes gauge',
    `dimension_lab_process_heap_used_bytes ${memory.heapUsed}`,
    '',
  );
  return lines.join('\n');
}
