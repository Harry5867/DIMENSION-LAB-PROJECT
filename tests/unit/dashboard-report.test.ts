import assert from 'node:assert/strict';
import test from 'node:test';
import { createDashboardReport, serializeDashboardReport, type DashboardInput } from '../../frontend/src/features/experiments/dashboardReport';

const input: DashboardInput = {
  dataset: { name: 'Uploaded </script><script>alert(1)</script>', totalRows: 3,
    headers: ['id', 'label', 'length', 'private_note'], idColumn: 'id', labelColumn: 'label', featureColumns: ['length'],
    rawRows: [{ id: '01', label: 'A', length: 1, private_note: 'PRIVATE-NOTE-01' },
      { id: '02', label: 'B', length: 2, private_note: 'PRIVATE-NOTE-02' },
      { id: '01', label: 'C', length: 3, private_note: '</script><img src=x>' }] },
  points: [
    { id: '01', rowIndex: 0, label: 'A', x: 1, y: 2, z: 3, cluster: 0, originalFeatures: { length: 1 } },
    { id: '01', rowIndex: 2, label: 'C', x: 9, y: 8, z: 7, cluster: -1, originalFeatures: { length: 3 } },
  ],
  run: { datasetId: 'uploaded', features: ['length'],
    reduction: { method: 'PCA', normalization: 'z-score', perplexity: 30, learningRate: 100, iterations: 250, nNeighbors: 15, minDist: 0.1 },
    clustering: { method: 'DBSCAN', k: 2, epsilon: 0.75, minPts: 3 } },
  metrics: { clusterCounts: { 0: 1 }, silhouetteScore: null, adjustedRandIndex: 0, explainedVariance: [0.7, 0.2, 0.05] },
};

test('dashboard reports the executed configuration and every retained point with its source identity', () => {
  const report = createDashboardReport(input);
  assert.equal(report.dataset.sourceRows, 3);
  assert.deepEqual(report.rows.map(row => [row.sourceRow, row.id, row.cluster]), [[1, '01', 0], [3, '01', -1]]);
  assert.deepEqual(report.groups, [{ id: 0, count: 1 }, { id: -1, count: 1 }]);
  assert.deepEqual(report.parameters, [['Normalization', 'Z-score'], ['Reduction', 'PCA'], ['Clustering', 'DBSCAN'], ['Radius (ε)', 0.75], ['Minimum points', 3]]);
  assert.deepEqual(report.metrics.variance, [0.7, 0.2, 0.05]);
  assert.equal(report.metrics.ari, 0);
  assert.ok(!('source' in report));
  assert.doesNotMatch(serializeDashboardReport(report), /PRIVATE-NOTE|originalFeatures/);
});

test('original columns require opt-in and HTML-like source values remain data', () => {
  const report = createDashboardReport(input, true);
  assert.deepEqual(report.source?.columns, input.dataset.headers);
  assert.deepEqual(report.source?.values.map(row => row[3]), ['PRIVATE-NOTE-01', '</script><img src=x>']);
  const payload = serializeDashboardReport(report);
  assert.doesNotMatch(payload, /[<>]/);
  assert.deepEqual(JSON.parse(payload), JSON.parse(JSON.stringify(report)));
});

test('dashboard suppresses inapplicable clustering and PCA metrics', () => {
  const report = createDashboardReport({ ...input, run: { ...input.run,
    reduction: { ...input.run.reduction, method: 'UMAP' },
    clustering: { ...input.run.clustering, method: 'None' },
  } });
  assert.deepEqual(report.groups, []);
  assert.ok(report.rows.every(row => row.cluster === null));
  assert.equal(report.metrics.ari, null);
  assert.equal(report.metrics.variance, undefined);
  assert.ok(report.parameters.some(([name]) => name === 'Neighbors'));
});
