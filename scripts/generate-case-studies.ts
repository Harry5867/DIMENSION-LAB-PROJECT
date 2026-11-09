// Run with: node --import tsx scripts/generate-case-studies.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCSVString, extractFeatureMatrix } from '../src/utils/dataParser';
import { computePCA } from '../src/algorithms/pca';
import { computeGMM } from '../src/algorithms/gmm';
const root = new URL('../', import.meta.url);
const definitions = [
  { id: 'cancer_wdbc', name: 'Wisconsin Breast Cancer', file: 'data.csv', k: 2, description: 'Explore the structure of 30 cell morphology features. The diagnosis label and ID are excluded from projection and clustering.', features: null as string[] | null },
  { id: 'wholesale_customers', name: 'Wholesale Customers', file: 'wholesale.csv', k: 3, description: 'Explore customer groups across six spending categories. Channel and Region are excluded from this example analysis.', features: ['Fresh', 'Milk', 'Grocery', 'Frozen', 'Detergents_Paper', 'Delicassen'] },
];
const stories = definitions.map(definition => {
  const csv = readFileSync(new URL(`public/${definition.file}`, root), 'utf8');
  const dataset = parseCSVString(csv, definition.name);
  const features = definition.features ?? dataset.featureColumns;
  const matrix = extractFeatureMatrix(dataset.rawRows, features, 'z-score');
  const pca = computePCA(matrix);
  const options = { k: definition.k, maxIterations: 100, tolerance: 1e-5, seed: 42 };
  const gmm = computeGMM(pca.coordinates, options);
  return { ...definition, features, sourceHash: createHash('sha256').update(csv).digest('hex'), rowCount: matrix.length,
    configuration: { normalization: 'z-score', reduction: 'PCA', clustering: 'GMM', covariance: 'diagonal', ...options },
    variance: pca.explainedVariance, converged: gmm.converged, iterations: gmm.iterations,
    clusterCounts: Array.from({ length: definition.k }, (_, cluster) => gmm.clusters.filter(value => value === cluster).length),
    points: pca.coordinates.map((point, index) => ({ row: index + 1, x: +point[0].toFixed(6), y: +point[1].toFixed(6), cluster: gmm.clusters[index] })),
  };
});
mkdirSync(new URL('src/data/', root), { recursive: true });
writeFileSync(new URL('src/data/case-studies.json', root), JSON.stringify(stories));
console.log(`Generated ${stories.length} case studies from local CSV files (${stories.map(s => s.rowCount).join(', ')} rows).`);
