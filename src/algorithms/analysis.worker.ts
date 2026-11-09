import { AnalysisTask, runAnalysisTask } from './analysisTasks';
self.onmessage = (event: MessageEvent<AnalysisTask>) => {
  try { self.postMessage({ result: runAnalysisTask(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Analysis failed.' }); }
};
