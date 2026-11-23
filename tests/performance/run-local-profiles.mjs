import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const port = 5103;
const baseUrl = `http://127.0.0.1:${port}`;
const cpuCap = 73;
const ramCap = 74;
const profiles = (process.env.K6_PROFILES || 'load,stress,spike,soak')
  .split(',').map((profile) => profile.trim()).filter(Boolean);
const k6Script = resolve(root, 'tests/performance/user-journey.js');
const reportPath = resolve(root, 'tests/performance/TEST-REPORT.md');

const reportHeader = [
  '# Local k6 performance test report',
  '',
  '> Runner tự thêm một dòng cho mỗi profile. CPU/RAM là số đo toàn máy; dữ liệu test dùng backend demo cục bộ.',
  '',
  '| Thời gian (Bangkok) | Profile | Trạng thái | Ngưỡng CPU/RAM | Thời lượng | VUs tối đa | Iterations | HTTP requests | Checks đạt | Journey thành công | HTTP lỗi | HTTP p95 | Journey p95 | CPU start/max | RAM start/max | Ghi chú |',
  '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
].join('\n') + '\n';

function getMetric(summary, name) {
  return summary?.metrics?.[name]?.values ?? {};
}

function displayCount(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : '—';
}

function displayPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '—';
}

function displayMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} ms` : '—';
}

function markdownCell(value) {
  return String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

async function recordProfile({
  profile,
  status,
  startedAt,
  durationMs,
  summary,
  cpuStart,
  cpuMax,
  ramStart,
  ramMax,
  note,
}) {
  await mkdir(dirname(reportPath), { recursive: true });
  try {
    await readFile(reportPath, 'utf8');
  } catch {
    await writeFile(reportPath, reportHeader, 'utf8');
  }

  const checks = getMetric(summary, 'checks');
  const checkTotal = (checks.passes ?? 0) + (checks.fails ?? 0);
  const checkSummary = checkTotal > 0 ? `${displayCount(checks.passes)}/${displayCount(checkTotal)}` : '—';
  const httpFailed = getMetric(summary, 'http_req_failed');
  const row = [
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium',
    }).format(startedAt),
    profile,
    status,
    `${cpuCap}% / ${ramCap}%`,
    `${Math.max(0, durationMs / 1000).toFixed(1)} s`,
    displayCount(getMetric(summary, 'vus_max').max ?? getMetric(summary, 'vus').max),
    displayCount(getMetric(summary, 'iterations').count),
    displayCount(getMetric(summary, 'http_reqs').count),
    checkSummary,
    displayPercent(getMetric(summary, 'journey_success').rate),
    displayPercent(httpFailed.rate),
    displayMs(getMetric(summary, 'http_req_duration')['p(95)']),
    displayMs(getMetric(summary, 'journey_duration')['p(95)']),
    `${displayCount(cpuStart)}% / ${displayCount(cpuMax)}%`,
    `${displayCount(ramStart)}% / ${displayCount(ramMax)}%`,
    note || '—',
  ].map(markdownCell);

  await appendFile(reportPath, `| ${row.join(' | ')} |\n`, 'utf8');
  console.log(`[REPORT] Appended ${profile} results to ${reportPath}.`);
}

async function readK6Summary(summaryPath) {
  try {
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    const metrics = summary?.metrics;
    const hasHttpCount = Number.isFinite(metrics?.http_reqs?.values?.count);
    const hasHttpLatency = Number.isFinite(metrics?.http_req_duration?.values?.['p(95)']);
    return hasHttpCount && hasHttpLatency ? summary : null;
  } catch {
    return null;
  }
}

function rateValues(points) {
  if (points.length === 0) return null;
  const passes = points.filter((value) => value > 0).length;
  return { rate: passes / points.length, passes, fails: points.length - passes };
}

function trendValues(points) {
  if (points.length === 0) return null;
  const sorted = [...points].sort((left, right) => left - right);
  const sum = points.reduce((total, value) => total + value, 0);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    avg: sum / points.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    'p(95)': sorted[p95Index],
  };
}

async function readK6PointSummary(streamPath, durationMs) {
  const metricNames = [
    'checks', 'journey_success', 'http_req_failed', 'http_req_duration', 'journey_duration',
    'http_reqs', 'iterations', 'dropped_iterations', 'vus', 'vus_max',
  ];
  const points = new Map(metricNames.map((name) => [name, []]));

  try {
    const lines = createInterface({ input: createReadStream(streamPath), crlfDelay: Infinity });
    for await (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type !== 'Point' || !points.has(event.metric)) continue;
        const value = Number(event.data?.value);
        if (Number.isFinite(value)) points.get(event.metric).push(value);
      } catch { /* Ignore a truncated final JSON line after an abrupt stop. */ }
    }
  } catch {
    return null;
  }

  const values = (name) => points.get(name) ?? [];
  const metrics = {};
  const add = (name, result) => { if (result) metrics[name] = { values: result }; };
  const counter = (name) => {
    const samples = values(name);
    return samples.length > 0 ? { count: samples.reduce((total, value) => total + value, 0) } : null;
  };
  const gauge = (name) => {
    const samples = values(name);
    return samples.length > 0
      ? {
        min: samples.reduce((minimum, value) => Math.min(minimum, value), Infinity),
        max: samples.reduce((maximum, value) => Math.max(maximum, value), -Infinity),
        value: samples.at(-1),
      }
      : null;
  };

  add('checks', rateValues(values('checks')));
  add('journey_success', rateValues(values('journey_success')));
  add('http_req_failed', rateValues(values('http_req_failed')));
  add('http_req_duration', trendValues(values('http_req_duration')));
  add('journey_duration', trendValues(values('journey_duration')));
  add('http_reqs', counter('http_reqs'));
  add('iterations', counter('iterations'));
  add('dropped_iterations', counter('dropped_iterations'));
  add('vus', gauge('vus'));
  add('vus_max', gauge('vus_max'));

  if (Object.keys(metrics).length === 0) return null;
  return {
    metrics,
    state: { testRunDurationMs: durationMs },
    partial: true,
    percentileMethod: 'nearest-rank from streamed points',
  };
}

function cpuTimes() {
  return os.cpus().map(({ times }) => times);
}

function cpuPercent(previous, current) {
  let idle = 0;
  let total = 0;
  for (let index = 0; index < current.length; index += 1) {
    const before = previous[index];
    const after = current[index];
    const idleDelta = after.idle - before.idle;
    const totalDelta = Object.keys(after).reduce((sum, key) => sum + after[key] - before[key], 0);
    idle += idleDelta;
    total += totalDelta;
  }
  return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
}

function memoryPercent() {
  return Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
}

function waitForExit(child) {
  return new Promise((resolveExit) => {
    child.once('error', (error) => resolveExit({ code: 1, signal: null, error }));
    child.once('exit', (code, signal) => resolveExit({ code: code ?? 1, signal, error: null }));
  });
}

async function waitForApi(server) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Backend exited early with code ${server.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* backend is still starting */ }
    await delay(500);
  }
  throw new Error('Local demo API did not become healthy on port 5103.');
}

async function runProfile(profile) {
  const profileStartedAt = new Date();
  const ramAtStart = memoryPercent();
  if (ramAtStart >= ramCap) {
    const note = `Not started: RAM ${ramAtStart}% reached guard ${ramCap}%`;
    await recordProfile({ profile, status: 'NOT STARTED', startedAt: profileStartedAt, durationMs: 0,
      summary: null, cpuStart: null, cpuMax: null, ramStart: ramAtStart, ramMax: ramAtStart, note });
    throw new Error(note);
  }

  let previousCpu = cpuTimes();
  await delay(1000);
  const startCpu = cpuPercent(previousCpu, cpuTimes());
  if (startCpu >= cpuCap) {
    const note = `Not started: CPU ${startCpu}% reached guard ${cpuCap}%`;
    await recordProfile({ profile, status: 'NOT STARTED', startedAt: profileStartedAt, durationMs: 0,
      summary: null, cpuStart: startCpu, cpuMax: startCpu, ramStart: ramAtStart, ramMax: ramAtStart, note });
    throw new Error(note);
  }

  console.log(`\n[PROFILE] ${profile} — local API, demo storage; stop guard CPU ${cpuCap}% / RAM ${ramCap}%`);
  const runId = `${Date.now()}-${process.pid}`;
  const summaryPath = resolve(os.tmpdir(), `dimension-lab-k6-summary-${profile}-${runId}.json`);
  const streamPath = resolve(os.tmpdir(), `dimension-lab-k6-points-${profile}-${runId}.jsonl`);
  const child = spawn('k6', [
    'run',
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `PROFILE=${profile}`,
    '-e', `RUN_ID=${Date.now()}`,
    '--out', `json=${streamPath}`,
    '--summary-export', summaryPath,
    k6Script,
  ], { cwd: root, env: process.env, stdio: 'inherit' });

  const exitPromise = waitForExit(child);
  previousCpu = cpuTimes();
  let maxCpu = startCpu;
  let maxRam = ramAtStart;
  let stopReason = '';
  let profileRecorded = false;

  async function recordExit(result) {
    if (profileRecorded) return;
    profileRecorded = true;
    const durationMs = Date.now() - profileStartedAt.getTime();
    const exportedSummary = await readK6Summary(summaryPath);
    const streamedSummary = exportedSummary ? null : await readK6PointSummary(streamPath, durationMs);
    const summary = exportedSummary ?? streamedSummary;
    const status = stopReason ? 'STOPPED' : result.error ? 'ERROR' : result.code === 0 ? 'PASSED' : 'FAILED';
    const summaryNote = exportedSummary
      ? ''
      : streamedSummary
        ? 'Metrics aggregated from live JSON points; p95 uses nearest-rank estimate'
        : 'No readable k6 summary or streamed metric points were available';
    const note = [
      stopReason,
      result.error?.message,
      result.code === 0 ? '' : `k6 exited with code ${result.code}`,
      summaryNote,
    ].filter(Boolean).join('; ');
    console.log(`[RESOURCE] ${profile}: max CPU ${maxCpu}%, max RAM ${maxRam}%.`);
    try {
      await recordProfile({ profile, status, startedAt: profileStartedAt, durationMs,
        summary, cpuStart: startCpu, cpuMax: maxCpu, ramStart: ramAtStart, ramMax: maxRam, note });
    } finally {
      await Promise.all([
        rm(summaryPath, { force: true }),
        rm(streamPath, { force: true }),
      ]);
    }
  }

  while (true) {
    const result = await Promise.race([exitPromise, delay(250).then(() => null)]);
    if (result) {
      await recordExit(result);
      if (result.error) throw result.error;
      if (stopReason) throw new Error(`${profile} stopped: ${stopReason}`);
      if (result.code !== 0) throw new Error(`${profile} exited with code ${result.code}.`);
      return;
    }

    const currentCpu = cpuTimes();
    const cpu = cpuPercent(previousCpu, currentCpu);
    const ram = memoryPercent();
    previousCpu = currentCpu;
    maxCpu = Math.max(maxCpu, cpu);
    maxRam = Math.max(maxRam, ram);
    if (cpu >= cpuCap || ram >= ramCap) {
      stopReason = `resource guard reached CPU ${cpu}% / RAM ${ram}%`;
      console.error(`[RESOURCE GUARD] ${stopReason}; stopping k6.`);
      child.kill('SIGTERM');
      const result = await exitPromise;
      await recordExit(result);
      throw new Error(`${profile} stopped: ${stopReason}`);
    }
  }
}

async function main() {
  const initialRam = memoryPercent();
  const initialCpuTimes = cpuTimes();
  await delay(1000);
  const initialCpu = cpuPercent(initialCpuTimes, cpuTimes());
  const startupBlock = initialRam >= ramCap
    ? `Current RAM is ${initialRam}%; the ${ramCap}% guard prevents starting.`
    : initialCpu >= cpuCap
      ? `Current CPU is ${initialCpu}%; the ${cpuCap}% guard prevents starting.`
      : '';

  if (startupBlock) {
    for (const profile of profiles) {
      await recordProfile({ profile, status: 'NOT STARTED', startedAt: new Date(), durationMs: 0,
        summary: null, cpuStart: initialCpu, cpuMax: initialCpu, ramStart: initialRam, ramMax: initialRam,
        note: startupBlock });
    }
    throw new Error(startupBlock);
  }

  console.log(`[RESOURCE] Baseline CPU ${initialCpu}%, RAM ${initialRam}%; stop guards CPU ${cpuCap}% / RAM ${ramCap}% (margin before 75%).`);

  const server = spawn(process.execPath, ['--import', 'tsx', 'backend/src/index.ts'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      LAB_BIND_HOST: '127.0.0.1',
      LAB_STORAGE_MODE: 'demo',
      LAB_AUTH_EMAIL: 'demo@dimension.lab',
      LAB_AUTH_PASSWORD: 'Dimension123!',
    },
    stdio: 'ignore',
  });

  let apiReady = false;
  let lastProfileIndex = -1;
  try {
    await waitForApi(server);
    apiReady = true;
    console.log(`[READY] Demo API at ${baseUrl}; baseline CPU/RAM monitor is active.`);
    for (let index = 0; index < profiles.length; index += 1) {
      lastProfileIndex = index;
      await runProfile(profiles[index]);
      await delay(3000);
    }
    console.log(`\n[COMPLETE] Profiles completed below the resource cap: ${profiles.join(', ')}.`);
  } catch (error) {
    console.error(`\n[STOPPED] ${error.message}`);
    const firstUnrecordedIndex = apiReady ? lastProfileIndex + 1 : 0;
    for (let index = firstUnrecordedIndex; index < profiles.length; index += 1) {
      await recordProfile({ profile: profiles[index], status: apiReady ? 'SKIPPED' : 'NOT STARTED',
        startedAt: new Date(), durationMs: 0, summary: null, cpuStart: initialCpu, cpuMax: initialCpu,
        ramStart: initialRam, ramMax: initialRam,
        note: apiReady ? `Skipped after ${profiles[lastProfileIndex]} did not complete` : `Local API did not start: ${error.message}` });
    }
    process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
    await waitForExit(server);
  }
}

main().catch((error) => {
  console.error(`\n[STOPPED] ${error.message}`);
  process.exitCode = 1;
});
