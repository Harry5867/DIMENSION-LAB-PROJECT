import type { ClusteringConfig, ReductionConfig } from './analysis';
import type { DatasetSummary } from './dataset';

interface SamplePreset {
  topic: string;
  description: string;
  source: string;
  credit: string;
  license: 'CC0 1.0' | 'CC BY 4.0';
  reduction: Pick<ReductionConfig, 'method' | 'normalization'>;
  clustering: ClusteringConfig;
  associationColumns: readonly string[];
}

interface SampleDataset extends DatasetSummary {
  is_preloaded: true;
  assetPath: string;
  preset?: SamplePreset;
}

function sample(id: string, name: string, file: string, rows: number, features: number, preset: SamplePreset): SampleDataset {
  return {
    id, name, filename: file, assetPath: 'samples/' + file, total_rows: rows, features_count: features,
    label_column: 'label', id_column: 'id', created_at: '2026-11-19', is_preloaded: true, preset,
  };
}

export const sampleDatasets: readonly SampleDataset[] = [
  {
    id: 'cancer_wdbc', name: 'Wisconsin Breast Cancer', filename: 'data.csv', assetPath: 'data.csv',
    total_rows: 569, features_count: 30, label_column: 'diagnosis', id_column: 'id',
    created_at: '2024-01-01', is_preloaded: true,
  },
  {
    id: 'wholesale_customers', name: 'Wholesale Customers', filename: 'wholesale.csv', assetPath: 'wholesale.csv',
    total_rows: 440, features_count: 7, label_column: 'Channel', id_column: null,
    created_at: '2024-01-02', is_preloaded: true,
  },
  sample('palmer_penguins', 'Palmer Penguins', 'palmer-penguins.csv', 344, 4, {
    topic: 'Ecology',
    description: 'Compare bill, flipper and body measurements across three Antarctic penguin species.',
    source: 'https://allisonhorst.github.io/palmerpenguins/',
    credit: 'Kristen Gorman and Palmer Station LTER · curated by Horst, Hill and Gorman',
    license: 'CC0 1.0',
    reduction: { method: 'PCA', normalization: 'z-score' },
    clustering: { method: 'K-Means', k: 3, epsilon: 0.5, minPts: 5 },
    associationColumns: ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g', 'island'],
  }),
  sample('wheat_seeds', 'Wheat Seeds', 'wheat-seeds.csv', 210, 7, {
    topic: 'Agriculture',
    description: 'Compare the geometry of kernels from three wheat varieties.',
    source: 'https://archive.ics.uci.edu/dataset/236/seeds',
    credit: 'Charytanowicz et al. · UCI',
    license: 'CC BY 4.0',
    reduction: { method: 'PCA', normalization: 'z-score' },
    clustering: { method: 'GMM', k: 3, epsilon: 0.5, minPts: 5, seed: 42 },
    associationColumns: ['area', 'perimeter', 'kernel_length', 'kernel_width'],
  }),
  sample('banknote_authentication', 'Banknote Authentication', 'banknote-authentication.csv', 900, 4, {
    topic: 'Finance',
    description: 'Explore wavelet features extracted from images of genuine and forged banknotes.',
    source: 'https://doi.org/10.24432/C55P57',
    credit: 'Volker Lohweg · UCI',
    license: 'CC BY 4.0',
    reduction: { method: 'PCA', normalization: 'z-score' },
    clustering: { method: 'K-Means', k: 2, epsilon: 0.5, minPts: 5 },
    associationColumns: ['variance', 'skewness', 'curtosis', 'entropy'],
  }),
  sample('smartphone_activity', 'Smartphone Activity', 'smartphone-activity.csv', 600, 24, {
    topic: 'Motion sensors',
    description: 'Compare six activities measured with smartphone accelerometers and gyroscopes.',
    source: 'https://doi.org/10.24432/C54S4K',
    credit: 'Reyes-Ortiz, Anguita, Ghio, Oneto and Parra · UCI',
    license: 'CC BY 4.0',
    reduction: { method: 'UMAP', normalization: 'z-score' },
    clustering: { method: 'DBSCAN', k: 6, epsilon: 1, minPts: 8 },
    associationColumns: ['tBodyAcc_std_X', 'tBodyAcc_std_Y', 'tBodyGyro_std_X', 'tGravityAcc_mean_X'],
  }),
  sample('handwritten_digits', 'Handwritten Digits', 'handwritten-digits.csv', 900, 58, {
    topic: 'Computer vision',
    description: 'Explore images of ten handwritten digits represented as 8 × 8 grids.',
    source: 'https://archive.ics.uci.edu/dataset/80/optical+recognition+of+handwritten+digits',
    credit: 'Alpaydin and Kaynak · UCI',
    license: 'CC BY 4.0',
    reduction: { method: 'UMAP', normalization: 'none' },
    clustering: { method: 'K-Means', k: 10, epsilon: 0.5, minPts: 5 },
    associationColumns: ['pixel_2_4', 'pixel_4_2', 'pixel_4_4', 'pixel_6_5'],
  }),
];

const samplesById = new Map(sampleDatasets.map(sampleDataset => [sampleDataset.id, sampleDataset]));

export function getSampleDataset(id: string) {
  return samplesById.get(id);
}
