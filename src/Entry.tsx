import { lazy, Suspense, useEffect, useState } from 'react';
import { Welcome } from './components/Welcome';
import { clearDemoSession, hasDemoSession, saveDemoSession } from './utils/demoSession';
const Workspace = lazy(() => import('./App'));

const glassControlSelector = 'button:not(.workspace-scrim, .globe-capital-marker), summary, a.lab-action, .workspace-header nav > a';

export function Entry() {
  const [signedIn, setSignedIn] = useState(hasDemoSession);

  useEffect(() => {
    const root = document.getElementById('root');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const moveGlassHighlight = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || reduceMotion.matches || !(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>(glassControlSelector);
      if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;
      const bounds = control.getBoundingClientRect();
      control.style.setProperty('--glass-x', `${event.clientX - bounds.left}px`);
      control.style.setProperty('--glass-y', `${event.clientY - bounds.top}px`);
    };

    root?.addEventListener('pointermove', moveGlassHighlight, { passive: true });
    return () => root?.removeEventListener('pointermove', moveGlassHighlight);
  }, []);

  return signedIn
    ? <Suspense fallback={<div className="entry-loading" role="status">Opening your workspace…</div>}><Workspace onSignOut={() => { clearDemoSession(); setSignedIn(false); }} /></Suspense>
    : <Welcome onSignIn={() => { saveDemoSession(); setSignedIn(true); }} />;
}

