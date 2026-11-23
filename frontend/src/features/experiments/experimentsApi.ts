import { jsonRequest, requestApi } from '../../shared/api/network';
import { isExperimentRecord } from '../../shared/api/typeGuards';
import type { ClusteringConfig, ReductionConfig } from '@dimension-lab/contracts';

export interface ExperimentInput {
  datasetId: string;
  datasetName: string;
  reductionMethod: ReductionConfig['method'];
  clusteringMethod: ClusteringConfig['method'];
  k: number;
  silhouetteScore: number | null;
  ari: number | null;
  params: { reduction: ReductionConfig; clustering: ClusteringConfig; features: string[] };
}

export async function listExperiments() {
  const data = await requestApi('/api/experiments');
  if (!Array.isArray(data) || !data.every(isExperimentRecord)) throw new Error('The server returned invalid experiment history.');
  return data;
}

export async function createExperiment(input: ExperimentInput) {
  await requestApi('/api/experiments', jsonRequest('POST', input));
}
