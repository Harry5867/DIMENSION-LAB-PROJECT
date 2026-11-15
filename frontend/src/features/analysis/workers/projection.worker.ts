import type { BrowserAnalysisTask } from './projectionWorker';
import { clusterPoints } from '@dimension-lab/algorithms/clustering';
import { reduceMatrix } from '@dimension-lab/algorithms/projection';

self.onmessage = ({ data }: MessageEvent<BrowserAnalysisTask>) => {
  try {
    const result = data.kind === 'clustering' ? clusterPoints(data.points, data.config, data.hasLabels)
      : reduceMatrix(data.matrix, data.config);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Analysis failed.' });
  }
};
