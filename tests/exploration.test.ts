import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isNumberMatrix } from '../server/computeValidation';
import { computeKMeans } from '../src/algorithms/kmeans';
import { computeSilhouetteScore } from '../src/algorithms/metrics';
import { clusterPoints, describeRun, evaluatePointSet, focusPoints, makePoints, pendingAnalysisChanges, reduceMatrix, reductionKey, clusteringKey } from '../src/utils/exploration';
import { analysisReport } from '../src/utils/exportData';
import { extractFeatureMatrix, parseCSVString } from '../src/utils/dataParser';
import type { ClusteringConfig, DataPoint, ReductionConfig } from '../src/types';

const reduction: ReductionConfig = { method: 'PCA', normalization: 'z-score', perplexity: 30, learningRate: 100, iterations: 250, nNeighbors: 15, minDist: .1 };
const clustering: ClusteringConfig = { method: 'K-Means', k: 2, epsilon: .5, minPts: 2 };
const point = (x: number, cluster = 0, rowIndex = 0): DataPoint => ({ id: 'duplicate-id', rowIndex, label: x < 5 ? 'A' : 'B', originalFeatures: { x }, x, y: 0, z: 0, cluster });

test('UMAP result provenance survives a normalization draft edit and updates only on rerun', () => {
  const dataset = parseCSVString(readFileSync('tests/fixtures/round2-demo.csv', 'utf8'));
  const run = {
    datasetId: 'test',
    features: dataset.featureColumns,
    reduction: { ...reduction, method: 'UMAP' as const, normalization: 'none' as const, nNeighbors: 3 },
    clustering,
  };
  const next = { ...run, reduction: { ...run.reduction, normalization: 'min-max' as const } };
  const execute = (snapshot: typeof run | typeof next) => {
    const matrix = extractFeatureMatrix(dataset.rawRows, snapshot.features, snapshot.reduction.normalization);
    return clusterPoints(makePoints(dataset, reduceMatrix(matrix, snapshot.reduction).coordinates), snapshot.clustering, Boolean(dataset.labelColumn));
  };
  const original = execute(run);
  assert.deepEqual(pendingAnalysisChanges(run, next), ['Normalization: None → Min-Max']);
  assert.equal(describeRun(run), 'UMAP / K-Means / None');
  assert.equal(analysisReport(dataset, original.points, run, original.metrics).configuration.reduction.normalization, 'none');
  const updated = execute(next);
  assert.equal(describeRun(next), 'UMAP / K-Means / Min-Max');
  assert.equal(updated.points.length, dataset.totalRows);
  assert.deepEqual(pendingAnalysisChanges(run, run), []);
  assert.deepEqual(pendingAnalysisChanges(next, next), []);
});

test('adding clustering to a projection-only result is pending, but irrelevant clustering settings are not', () => {
  const snapshot = { datasetId: 'test', features: ['x', 'y', 'z'], reduction, clustering: { ...clustering, method: 'None' as const } };
  assert.deepEqual(pendingAnalysisChanges(snapshot, { ...snapshot, clustering }), ['Clustering: None → K-Means']);
  assert.deepEqual(pendingAnalysisChanges(snapshot, { ...snapshot, clustering: { ...snapshot.clustering, k: 5 } }), []);
});

test('focus isolates cluster zero and noise without mutating analysis or row identity', () => {
  const points = [point(1, 0, 0), point(9, 1, 1), point(30, -1, 2)];
  const before = structuredClone(points);
  assert.equal(focusPoints(points, null), points);
  assert.deepEqual(focusPoints(points, 0), [points[0]]);
  assert.deepEqual(focusPoints(points, -1), [points[2]]);
  assert.deepEqual(focusPoints(points, 99), []);
  assert.deepEqual(points, before);
  assert.equal(focusPoints(points, 1)[0].rowIndex, 1);
});

test('configuration signatures invalidate only effective parameters', () => {
  const features = ['a', 'b', 'c'];
  assert.equal(reductionKey(features, reduction), reductionKey(features, { ...reduction, minDist: .5 }));
  assert.notEqual(reductionKey(features, reduction), reductionKey(features.slice().reverse(), reduction));
  assert.notEqual(reductionKey(features, reduction), reductionKey(features, { ...reduction, normalization: 'none' }));
  assert.notEqual(reductionKey(features, { ...reduction, method: 't-SNE' }), reductionKey(features, { ...reduction, method: 't-SNE', perplexity: 5 }));
  assert.notEqual(reductionKey(features, { ...reduction, method: 'UMAP' }), reductionKey(features, { ...reduction, method: 'UMAP', minDist: .5 }));
  assert.equal(clusteringKey(clustering), clusteringKey({ ...clustering, epsilon: 4 }));
  assert.notEqual(clusteringKey(clustering), clusteringKey({ ...clustering, k: 3 }));
});

test('coordinate assembly validates correspondence and retains duplicate external IDs safely', () => {
  const data = parseCSVString('id,label,a,b,c\nx,A,1,2,3\nx,B,4,5,6');
  assert.throws(() => makePoints(data, [[1, 2, 3]]));
  assert.throws(() => makePoints(data, [[1, 2, 3], [NaN, 0, 0]]));
  const points = makePoints(data, [[1, 2, 3], [4, 5, 6]]);
  assert.equal(points[0].id, points[1].id);
  assert.deepEqual(points.map(p => p.rowIndex), [0, 1]);
  assert.deepEqual(points.map(p => p.label), ['A', 'B']);
});

