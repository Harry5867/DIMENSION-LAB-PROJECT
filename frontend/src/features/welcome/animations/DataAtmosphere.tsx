import { useEffect, useRef, type RefObject } from 'react';
import { createAtmosphereRuntime } from './atmosphereRuntime';
import type { AtmosphereSignal, AtmosphereVariant } from './atmosphere';
import '../styles/data-atmosphere.css';

export function DataAtmosphere({ variant, signal, active = true, theme = 'light' }: {
  variant: AtmosphereVariant; signal?: RefObject<AtmosphereSignal>; active?: boolean; theme?: 'light' | 'dark';
}) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const defaults = useRef<AtmosphereSignal>(variant === 'welcome'
    ? { focusX: .5, focusY: .5, slow: false }
    : { focusX: .74, focusY: .52, slow: false });
  const activeRef = useRef(active); activeRef.current = active;
  const synchronize = useRef<(() => void) | null>(null);
  useEffect(() => { synchronize.current?.(); }, [active]);

  useEffect(() => {
    if (!host.current || !canvas.current) return;
    const element = host.current, input = signal ?? defaults;
    const engine = createAtmosphereRuntime(canvas.current, variant, input, undefined, theme);
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const tracksPointer = variant === 'welcome' && !signal;
    let visible = false, disposed = false, pageActive = true;
    const sync = () => {
      if (disposed) return;
      if (preference.matches && tracksPointer) resetPointer();
      element.classList.toggle('is-reduced', preference.matches);
      engine.setMotion({ active: activeRef.current && pageActive, visible, hidden: document.hidden, reduced: preference.matches });
    };
    const pageHide = () => { pageActive = false; sync(); };
    const pageShow = () => { pageActive = true; sync(); };
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      engine.resize(bounds.width, bounds.height, window.devicePixelRatio || 1, navigator.hardwareConcurrency <= 4);
    };
    const resetPointer = () => { input.current.focusX = .5; input.current.focusY = .5; };
    const movePointer = (event: PointerEvent) => {
      if (!activeRef.current || preference.matches || event.pointerType === 'touch') return;
      input.current.focusX = event.clientX / window.innerWidth;
      input.current.focusY = event.clientY / window.innerHeight;
    };
    synchronize.current = sync;
    const sizes = new ResizeObserver(resize);
    const visibility = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; sync(); });
    sizes.observe(element); visibility.observe(element);
    document.addEventListener('visibilitychange', sync);
    preference.addEventListener('change', sync);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    if (tracksPointer) {
      window.addEventListener('pointermove', movePointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', resetPointer);
    }
    resize(); sync();
    return () => {
      disposed = true; synchronize.current = null;
      sizes.disconnect(); visibility.disconnect();
      document.removeEventListener('visibilitychange', sync);
      preference.removeEventListener('change', sync);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', pageShow);
      if (tracksPointer) {
        window.removeEventListener('pointermove', movePointer);
        document.documentElement.removeEventListener('pointerleave', resetPointer);
      }
      engine.destroy();
    };
  }, [variant, signal, theme]);
  return <div ref={host} className={'data-atmosphere data-atmosphere--' + variant} aria-hidden="true">
    <canvas ref={canvas} />
  </div>;
}
