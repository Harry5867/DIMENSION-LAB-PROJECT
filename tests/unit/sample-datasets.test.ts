import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sampleDatasets, type ReductionConfig } from '@dimension-lab/contracts';
import { runAnalysisTask } from '@dimension-lab/algorithms/analysisTasks';
import { clusterPoints } from '@dimension-lab/algorithms/clustering';
import { extractFeatureMatrix, parseCSVString } from '@dimension-lab/algorithms/dataParser';
import { projectionSettingsError, reduceMatrix } from '@dimension-lab/algorithms/projection';
import { randomSource } from '@dimension-lab/algorithms/unsupervised';
import { makePoints } from '../../frontend/src/features/analysis/exploration';

const demos = sampleDatasets.flatMap(sample => sample.preset ? [{ sample, preset: sample.preset }] : []);

function seeded<T>(run: () => T): T {
  const originalRandom = Math.random;
  Math.random = randomSource(42);
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

test('the catalog contains five distinct analysis demos alongside the original two samples', () => {
  assert.equal(demos.length, 5);
  assert.equal(new Set(demos.map(({ preset }) => preset.topic)).size, 5);
  assert.equal(new Set(sampleDatasets.map(sample => sample.id)).size, 7);
});

for (const { sample, preset } of demos) {
  test(`${sample.name} supports every projection, clustering and unsupervised analysis`, t => {
    const data = parseCSVString(readFileSync('public/' + sample.assetPath, 'utf8'), sample.name);
    assert.equal(data.totalRows, sample.total_rows);
    assert.equal(data.featureColumns.length, sample.features_count);
    assert.equal(data.labelColumn, sample.label_column);
    assert.equal(data.idColumn, sample.id_column);
    assert.equal(new Set(data.rawRows.map(row => row.id)).size, data.totalRows);
    assert.equal(new Set(data.rawRows.map(row => row.label)).size, preset.clustering.k);
    assert.ok(!data.featureColumns.includes('id') && !data.featureColumns.includes('label'));

    const matrix = extractFeatureMatrix(data.rawRows, data.featureColumns, preset.reduction.normalization);
    for (const method of ['PCA', 't-SNE', 'UMAP'] as const) {
      const config: ReductionConfig = {
        ...preset.reduction, method, perplexity: 30, learningRate: 100, iterations: 250,
        nNeighbors: 15, minDist: 0.1,
      };
      assert.equal(projectionSettingsError(config, data.totalRows), null);
      const points = makePoints(data, seeded(() => reduceMatrix(matrix, config)).coordinates);
      for (const clustering of ['None', 'K-Means', 'DBSCAN', 'GMM'] as const) {
        const result = seeded(() => clusterPoints(points, { ...preset.clustering, method: clustering }, true));
        assert.equal(result.points.length, data.totalRows);
        assert.ok(result.points.every((point, i) => point.rowIndex === i && point.label === data.rawRows[i]?.label));
        if (clustering !== 'None') {
          const groups = Object.values(result.metrics.clusterCounts);
          assert.equal(groups.reduce((sum, value) => sum + value, 0) + (result.metrics.noiseCount ?? 0), data.totalRows);
          if (method === preset.reduction.method && clustering === preset.clustering.method) {
            assert.ok(groups.length >= 2, 'Suggested run should show at least two nonempty clusters');
            assert.ok(result.metrics.silhouetteScore !== null && result.metrics.silhouetteScore > 0);
            t.diagnostic(`${groups.length} clusters, ${result.metrics.noiseCount} noise, silhouette ${result.metrics.silhouetteScore.toFixed(3)}`);
          }
        }
      }
    }

    const anomaly = runAnalysisTask({ kind: 'anomaly', rows: data.rawRows, features: data.featureColumns,
      normalization: preset.reduction.normalization, options: { trees: 100, sampleSize: Math.min(256, data.totalRows), contamination: 0.05, seed: 42 } });
    assert.ok(anomaly.kind === 'anomaly' && anomaly.scores.length === data.totalRows && anomaly.scores.every(Number.isFinite));
    const association = runAnalysisTask({ kind: 'association', rows: data.rawRows, features: [...preset.associationColumns],
      options: { support: 0.15, confidence: 0.7, lift: 1, bins: 3, maxSize: 3 } });
    assert.ok(association.kind === 'association' && association.rules.length > 0 && association.transactions.length === data.totalRows);
    t.diagnostic(`${association.rules.length} association rules at default thresholds`);
  });
}
