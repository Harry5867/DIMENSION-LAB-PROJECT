import { useEffect, useRef, type RefObject } from 'react';
import { createAtmosphereRuntime } from '../visuals/atmosphereRuntime';
import type { AtmosphereSignal, AtmosphereVariant } from '../visuals/atmosphere';
import './data-atmosphere.css';

export function DataAtmosphere({ variant, signal, active = true }: {
  variant: AtmosphereVariant; signal?: RefObject<AtmosphereSignal>; active?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const defaults = useRef<AtmosphereSignal>({ focusX: variant === 'welcome' ? .79 : .74, focusY: .52, slow: false });
  const activeRef = useRef(active); activeRef.current = active;
  const synchronize = useRef<(() => void) | null>(null);
  useEffect(() => { synchronize.current?.(); }, [active]);

  useEffect(() => {
    if (!host.current || !canvas.current) return;
    const element = host.current, input = signal ?? defaults;
    const engine = createAtmosphereRuntime(canvas.current, variant, input);
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false, disposed = false, pageActive = true;
    const sync = () => {
      if (disposed) return;
      element.classList.toggle('is-reduced', preference.matches);
      engine.setMotion({ active: activeRef.current && pageActive, visible, hidden: document.hidden, reduced: preference.matches });
    };
    const pageHide = () => { pageActive = false; sync(); };
    const pageShow = () => { pageActive = true; sync(); };
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      engine.resize(bounds.width, bounds.height, window.devicePixelRatio || 1, navigator.hardwareConcurrency <= 4);
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
    resize(); sync();
    return () => {
      disposed = true; synchronize.current = null;
      sizes.disconnect(); visibility.disconnect();
      document.removeEventListener('visibilitychange', sync);
      preference.removeEventListener('change', sync);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', pageShow);
      engine.destroy();
    };
  }, [variant, signal]);
  return <div ref={host} className={'data-atmosphere data-atmosphere--' + variant} aria-hidden="true">
    <canvas ref={canvas} />
  </div>;
}
