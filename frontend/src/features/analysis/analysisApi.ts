import { readSavedAnalysisRuns, type SavedRun } from '@dimension-lab/algorithms/savedRuns';
import type { ClusteringConfig, DataValue, ReductionConfig } from '@dimension-lab/contracts';
import { jsonRequest, requestApi } from '../../shared/api/network';
import { isComputeResult } from '../../shared/api/typeGuards';

const historyPath = '/api/unsupervised/history';

async function readHistory(options: RequestInit) {
  const data = await requestApi(historyPath, options);
  if (!Array.isArray(data)) throw new Error('Invalid history response.');
  return readSavedAnalysisRuns(data);
}

export function listAnalysisHistory(signal: AbortSignal) { return readHistory({ signal }); }
export function appendAnalysisHistory(run: SavedRun) { return readHistory(jsonRequest('POST', run)); }

export async function requestProjection(input: {
  matrix: number[][]; groundTruth: DataValue[]; reductionConfig: ReductionConfig; clusteringConfig: ClusteringConfig;
}, signal: AbortSignal) {
  const data = await requestApi('/api/compute', jsonRequest('POST', input, signal), 45_000);
  if (!isComputeResult(data) || data.coordinates.length !== input.matrix.length) return undefined;
  return data;
}
