import { useAppLanguage } from "./components/WelcomeLanguage";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Welcome } from './components/Welcome';
import { clearDemoSession, hasDemoSession, saveDemoSession } from './utils/demoSession';
import { Portal } from './components/Portal';
import { isModelRoute, isWelcomeRoute, portalRoute, type PortalRoute, type PortalSection } from './utils/portalNavigation';
import { captureSectionSource, shouldAnimateLink, type SectionNavigation } from './utils/sectionTransition';
import { WorkspaceEntrance } from './components/WorkspaceEntrance';
import { SectionTransition } from './components/SectionTransition';
import './components/workspace-entrance.css';
const Workspace = lazy(() => import('./App'));
type EntrancePhase = 'idle' | 'covering' | 'revealing';
type EntranceDirection = 'in' | 'out';

const glassControlSelector = 'button:not(.workspace-scrim, .globe-capital-marker, .portal-signout, .theme-toggle, .welcome-primary, .login-visibility-toggle, .login-demo-action, .welcome-setting-control, .globe-mode-option, .genesis-start), summary:not(.portal-flat-summary), a.lab-action, .workspace-header nav > a';

export function Entry() {
  const { tr, t } = useAppLanguage();
  const [signedIn, setSignedIn] = useState(hasDemoSession);
  const [atWelcome, setAtWelcome] = useState(() => isWelcomeRoute(window.location.hash));
  const [route, setRoute] = useState(() => portalRoute(window.location.hash));
  const [entrancePhase, setEntrancePhase] = useState<EntrancePhase>('idle');
  const entrancePhaseRef = useRef<EntrancePhase>('idle');
  const [entranceDirection, setEntranceDirection] = useState<EntranceDirection>('in');
  const entranceDirectionRef = useRef<EntranceDirection>('in');
  const [exitReducedMotion, setExitReducedMotion] = useState(false);
  const [exitCenter, setExitCenter] = useState({ x: .72, y: .52 });
  const [homeArrival, setHomeArrival] = useState<'full' | 'gentle' | null>(null);
  const [workspaceEntering, setWorkspaceEntering] = useState(false);
  const [sectionNavigation, setSectionNavigation] = useState<SectionNavigation | null>(null);
  const navigationRef = useRef<SectionNavigation | null>(null), navigationSerial = useRef(0);
  const [arrivingRoute, setArrivingRoute] = useState<PortalRoute | null>(null);
  const transitioning = entrancePhase !== 'idle' || sectionNavigation !== null;
  const showPortal = signedIn && !atWelcome;
  const modelActive = showPortal && isModelRoute(route);
  const [modelVisited, setModelVisited] = useState(modelActive);
  useEffect(() => {
    const navigate = () => {
      if (entranceDirectionRef.current === 'out' && entrancePhaseRef.current !== 'idle') return;
      const next = portalRoute(window.location.hash);
      setAtWelcome(isWelcomeRoute(window.location.hash));
      if (navigationRef.current && navigationRef.current.route !== next) {
        navigationRef.current = null; setSectionNavigation(null); setArrivingRoute(null);
      }
      setRoute(next);
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { if (modelActive) setModelVisited(true); }, [modelActive]);
  const coverSection = useCallback((id: number) => {
    const pending = navigationRef.current;
    if (!pending || pending.id !== id || pending.phase !== 'covering') return;
    const next: SectionNavigation = { ...pending, phase: 'revealing' };
    navigationRef.current = next; setSectionNavigation(next); setArrivingRoute(next.route);
    setRoute(next.route); window.location.hash = '/' + next.route;
  }, []);
  const completeSection = useCallback((id: number) => {
    if (navigationRef.current?.id !== id) return;
    navigationRef.current = null; setSectionNavigation(null);
  }, []);
  const openSection = (section: PortalSection, link: HTMLAnchorElement) => {
    if (navigationRef.current || entrancePhaseRef.current !== 'idle') return;
    if (section.id === 'model') void import('./App');
    if (section.id === 'theory') void import('./components/Theory');
    if (section.id === 'library') void import('./components/DatasetStories');
    const next: SectionNavigation = { id: ++navigationSerial.current, kind: 'open', phase: 'covering',
      route: portalRoute(section.href), section, source: captureSectionSource(link) };
    navigationRef.current = next; setWorkspaceEntering(false); setSectionNavigation(next);
  };
  const captureReturn = (event: MouseEvent<HTMLDivElement>) => {
    if (!signedIn || route === 'overview' || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href="#/overview"]');
    if (!link || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !shouldAnimateLink(event, link.target, link.hasAttribute('download'))) return;
    event.preventDefault();
    if (navigationRef.current || entrancePhaseRef.current !== 'idle') return;
    const next: SectionNavigation = { id: ++navigationSerial.current, kind: 'back', phase: 'covering', route: 'overview' };
    navigationRef.current = next; setSectionNavigation(next);
  };
  useEffect(() => {
    if (!sectionNavigation) return;
    const { id, phase } = sectionNavigation;
    const timer = window.setTimeout(() => {
      if (navigationRef.current?.id !== id || navigationRef.current.phase !== phase) return;
      if (phase === 'covering') coverSection(id); else completeSection(id);
    }, phase === 'covering' ? 700 : 2000);
    return () => window.clearTimeout(timer);
  }, [sectionNavigation, coverSection, completeSection]);
  useEffect(() => {
    if (!arrivingRoute) return;
    if (route !== arrivingRoute) { setArrivingRoute(null); return; }
    const timer = window.setTimeout(() => setArrivingRoute(null), 650);
    return () => window.clearTimeout(timer);
  }, [arrivingRoute, route]);
  useEffect(() => {
    if (modelActive && !transitioning) document.getElementById('workspace')?.focus({ preventScroll: true });
  }, [modelActive, transitioning]);
  const advanceEntrance = useCallback(() => {
    if (entrancePhaseRef.current === 'covering') {
      // Switch screens only after the gateway is opaque in either direction.
      entrancePhaseRef.current = 'revealing';
      if (entranceDirectionRef.current === 'in') {
        saveDemoSession(); window.location.hash = '/overview';
        setRoute('overview'); setAtWelcome(false); setWorkspaceEntering(true); setSignedIn(true); setHomeArrival(null);
      } else {
        setSignedIn(false); setModelVisited(false); setRoute('overview'); setAtWelcome(true); window.location.hash = '';
      }
      setEntrancePhase('revealing');
    } else if (entrancePhaseRef.current === 'revealing') {
      entrancePhaseRef.current = 'idle'; setEntrancePhase('idle');
    }
  }, []);
  const signIn = () => {
    if (entrancePhaseRef.current !== 'idle') return;
    entranceDirectionRef.current = 'in'; setEntranceDirection('in');
    entrancePhaseRef.current = 'covering'; setEntrancePhase('covering');
  };
  const signOut = () => {
    if (!signedIn || entrancePhaseRef.current !== 'idle') return;
    let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      const saved = sessionStorage.getItem('dimension-lab:welcome-motion');
      if (saved === 'full' || saved === 'gentle') reduced = saved === 'gentle';
    } catch { /* Follow the OS if storage is unavailable. */ }
    const bounds = document.querySelector('.workspace-map')?.getBoundingClientRect();
    if (bounds?.width && bounds.height) setExitCenter({
      x: Math.min(.9, Math.max(.1, (bounds.left + bounds.width * .5) / window.innerWidth)),
      y: Math.min(.9, Math.max(.1, (bounds.top + bounds.height * .46) / window.innerHeight)),
    });
    else setExitCenter({ x: .72, y: .52 });
    setExitReducedMotion(reduced); setHomeArrival(reduced ? 'gentle' : 'full');
    entranceDirectionRef.current = 'out'; setEntranceDirection('out');
    entrancePhaseRef.current = 'covering'; setEntrancePhase('covering'); setWorkspaceEntering(false);
    navigationRef.current = null; setSectionNavigation(null); setArrivingRoute(null);
    // End the persisted session immediately; the old UI only remains for its exit.
    clearDemoSession();
    void import('./components/DataGlobe');
  };
  useEffect(() => {
    if (signedIn || entranceDirection !== 'out' || entrancePhase !== 'idle') return;
    document.querySelector<HTMLButtonElement>('.welcome-actions .welcome-primary')?.focus({ preventScroll: true });
  }, [signedIn, entranceDirection, entrancePhase]);
  useEffect(() => {
    if (entrancePhase === 'idle') return;
    // Animation events normally drive the handoff. Never leave the UI blocked
    // if an animation is cancelled, disabled by a stylesheet, or a tab is hidden.
    const expectedPhase = entrancePhase;
    const timer = window.setTimeout(() => {
      if (entrancePhaseRef.current === expectedPhase) advanceEntrance();
    }, entranceDirection === 'out'
      ? exitReducedMotion ? 200 : entrancePhase === 'covering' ? 900 : 500
      : entrancePhase === 'covering' ? 620 : 1500);
    return () => window.clearTimeout(timer);
  }, [entrancePhase, entranceDirection, exitReducedMotion, advanceEntrance]);
  useEffect(() => {
    if (!workspaceEntering) return;
    if (route !== 'overview') { setWorkspaceEntering(false); return; }
    // Keep the entry class until the last station has settled.
    const timer = window.setTimeout(() => setWorkspaceEntering(false), 1600);
    return () => window.clearTimeout(timer);
  }, [workspaceEntering, route]);

  useEffect(() => {
    const root = document.getElementById('root');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const moveGlassHighlight = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || reduceMotion.matches || !(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>(glassControlSelector);
      if (!control || control.closest('.welcome-exploration-controls') || control.matches(':disabled, [aria-disabled="true"]')) return;
      const bounds = control.getBoundingClientRect();
      control.style.setProperty('--glass-x', `${event.clientX - bounds.left}px`);
      control.style.setProperty('--glass-y', `${event.clientY - bounds.top}px`);
    };

    root?.addEventListener('pointermove', moveGlassHighlight, { passive: true });
    return () => root?.removeEventListener('pointermove', moveGlassHighlight);
  }, []);

  return <>
    <div className="entry-screen" inert={transitioning} onClickCapture={captureReturn}
      data-transition={entrancePhase !== 'idle' ? entranceDirection : undefined}
      data-transition-phase={entrancePhase !== 'idle' ? entrancePhase : undefined}
      data-transition-motion={exitReducedMotion ? 'gentle' : 'full'}>
      {showPortal ? <>
        {!modelActive && <Portal key={route} route={route} onSignOut={signOut} entering={workspaceEntering} interactive={!transitioning}
          onOpenSection={openSection} openingId={sectionNavigation?.phase === 'covering' ? sectionNavigation.section?.id : undefined}
          sectionEntering={arrivingRoute === route && route !== 'overview'} returning={arrivingRoute === 'overview'}
          titleInTransit={sectionNavigation?.kind === 'open' && sectionNavigation.phase === 'revealing'} />}
      </> : <Welcome onSignIn={signIn} signedIn={signedIn} arrival={homeArrival} />}
      {signedIn && (modelVisited || modelActive) && <div className={'model-session' + (modelActive && arrivingRoute === route ? ' model-session--arriving' : '')} hidden={!modelActive}>
        <Suspense fallback={<div className="entry-loading" role="status">{tr("Opening your workspace…")}</div>}><Workspace active={modelActive} /></Suspense>
      </div>}
    </div>
    {entrancePhase !== 'idle' && <>
      <WorkspaceEntrance phase={entrancePhase} onComplete={advanceEntrance} direction={entranceDirection}
        center={entranceDirection === 'out' ? exitCenter : undefined} reducedMotion={entranceDirection === 'out' && exitReducedMotion} />
      <p className="entry-transition-status" role="status">{entranceDirection === 'out' ? tr("Signing out. Returning to Dimension Lab…") : tr("Entering Workspace…")}</p>
    </>}
    {sectionNavigation && <>
      <SectionTransition navigation={sectionNavigation} onCovered={coverSection} onComplete={completeSection} />
      <p className="entry-transition-status" role="status">{sectionNavigation.kind === 'back' ? tr("Returning to Workspace…") : t(`Opening ${sectionNavigation.section?.title ?? ''}…`, `Đang mở ${tr(sectionNavigation.section?.title ?? '')}…`)}</p>
    </>}
  </>;
}

