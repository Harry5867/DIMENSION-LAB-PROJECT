import type { ClusteringMethod, ReductionMethod } from './analysis';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

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
