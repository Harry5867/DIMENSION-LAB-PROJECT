import { createWorkspaceFlightRuntime, type WorkspaceFlightMessage } from './workspaceFlightRuntime';

let runtime: ReturnType<typeof createWorkspaceFlightRuntime> = null;
let nextFrame = 0;
// Pace drawing independently of the document's rendering callbacks.
const clock = {
  request(callback: FrameRequestCallback) {
    const now = performance.now();
    nextFrame = Math.max(now, nextFrame + 1000 / 60);
    return self.setTimeout(() => callback(performance.now()), nextFrame - now);
  },
  cancel(id: number) { self.clearTimeout(id); },
};

self.onmessage = ({ data }: MessageEvent<WorkspaceFlightMessage>) => {
  try {
    if (data.type === 'start') {
      runtime = createWorkspaceFlightRuntime(data.canvas, data.options, clock);
      if (!runtime) throw new Error('Worker canvas unavailable');
    }
    runtime?.sync(data.state);
  } catch {
    self.postMessage({ type: 'fallback' });
  }
};
