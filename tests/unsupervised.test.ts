import { compareRow, describeItem, ruleRows, numericValue } from '../src/utils/analysisPresentation';
import { runAnalysisTask } from '../src/algorithms/analysisTasks';
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGMM } from '../src/algorithms/gmm';
import { computeIsolationForest } from '../src/algorithms/isolationForest';
import { computeApriori, transactionsFromRows } from '../src/algorithms/apriori';
import { parseAnalysisTask } from '../src/algorithms/analysisTasks';
import { clusterPoints, clusteringKey } from '../src/utils/exploration';
import { experimentConfiguration } from '../src/utils/history';

test('GMM separates two populations with finite normalized probabilities and reproducible EM', () => {
  const data = Array.from({ length: 60 }, (_, i) => [(i < 30 ? -10 : 10) + (i % 7) * 0.1, (i % 3) * 0.1, 0]);
  const result = computeGMM(data, { k: 2, seed: 8 });
  assert.deepEqual(result, computeGMM(data, { k: 2, seed: 8 }));
  assert.equal(result.converged, true);
  assert.notEqual(result.clusters[0], result.clusters[59]);
  assert.ok(result.clusters.slice(0, 30).every(v => v === result.clusters[0]));
  result.probabilities.forEach(p => { assert.ok(p.every(Number.isFinite)); assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9); });
  assert.ok(Number.isFinite(result.aic) && Number.isFinite(result.bic));
  const identical = computeGMM([[1, 1], [1, 1], [1, 1]], { k: 2 });
  assert.ok(Number.isFinite(identical.logLikelihood));
  assert.throws(() => computeGMM([], { k: 2 }));
  assert.throws(() => computeGMM([[0], [1, 2]], { k: 2 }));
  assert.throws(() => computeGMM([[0]], { k: 2 }));
});

test('Isolation Forest ranks distant points above the compact population and preserves identity', () => {
  const data = Array.from({ length: 100 }, (_, i) => [Math.sin(i) * 0.1, Math.cos(i) * 0.1]); data.push([100, 100]);
  const options = { trees: 120, sampleSize: 101, contamination: 0.02, seed: 42 };
  const result = computeIsolationForest(data, options);
  assert.deepEqual(result, computeIsolationForest(data, options));
  assert.equal(result.scores.indexOf(Math.max(...result.scores)), 100);
  assert.equal(result.anomalies[100], true);
  assert.ok(result.scores.every(s => s > 0 && s <= 1));
  assert.throws(() => computeIsolationForest(data, { ...options, contamination: 0 }));
  assert.throws(() => computeIsolationForest(data, { ...options, seed: NaN }));
  assert.ok(computeIsolationForest([[1], [1]], options).scores.every(Number.isFinite));
});

test('Apriori returns exact support, confidence and lift for known transactions', () => {
  const result = computeApriori([['a', 'b'], ['a', 'b'], ['a'], ['c']], { support: 0.5, confidence: 0.5, lift: 1, maxSize: 3, bins: 3 });
  const rule = result.rules.find(r => r.antecedent.join() === 'a' && r.consequent.join() === 'b')!;
  assert.equal(rule.count, 2); assert.equal(rule.support, 0.5); assert.equal(rule.confidence, 2 / 3); assert.equal(rule.lift, 4 / 3);
  const triple = computeApriori([['a', 'b', 'c'], ['a', 'b', 'c']], { support: 1, confidence: 1, lift: 1, maxSize: 3, bins: 3 });
  assert.equal(triple.frequentItemsets, 7); assert.equal(triple.rules.length, 12);
  assert.equal(computeApriori([['a'], ['b']], { support: 1, confidence: 1, lift: 1, maxSize: 2, bins: 3 }).rules.length, 0);
  assert.throws(() => computeApriori([], { support: 1, confidence: 1, lift: 1, maxSize: 2, bins: 3 }));
  assert.throws(() => computeApriori([Array.from({ length: 301 }, (_, i) => String(i))], { support: 1, confidence: 1, lift: 1, maxSize: 2, bins: 3 }));
});

test('Transaction bins preserve source row order and skip missing values', () => {
  const result = transactionsFromRows([{ x: 0, category: 'a' }, { x: 10, category: 'b' }, { x: null, category: 'a' }], ['x', 'category'], 2);
  assert.ok(result.transactions[0].includes(JSON.stringify(['x', 'bin 1/2'])));
  assert.ok(result.transactions[1].includes(JSON.stringify(['x', 'bin 2/2'])));
  assert.equal(result.transactions[2].length, 1);
  assert.equal(result.binning[0].range?.max, 10);
});