test('DBSCAN result, focus and edited metrics account for every point', () => {
  const points = [point(0, 0, 0), point(.1, 0, 1), point(10, 0, 2), point(10.1, 0, 3), point(50, 0, 4)];
  const before = structuredClone(points);
  const result = clusterPoints(points, { ...clustering, method: 'DBSCAN' }, true);
  assert.deepEqual(result.metrics.clusterCounts, { 0: 2, 1: 2 });
  assert.equal(result.metrics.noiseCount, 1);
  assert.equal(result.points.length, 5);
  assert.equal(focusPoints(result.points, 0).length, 2);
  assert.equal(result.points.filter(p => p.cluster === -1).length, 1);
  assert.deepEqual(points, before);
  const edited = evaluatePointSet(result.points.filter(p => p.rowIndex !== 0), true, true);
  assert.deepEqual(edited.clusterCounts, { 0: 1, 1: 2 });
  assert.equal(edited.noiseCount, 1);
  assert.equal(evaluatePointSet([], true, true).silhouetteScore, null);
});

test('Silhouette includes singleton clusters as zero and excludes noise', () => {
  const expected = (9 / 10 + 8 / 9) / 3;
  assert.equal(computeSilhouetteScore([[0], [1], [10]], [0, 0, 1]), expected);
  assert.equal(computeSilhouetteScore([[0], [1], [10], [30]], [0, 0, 1, -1]), expected);
  assert.equal(computeSilhouetteScore([[0], [1], [10]], [0, 1, 2]), null);
});

test('Silhouette is zero when intra- and inter-cluster distances are zero', () => {
  assert.equal(computeSilhouetteScore([[0], [0], [0], [0]], [0, 0, 1, 1]), 0);
});

test('clustering rejects k larger than the number of points instead of reducing k', () => {
  const points = [point(0), point(10)];
  for (const method of ['K-Means', 'GMM'] as const) {
    assert.throws(() => clusterPoints(points, { ...clustering, method, k: 3 }, false),
      /k must be an integer from 1 to 2/);
  }
  assert.throws(() => computeKMeans([[0], [10]], 3), /k must be an integer from 1 to 2/);
  assert.equal(computeKMeans([[0], [10]], 2).centroids.length, 2);
});

test('no-clustering mode has no fabricated cluster counts or scores', () => {
  const result = clusterPoints([point(0), point(10)], { ...clustering, method: 'None', k: 99 }, true);
  assert.equal(result.points.length, 2);
  assert.equal(result.metrics.noiseCount, 0);
  assert.deepEqual(result.metrics.clusterCounts, {});
  assert.equal(result.metrics.silhouetteScore, null);
  assert.equal(result.metrics.adjustedRandIndex, null);
});

test('projection imputes missing numeric cells with the column mean', () => {
  assert.deepEqual(extractFeatureMatrix([{ x: 10 }, { x: null }, { x: 20 }], ['x'], 'none'),
    [[10], [15], [20]]);
  assert.deepEqual(extractFeatureMatrix([{ x: 0 }, { x: '12' }, { x: '' }, { x: '  ' }, {}], ['x'], 'none'),
    [[0], [12], [6], [6], [6]]);
});

test('compute API matrix validation requires rows of equal nonzero width', () => {
  assert.equal(isNumberMatrix([[1, 2, 3], [4], [5, 6, 7]]), false);
  assert.equal(isNumberMatrix([[1], [2, 3]]), false);
  assert.equal(isNumberMatrix([[1, 2], [3, 4]]), true);
  assert.equal(isNumberMatrix([]), false);
  assert.equal(isNumberMatrix([[]]), false);
  assert.equal(isNumberMatrix([[1, 2], [3, NaN]]), false);
  assert.equal(isNumberMatrix([[1, 2], [3, '4']]), false);
});

test('both shipped datasets pass through CSV → features → PCA → clustering with matching rows', () => {
  for (const [file, rows, features] of [['data.csv', 569, 30], ['wholesale.csv', 440, 7]] as const) {
    const dataset = parseCSVString(readFileSync(new URL('../public/' + file, import.meta.url), 'utf8'));
    assert.equal(dataset.rawRows.length, rows);
    assert.equal(dataset.featureColumns.length, features);
    const matrix = extractFeatureMatrix(dataset.rawRows, dataset.featureColumns, reduction.normalization);
    const output = reduceMatrix(matrix, reduction);
    const result = clusterPoints(makePoints(dataset, output.coordinates), clustering, true);
    assert.equal(result.points.length, rows);
    result.points.forEach((point, index) => {
      const source = dataset.rawRows[index];
      assert.equal(point.rowIndex, index);
      assert.equal(point.id, source[dataset.idColumn ?? ''] ?? index + 1);
      assert.equal(point.label, dataset.labelColumn ? source[dataset.labelColumn] : undefined);
      assert.deepEqual([point.x, point.y, point.z], output.coordinates[index]);
    });
    assert.equal(Object.values(result.metrics.clusterCounts).reduce((a, b) => a + b, 0), rows);
    assert.ok(result.points.every(p => [p.x, p.y, p.z].every(Number.isFinite)));
  }
});
