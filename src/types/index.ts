export type ReductionMethod = 'PCA' | 't-SNE' | 'UMAP';
export type ClusteringMethod = 'K-Means' | 'DBSCAN' | 'None';
export type ColorMode = 'ground-truth' | 'cluster' | 'feature';
export type NormalizationMethod = 'z-score' | 'min-max' | 'none';
export const MIN_NUMERIC_FEATURES = 3;
export type DataValue = string | number | boolean | null;
export type DatasetRow = Record<string, DataValue>;
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface DatasetDocument {
  id: string;
  name: string;
  filename: string;
  totalRows: number;
  features: string[];
  labelColumn: string | null;
  idColumn: string | null;
  rawRows: DatasetRow[];
  createdAt: string;
}

export interface DatasetSummary {
  id: string;
  name: string;
  filename: string;
  total_rows: number;
  features_count?: number;
  label_column: string | null;
  id_column: string | null;
  created_at: string;
  is_preloaded?: boolean;
  is_local?: boolean;
}

export interface ExperimentRecord {
  id: number | string;
  dataset_id: string;
  dataset_name: string;
  reduction_method: ReductionMethod | string;
  clustering_method: ClusteringMethod | string;
  k: number;
  silhouette_score: number | null;
  ari: number | null;
  params: { [key: string]: JsonValue };
  created_at: string;
}

export interface ComputeResult {
  coordinates: [number, number, number][];
  clusterAssignments: number[];
  silhouetteScore: number | null;
  adjustedRandIndex: number | null;
  explainedVariance?: [number, number, number];
  totalExplainedVariance?: number;
  components?: number[][];
  clusterCounts: Record<number, number>;
  noiseCount: number;
  fromCache?: boolean;
  computeTimeMs?: number;
}

export interface SystemHealth {
  uptime: string;
  memory: {
    rssMb: string;
    heapUsedMb: string;
    heapTotalMb: string;
  };
  database: {
    engine: string;
    connected: boolean;
    latency: string;
    totalDocuments: number;
  };
  cache: {
    memoryEntries: number;
    status: string;
  };
}

export interface DataPoint {
  /** Stable source-row identity, independent of a user-provided (possibly duplicate) ID. */
  rowIndex?: number;
  id: string | number | boolean;
  originalFeatures: Record<string, number>;
  label?: DataValue;
  // 3D coordinates after reduction
  x: number;
  y: number;
  z: number;
  // Assigned cluster (-1 for noise in DBSCAN)
  cluster: number;
  isOutlier?: boolean;
}

export interface ParsedDataset {
  id?: string;
  name: string;
  totalRows: number;
  headers: string[];
  idColumn: string | null;
  labelColumn: string | null;
  featureColumns: string[];
  rawRows: DatasetRow[];
}

export interface ReductionConfig {
  method: ReductionMethod;
  normalization: NormalizationMethod;
  // t-SNE parameters
  perplexity: number;
  learningRate: number;
  iterations: number;
  // UMAP parameters
  nNeighbors: number;
  minDist: number;
}

export interface ClusteringConfig {
  method: ClusteringMethod;
  // K-Means
  k: number;
  // DBSCAN
  epsilon: number;
  minPts: number;
}

export interface EvaluationMetrics {
  silhouetteScore: number | null;
  adjustedRandIndex: number | null;
  explainedVariance?: [number, number, number]; // For PCA [PC1, PC2, PC3]
  totalVarianceExplained?: number;
  clusterCounts: Record<number, number>;
  noiseCount?: number;
  outlierCount?: number;
  executionTimeMs?: number | null;
}
