import type { ComputeResult, DataPoint, EvaluationMetrics, ParsedDataset } from '@dimension-lab/contracts';
import type { GMMResult } from '@dimension-lab/algorithms/gmm';
import { extractFeatureMatrix } from '@dimension-lab/algorithms/dataParser';
import { projectionSettingsError } from '@dimension-lab/algorithms/projection';
import { fetchWithTimeout } from '../../shared/api/network';
import { isComputeResult, isRecord } from '../../shared/api/typeGuards';
import { makePoints, type AnalysisSnapshot } from './exploration';
import { clusterInBrowser, projectInBrowser } from './workers/projectionWorker';

type ReductionOutput = {
  coordinates: [number, number, number][];
  components?: number[][];
  explainedVariance?: [number, number, number];
  totalExplainedVariance?: number;
};

interface AnalysisInput extends Omit<ReductionOutput, 'coordinates'> {
  dataset: ParsedDataset;
  datasetId: string;
  points: DataPoint[];
  run: AnalysisSnapshot;
  reuseEmbedding: boolean;
  signal: AbortSignal;
  isCurrent: () => boolean;
  setLoadingMessage: (message: string) => void;
}

interface PointDiagnostics {
  outlierFlags: boolean[];
  summary: { outlierCount: number };
}

interface ApiAnalysisResult extends ComputeResult {
  pointDiagnostics?: PointDiagnostics;
  quality?: {
    dimensionalityReduction: { trustworthiness: number | null };
    clustering: { daviesBouldinIndex: number | null };
  };
  gmm?: GMMResult;
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isGmmResult(value: unknown): value is GMMResult {
  return isRecord(value)
    && Array.isArray(value.clusters) && value.clusters.every(item => typeof item === 'number')
    && Array.isArray(value.probabilities) && value.probabilities.every(row =>
      Array.isArray(row) && row.every(item => typeof item === 'number' && Number.isFinite(item)))
    && Array.isArray(value.means) && value.means.every(row =>
      Array.isArray(row) && row.every(item => typeof item === 'number' && Number.isFinite(item)))
    && Array.isArray(value.variances) && value.variances.every(row =>
      Array.isArray(row) && row.every(item => typeof item === 'number' && Number.isFinite(item)))
    && Array.isArray(value.weights) && value.weights.every(item => typeof item === 'number' && Number.isFinite(item))
    && typeof value.logLikelihood === 'number' && Number.isFinite(value.logLikelihood)
    && typeof value.iterations === 'number' && Number.isInteger(value.iterations)
    && typeof value.converged === 'boolean' && typeof value.aic === 'number' && Number.isFinite(value.aic)
    && typeof value.bic === 'number' && Number.isFinite(value.bic);
}

function isApiAnalysisResult(value: unknown): value is ApiAnalysisResult {
  if (!isRecord(value) || !isComputeResult(value)) return false;
  if (value.pointDiagnostics !== undefined) {
    if (!isRecord(value.pointDiagnostics)
      || !Array.isArray(value.pointDiagnostics.outlierFlags)
      || value.pointDiagnostics.outlierFlags.length !== value.coordinates.length
      || !value.pointDiagnostics.outlierFlags.every(flag => typeof flag === 'boolean')
      || !isRecord(value.pointDiagnostics.summary)
      || typeof value.pointDiagnostics.summary.outlierCount !== 'number') return false;
  }
  if (value.quality !== undefined) {
    if (!isRecord(value.quality)) return false;
    const reduction = value.quality.dimensionalityReduction;
    const clustering = value.quality.clustering;
    if (!isRecord(reduction) || !isFiniteNumberOrNull(reduction.trustworthiness)
      || !isRecord(clustering) || !isFiniteNumberOrNull(clustering.daviesBouldinIndex)) return false;
  }
  return value.gmm === undefined || (isGmmResult(value.gmm)
    && value.gmm.clusters.length === value.coordinates.length
    && value.gmm.probabilities.length === value.coordinates.length);
}

export async function runAnalysis(input: AnalysisInput) {
  const { dataset, run, reuseEmbedding, signal, isCurrent, setLoadingMessage } = input;
  let points = input.points;
  let matrix: number[][] | undefined;
  let components = input.components;
  let explainedVariance = input.explainedVariance;
  let totalVariance = input.totalExplainedVariance;
  let serverResult: ApiAnalysisResult | undefined;
  let serverAnalysisId: string | undefined;
  let advancedQuality: { trustworthiness: number | null; daviesBouldinIndex: number | null } | undefined;
  if (!reuseEmbedding || points.length === 0) {
    const settingsError = projectionSettingsError(run.reduction, dataset.rawRows.length);
    if (settingsError) throw new Error(settingsError);
    setLoadingMessage('Running ' + run.reduction.method + '…');
    matrix = extractFeatureMatrix(dataset.rawRows, run.features, run.reduction.normalization);
    const response = input.datasetId.startsWith('local_') ? undefined : await fetchWithTimeout('/api/v2/analyses', { method: 'POST', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasetId: input.datasetId,
          features: run.features, reduction: run.reduction, clustering: run.clustering }) }, 45_000)
      .catch(error => { if (signal.aborted) throw error; return undefined; });
    if (response?.ok) {
      const body: unknown = await response.json().catch(() => undefined);
      const accepted = isRecord(body) && isRecord(body.data) ? body.data : undefined;
      const jobId = accepted && typeof accepted.id === 'string' ? accepted.id : undefined;
      if (!jobId) throw new Error('The server did not return an analysis job ID.');
      serverAnalysisId = jobId;
      const deadline = Date.now() + 45_000;
      while (!serverResult && !signal.aborted && Date.now() < deadline) {
        const jobResponse = await fetchWithTimeout('/api/v2/jobs/' + encodeURIComponent(jobId), { signal }, 10_000);
        const jobBody: unknown = await jobResponse.json().catch(() => undefined);
        const job = isRecord(jobBody) && isRecord(jobBody.data) ? jobBody.data : undefined;
        if (!jobResponse.ok) throw new Error('Could not read the analysis job (HTTP ' + jobResponse.status + ').');
        if (job?.status === 'failed') {
          const failure = isRecord(job.error) && typeof job.error.message === 'string' ? job.error.message : 'Analysis failed.';
          throw new Error(failure);
        }
        if (job?.status === 'cancelled') throw new Error('The server analysis was cancelled.');
        if (job?.status === 'succeeded' && isRecord(job.result)) {
          const payload = job.result.result;
          if (isApiAnalysisResult(payload) && payload.coordinates.length === matrix.length
            && (run.clustering.method === 'None' ? payload.clusterAssignments.length === 0
              : payload.clusterAssignments.length === matrix.length)) {
            serverResult = payload;
            components = payload.components;
            explainedVariance = payload.explainedVariance;
            totalVariance = payload.totalExplainedVariance;
            const quality = payload.quality;
            if (quality) advancedQuality = {
              trustworthiness: quality.dimensionalityReduction.trustworthiness,
              daviesBouldinIndex: quality.clustering.daviesBouldinIndex,
            };
          }
          else throw new Error('The server returned an invalid analysis result.');
        } else {
          const progress = typeof job?.progress === 'number' ? ` (${job.progress}%)` : '';
          setLoadingMessage('Running ' + run.reduction.method + progress + '…');
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      if (!serverResult && !signal.aborted && Date.now() >= deadline) throw new Error('The server analysis timed out.');
    } else if (response && response.status < 500 && response.status !== 401) {
      const body: unknown = await response.json().catch(() => undefined);
      const error = isRecord(body) ? body.error : undefined;
      throw new Error(isRecord(error) && typeof error.message === 'string'
        ? error.message : `The server rejected the analysis (HTTP ${response.status}).`);
    }
    if (!isCurrent()) return;
    if (serverResult) {
      const output = serverResult;
      points = makePoints(dataset, output.coordinates);
      points = points.map((point, index) => ({
        ...point,
        cluster: output.clusterAssignments[index] ?? 0,
        isOutlier: output.pointDiagnostics?.outlierFlags[index] ?? output.clusterAssignments[index] === -1,
        clusterConfidence: output.gmm ? Math.max(...output.gmm.probabilities[index]) : undefined,
      }));
    } else {
      setLoadingMessage('Running ' + run.reduction.method + ' in your browser…');
      const output = await projectInBrowser(matrix, run.reduction, signal);
      if (!isCurrent()) return;
      points = makePoints(dataset, output.coordinates);
      components = output.components;
      explainedVariance = output.explainedVariance;
      totalVariance = output.totalExplainedVariance;
    }
  }
  setLoadingMessage(run.clustering.method === 'None' ? 'Updating results…' : 'Clustering with ' + run.clustering.method + '…');
  if (serverResult && !reuseEmbedding) {
    const metrics: EvaluationMetrics = {
      silhouetteScore: serverResult.silhouetteScore,
      adjustedRandIndex: serverResult.adjustedRandIndex,
      explainedVariance: serverResult.explainedVariance,
      totalVarianceExplained: serverResult.totalExplainedVariance,
      clusterCounts: serverResult.clusterCounts,
      noiseCount: serverResult.noiseCount,
      outlierCount: serverResult.pointDiagnostics?.summary.outlierCount,
    };
    return { result: { points, metrics, gmm: serverResult.gmm }, matrix, components, explainedVariance, totalVariance,
      serverAnalysisId, advancedQuality };
  }
  const result = await clusterInBrowser(points, run.clustering, Boolean(dataset.labelColumn), signal);
  if (!isCurrent()) return;
  return { result, matrix, components, explainedVariance, totalVariance, serverAnalysisId, advancedQuality };
}
