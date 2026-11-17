import type { DataValue } from './dataset';

export type ReductionMethod = 'PCA' | 't-SNE' | 'UMAP';
export type ClusteringMethod = 'K-Means' | 'DBSCAN' | 'GMM' | 'None';
export type ColorMode = 'ground-truth' | 'cluster' | 'feature';
export type NormalizationMethod = 'z-score' | 'min-max' | 'none';

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

export interface DataPoint {
  /** Stable source-row identity, independent of a user-provided (possibly duplicate) ID. */
  rowIndex?: number;
  id: string | number | boolean;
  originalFeatures: Record<string, number | null>;
  label?: DataValue;
  // 3D coordinates after reduction
  x: number;
  y: number;
  z: number;
  // Assigned cluster (-1 for noise in DBSCAN)
  cluster: number;
  isOutlier?: boolean;
  clusterConfidence?: number;
  anomalyScore?: number;
  analysisMatch?: boolean;
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
  gmmIterations?: number;
  gmmTolerance?: number;
  seed?: number;
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
