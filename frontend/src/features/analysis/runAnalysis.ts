import type { DataPoint, ParsedDataset } from '@dimension-lab/contracts';
import { extractFeatureMatrix } from '@dimension-lab/algorithms/dataParser';
import { projectionSettingsError, type ProjectionResult } from '@dimension-lab/algorithms/projection';
import { ApiError, NetworkError } from '../../shared/api/network';
import { requestProjection } from './analysisApi';
import { makePoints, type AnalysisSnapshot } from './exploration';
import { clusterInBrowser, projectInBrowser } from './workers/projectionWorker';

interface AnalysisInput extends Omit<ProjectionResult, 'coordinates'> {
  dataset: ParsedDataset;
  points: DataPoint[];
  run: AnalysisSnapshot;
  reuseEmbedding: boolean;
  signal: AbortSignal;
  isCurrent: () => boolean;
  setLoadingMessage: (message: string) => void;
}

export async function runAnalysis(input: AnalysisInput) {
  const { dataset, run, reuseEmbedding, signal, isCurrent, setLoadingMessage } = input;
  let points = input.points;
  let matrix: number[][] | undefined;
  let components = input.components;
  let explainedVariance = input.explainedVariance;
  let totalVariance = input.totalExplainedVariance;
  if (!reuseEmbedding || points.length === 0) {
    const settingsError = projectionSettingsError(run.reduction, dataset.rawRows.length);
    if (settingsError) throw new Error(settingsError);
    setLoadingMessage('Running ' + run.reduction.method + '…');
    matrix = extractFeatureMatrix(dataset.rawRows, run.features, run.reduction.normalization);
    let output: ProjectionResult | undefined;
    try {
      output = await requestProjection({ matrix,
        groundTruth: dataset.labelColumn ? dataset.rawRows.map(row => row[dataset.labelColumn!] ?? null) : [],
        reductionConfig: run.reduction, clusteringConfig: { ...run.clustering, method: 'None' },
      }, signal);
    } catch (error) {
      const canUseWorker = error instanceof NetworkError || (error instanceof ApiError
        && (error.status < 400 || error.status === 401 || error.status >= 500));
      if (signal.aborted || !canUseWorker) throw error;
    }
    if (!isCurrent()) return;
    if (!output) {
      setLoadingMessage('Running ' + run.reduction.method + ' in your browser…');
      output = await projectInBrowser(matrix, run.reduction, signal);
      if (!isCurrent()) return;
    }
    points = makePoints(dataset, output.coordinates);
    components = output.components;
    explainedVariance = output.explainedVariance;
    totalVariance = output.totalExplainedVariance;
  }
  setLoadingMessage(run.clustering.method === 'None' ? 'Updating results…' : 'Clustering with ' + run.clustering.method + '…');
  const result = await clusterInBrowser(points, run.clustering, Boolean(dataset.labelColumn), signal);
  if (!isCurrent()) return;
  return { result, matrix, components, explainedVariance, totalVariance };
}
