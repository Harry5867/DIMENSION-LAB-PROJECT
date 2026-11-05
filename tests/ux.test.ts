import assert from 'node:assert/strict';
import { test } from 'node:test';
import Papa from 'papaparse';
import { analysisReport, csvText, resultRows, safeFilename } from '../src/utils/exportData';
import { experimentConfiguration } from '../src/utils/history';
import { fetchWithTimeout } from '../src/utils/network';
import type { ExperimentRecord, ParsedDataset, DataPoint } from '../src/types';
import type { AnalysisSnapshot } from '../src/utils/exploration';

const configuration: AnalysisSnapshot = { datasetId: 'demo', features: ['a', 'b', 'c'], reduction: { method: 'PCA', normalization: 'z-score', perplexity: 30, learningRate: 100, iterations: 250, nNeighbors: 15, minDist: .1 }, clustering: { method: 'DBSCAN', k: 2, epsilon: .5, minPts: 2 } };
const record: ExperimentRecord = { id: 'r1', dataset_id: 'demo', dataset_name: 'Dữ liệu', reduction_method: 'PCA', clustering_method: 'DBSCAN', k: 2, silhouette_score: .4, ari: null, params: { reduction: { ...configuration.reduction }, clustering: { ...configuration.clustering }, features: configuration.features }, created_at: '2026-11-04T00:00:00Z' };

test('CSV preserves source-row identity, raw values and colliding headers after pruning', () => {
  const dataset: ParsedDataset = { name: 'Demo', totalRows: 2, headers: ['id', 'source_id', 'coord_x_3d', 'note, quoted', 'formula'], idColumn: 'id', labelColumn: null, featureColumns: [], rawRows: [
    { id: 'old', source_id: 'first', coord_x_3d: 10, 'note, quoted': 'not selected', formula: '' },
    { id: 'kept', source_id: 'second', coord_x_3d: 900, 'note, quoted': 'Tiếng Việt "đẹp"\nDòng hai', formula: '=1+1' },
  ] };
  const points: DataPoint[] = [{ id: 'kept', rowIndex: 1, originalFeatures: {}, x: 1.5, y: 2, z: 3, cluster: -1 }];
  const rows = resultRows(dataset, points, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_row, 2);
  assert.equal(rows[0].source_id, 'kept');
  assert.equal(rows[0].source_source_id, 'second');
  assert.equal(rows[0].coord_x_3d, 1.5);
  assert.equal(rows[0].source_coord_x_3d, 900);
  assert.equal(rows[0].predicted_cluster, 'Noise');
  const csv = csvText(rows);
  assert.ok(csv.startsWith('\uFEFF'));
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true }).data[0];
  assert.equal(parsed['note, quoted'], 'Tiếng Việt "đẹp"\nDòng hai');
  assert.equal(parsed.formula, "'=1+1");
  assert.equal(resultRows(dataset, points, false)[0].predicted_cluster, null);
});

test('raw CSV quotes headers and exports all provided filtered rows', () => {
  const text = csvText([{ 'a,b': 'x,y' }, { 'a,b': 'z' }], ['a,b']);
  const data = Papa.parse<Record<string, string>>(text, { header: true }).data;
  assert.equal(data.length, 2);
  assert.equal(data[0]['a,b'], 'x,y');
  assert.equal(data[1]['a,b'], 'z');
});

test('JSON report describes the executed snapshot and retained rows without copying raw data', () => {
  const dataset: ParsedDataset = { name: 'Demo', totalRows: 20, headers: [], featureColumns: [], idColumn: null, labelColumn: null, rawRows: [] };
  const point: DataPoint = { id: 'row', rowIndex: 8, originalFeatures: {}, x: 0, y: 0, z: 0, cluster: 0 };
  const report = analysisReport(dataset, [point], configuration, { silhouetteScore: null, adjustedRandIndex: null, clusterCounts: { 0: 1 } });
  assert.equal(report.dataset.sourceRows, 20);
  assert.equal(report.dataset.resultRows, 1);
  assert.deepEqual(report.retainedSourceRows, [9]);
  assert.equal(report.configuration.reduction.method, 'PCA');
  assert.ok(!('rawRows' in report.dataset));
  assert.ok(!/[<>:"/\\|?*]/.test(safeFilename('a/b:c?.csv')));
  assert.equal(safeFilename('...'), 'dataset');
});

test('history accepts complete configuration and rejects legacy or malformed records', () => {
  assert.deepEqual(experimentConfiguration(record), configuration);
  assert.equal(experimentConfiguration({ ...record, params: {} }), null);
  assert.equal(experimentConfiguration({ ...record, params: { ...record.params, features: ['a'] } }), null);
  assert.equal(experimentConfiguration({ ...record, params: { ...record.params, clustering: { ...configuration.clustering, k: 1.5 } } }), null);
  assert.equal(experimentConfiguration({ ...record, params: { ...record.params, reduction: { ...configuration.reduction, method: 'unknown' } } }), null);
});

test('network timeout bounds waiting and does not abort caller-owned signal', async t => {
  const caller = new AbortController();
  const mock = t.mock.method(globalThis, 'fetch', (_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  await assert.rejects(fetchWithTimeout('/unit-test', { signal: caller.signal }, 15), /took too long to respond/);
  assert.equal(caller.signal.aborted, false);
  mock.mock.restore();
});

test('network helper propagates caller cancellation distinctly from timeout', async t => {
  const caller = new AbortController();
  const mock = t.mock.method(globalThis, 'fetch', (_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = fetchWithTimeout('/unit-test', { signal: caller.signal }, 1000);
  caller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  mock.mock.restore();
});
import { validDemoCredentials } from '../src/utils/demoSession';
test('demo sign-in accepts only the demo account and exact password', () => {
  assert.equal(validDemoCredentials(' demo@dimension.lab ', 'Dimension123!'), true);
  assert.equal(validDemoCredentials('DEMO@DIMENSION.LAB', 'Dimension123!'), true);
  assert.equal(validDemoCredentials('demo@dimension.lab', 'wrong-password'), false);
  assert.equal(validDemoCredentials('someone@example.com', 'Dimension123!'), false);
  assert.equal(validDemoCredentials('', ''), false);
});