test('GMM integration assigns confidence without mutating points and invalidates parameter cache', () => {
  const points = Array.from({ length: 12 }, (_, i) => ({ rowIndex: i, id: i, x: i < 6 ? i / 10 : 10 + i / 10, y: 0, z: 0, cluster: 0, originalFeatures: {} }));
  const config = { method: 'GMM' as const, k: 2, epsilon: 1, minPts: 2 };
  const result = clusterPoints(points, config, false);
  assert.ok(result.gmm); assert.ok(result.points.every(p => p.clusterConfidence! > 0.9));
  assert.equal(result.metrics.adjustedRandIndex, null);
  assert.equal('clusterConfidence' in points[0], false);
  assert.notEqual(clusteringKey(config), clusteringKey({ ...config, seed: 12 }));
});

test('Legacy experiment configs still restore and invalid analysis task input is rejected', () => {
  const record = { id: 1, dataset_id: 'd', dataset_name: 'd', reduction_method: 'PCA', clustering_method: 'K-Means', k: 2, silhouette_score: null, ari: null, created_at: '', params: { features: ['a', 'b', 'c'], reduction: { method: 'PCA', normalization: 'none', perplexity: 30, learningRate: 100, iterations: 100, nNeighbors: 15, minDist: 0.1 }, clustering: { method: 'K-Means', k: 2, epsilon: 1, minPts: 2 } } };
  assert.equal(experimentConfiguration(record)?.clustering.method, 'K-Means');
  assert.throws(() => parseAnalysisTask({ kind: 'oops', rows: [], features: [], options: {} }));
});


test('Anomaly preprocessing imputes missing values from valid observations rather than zero', () => {
  const result = runAnalysisTask({ kind: 'anomaly', rows: [{ x: 10 }, { x: null }, { x: '' }, { x: 30 }, { x: 'bad' }], features: ['x'], normalization: 'none', options: { trees: 20, sampleSize: 5, contamination: 0.2, seed: 42 } });
  assert.equal(result.kind, 'anomaly');
  if (result.kind !== 'anomaly') throw new Error('Unexpected task');
  assert.deepEqual(result.preprocessing, [{ feature: 'x', missing: 3, mean: 20 }]);
  assert.equal(result.scores[1], result.scores[2]);
  assert.equal(result.scores[1], result.scores[4]);
  assert.throws(() => runAnalysisTask({ kind: 'anomaly', rows: [{ x: null }, { x: '' }], features: ['x'], normalization: 'none', options: { trees: 2, sampleSize: 2, contamination: 0.1, seed: 42 } }), /no valid numeric/);
});

test('Association items show precise half-open bin intervals and preserve matching identities', () => {
  const prepared = transactionsFromRows([{ x: 0, c: 'a' }, { x: 5, c: 'a' }, { x: 10, c: 'b' }], ['x', 'c'], 2);
  assert.equal(describeItem(JSON.stringify(['x', 'bin 1/2']), prepared.binning), 'x ∈ [0, 5)');
  assert.equal(describeItem(JSON.stringify(['x', 'bin 2/2']), prepared.binning), 'x ∈ [5, 10]');
  const constant = transactionsFromRows([{ x: 7 }], ['x'], 3);
  assert.equal(describeItem(constant.transactions[0][0], constant.binning), 'x = 7');
  assert.equal(describeItem(JSON.stringify(['c', 'a']), prepared.binning), 'c = a');
  const rule = { antecedent: [JSON.stringify(['c', 'a'])], consequent: [JSON.stringify(['x', 'bin 1/2'])], support: 1/3, confidence: 0.5, lift: 1.5, count: 1 };
  assert.deepEqual(ruleRows(prepared.transactions, rule, 'antecedent'), [0, 1]);
  assert.deepEqual(ruleRows(prepared.transactions, rule, 'both'), [0]);
  assert.deepEqual(ruleRows(prepared.transactions, rule, 'exceptions'), [1]);
});

test('Numeric comparison keeps missing values visible and does not manufacture deviations', () => {
  assert.equal(numericValue(' '), null); assert.equal(numericValue(null), null); assert.equal(numericValue(true), null); assert.equal(numericValue('0'), 0);
  const rows = [{ x: 1, constant: 7 }, { x: 3, constant: 7 }, { x: null, constant: 7 }];
  const summary = compareRow(rows, 1, ['x', 'constant']);
  assert.equal(summary[0].mean, 2); assert.equal(summary[0].deviation, 1);
  assert.equal(summary[1].deviation, null);
  assert.equal(compareRow(rows, 2, ['x'])[0].value, null);
});

test('Task validation rejects duplicated or absent features and nonfinite source numbers', () => {
  const task = { kind: 'anomaly', rows: [{ x: 1 }, { x: 2 }], features: ['x'], normalization: 'none', options: { trees: 5, sampleSize: 2, contamination: 0.1, seed: 42 } };
  assert.throws(() => parseAnalysisTask({ ...task, features: ['x', 'x'] }), /unique/);
  assert.throws(() => parseAnalysisTask({ ...task, features: ['missing'] }), /present/);
  assert.throws(() => parseAnalysisTask({ ...task, rows: [{ x: Infinity }] }));
});
