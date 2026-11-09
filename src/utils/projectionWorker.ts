import type { ClusteringConfig, DataPoint, ReductionConfig } from '../types';
import type { clusterPoints, reduceMatrix } from './exploration';

export type BrowserAnalysisTask =
  | { kind: 'projection'; matrix: number[][]; config: ReductionConfig }
  | { kind: 'clustering'; points: DataPoint[]; config: ClusteringConfig; hasLabels: boolean };

export function projectInBrowser(matrix: number[][], config: ReductionConfig, signal: AbortSignal) {
  return runBrowserAnalysis<ReturnType<typeof reduceMatrix>>({ kind: 'projection', matrix, config }, signal);
}

export function clusterInBrowser(points: DataPoint[], config: ClusteringConfig, hasLabels: boolean, signal: AbortSignal) {
  return runBrowserAnalysis<ReturnType<typeof clusterPoints>>({ kind: 'clustering', points, config, hasLabels }, signal);
}

function runBrowserAnalysis<Result>(task: BrowserAnalysisTask, signal: AbortSignal): Promise<Result> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const worker = new Worker(new URL('../algorithms/projection.worker.ts', import.meta.url), { type: 'module' });
    function cleanup() {
      signal.removeEventListener('abort', abort);
      worker.terminate();
    }
    function abort() {
      cleanup();
      reject(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ result?: Result; error?: string }>) => {
      cleanup();
      if (event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error ?? 'Projection failed.'));
    };
    worker.onerror = worker.onmessageerror = () => {
      cleanup();
      reject(new Error('The browser could not run the analysis.'));
    };
    try { worker.postMessage(task); }
    catch (error) { cleanup(); reject(error); }
  });
}
