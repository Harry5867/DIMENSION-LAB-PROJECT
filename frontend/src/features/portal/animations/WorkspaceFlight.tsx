import { useLayoutEffect, useRef } from 'react';
import { useAppTheme } from '../../../shared/providers/ThemeProvider';
import {
  createWorkspaceFlightRuntime, type WorkspaceEntrancePhase, type WorkspaceFlightDirection,
  type WorkspaceFlightMessage, type WorkspaceFlightState,
} from './workspaceFlightRuntime';

export { workspaceFlightTiming, type WorkspaceEntrancePhase, type WorkspaceFlightDirection } from './workspaceFlightRuntime';

export function WorkspaceFlight({ direction, phase }: {
  direction: WorkspaceFlightDirection; phase: WorkspaceEntrancePhase;
}) {
  const { theme } = useAppTheme();
  const host = useRef<HTMLDivElement>(null);
  const clock = useRef({ phase, startedAt: 0 });
  const syncCurrent = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    clock.current = { phase, startedAt: performance.timeOrigin + performance.now() };
    syncCurrent.current?.();
  }, [phase]);

  useLayoutEffect(() => {
    const mount = host.current;
    if (!mount) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const options = { direction, theme, limitedBudget: window.innerWidth < 600 || navigator.hardwareConcurrency <= 4 };
    const makeCanvas = () => {
      const canvas = document.createElement('canvas');
      canvas.className = 'entry-flight';
      return canvas;
    };
    // A fresh canvas allows transfer again when React remounts the effect.
    let canvas = makeCanvas();
    mount.appendChild(canvas);
    let worker: Worker | undefined;
    let runtime: ReturnType<typeof createWorkspaceFlightRuntime> = null;
    let transferred = false, disposed = false;
    const measure = () => {
      const style = getComputedStyle(mount);
      return {
        width: Math.max(1, mount.clientWidth),
        height: Math.max(1, mount.clientHeight),
        pixelRatio: window.devicePixelRatio || 1,
        originX: Number.parseFloat(style.getPropertyValue('--flight-origin-x')) / 100,
        originY: Number.parseFloat(style.getPropertyValue('--flight-origin-y')) / 100,
      };
    };
    let bounds = measure();
    const state = (): WorkspaceFlightState => ({ ...clock.current, bounds, paused: motion.matches || document.hidden });
    const post = (message: WorkspaceFlightMessage, transfer?: Transferable[]) => {
      worker?.postMessage(message, transfer ?? []);
    };
    const sync = () => {
      const next = state();
      if (worker) post({ type: 'sync', state: next });
      else runtime?.sync(next);
    };
    const startLocalCanvas = () => {
      if (disposed) return;
      worker?.terminate();
      worker = undefined;
      runtime?.destroy();
      if (transferred) {
        const replacement = makeCanvas();
        canvas.replaceWith(replacement);
        canvas = replacement;
        transferred = false;
      }
      runtime = createWorkspaceFlightRuntime(canvas, options);
      sync();
    };

    if (typeof canvas.transferControlToOffscreen === 'function' && typeof Worker !== 'undefined') {
      try {
        worker = new Worker(new URL('./workspace-flight.worker.ts', import.meta.url), { type: 'module' });
        worker.onerror = event => {
          event.preventDefault();
          startLocalCanvas();
        };
        worker.onmessage = startLocalCanvas;
        const surface = canvas.transferControlToOffscreen();
        transferred = true;
        post({ type: 'start', canvas: surface, options, state: state() }, [surface]);
      } catch {
        startLocalCanvas();
      }
    } else {
      startLocalCanvas();
    }

    const resize = () => { bounds = measure(); sync(); };
    syncCurrent.current = sync;
    window.addEventListener('resize', resize, { passive: true });
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      disposed = true;
      syncCurrent.current = null;
      worker?.terminate();
      runtime?.destroy();
      window.removeEventListener('resize', resize);
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      canvas.remove();
    };
  }, [direction, theme]);

  return <div ref={host} className="entry-flight-host" />;
}
