import { useAppLanguage } from "./WelcomeLanguage";
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAppTheme } from './ThemeProvider';
import type { createDataMorphRuntime } from '../visuals/dataMorphRuntime';
import './workspace-data-morph.css';

export function WorkspaceDataMorph({ active }: { active: boolean }) {
  const { tr } = useAppLanguage();
  const { theme } = useAppTheme();
  const host = useRef<HTMLDivElement>(null), engine = useRef<ReturnType<typeof createDataMorphRuntime> | null>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const themeRef = useRef(theme); themeRef.current = theme;
  const synchronize = useRef<(() => void) | null>(null);
  // Stop before the first painted frame of a section/sign-out transition.
  useLayoutEffect(() => { synchronize.current?.(); }, [active]);
  useLayoutEffect(() => { engine.current?.setTheme(theme); }, [theme]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false, visible = false, pageActive = true;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      engine.current?.setMotion({
        active: activeRef.current && pageActive,
        visible, hidden: document.hidden, reduced: preference.matches, paused: preference.matches,
      });
    };
    synchronize.current = sync;
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      engine.current?.resize(bounds.width, bounds.height, window.devicePixelRatio || 1, navigator.hardwareConcurrency <= 4);
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || preference.matches) return;
      const bounds = element.getBoundingClientRect();
      engine.current?.setPointer((event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1,
        (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1);
    };
    const leave = () => engine.current?.setPointer(0, 0);
    const hide = () => { pageActive = false; sync(); };
    const show = () => { pageActive = true; sync(); };
    const sizes = new ResizeObserver(resize);
    const visibility = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; sync(); });
    sizes.observe(element); visibility.observe(element);
    document.addEventListener('visibilitychange', sync); preference.addEventListener('change', sync);
    element.addEventListener('pointermove', pointer, { passive: true }); element.addEventListener('pointerleave', leave);
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    void import('../visuals/dataMorphRuntime').then(({ createDataMorphRuntime }) => {
      if (disposed) return;
      engine.current = createDataMorphRuntime(element); engine.current.setTheme(themeRef.current); resize(); sync();
    });
    return () => {
      disposed = true; synchronize.current = null; sizes.disconnect(); visibility.disconnect();
      document.removeEventListener('visibilitychange', sync); preference.removeEventListener('change', sync);
      element.removeEventListener('pointermove', pointer); element.removeEventListener('pointerleave', leave);
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
      engine.current?.destroy(); engine.current = null;
    };
  }, []);
  return <figure className="workspace-data-morph"
    aria-label={tr("Illustrative data transforming between unsupervised learning algorithms")}>
    <div className="workspace-data-morph-stage" ref={host} aria-hidden="true" />
  </figure>;
}
