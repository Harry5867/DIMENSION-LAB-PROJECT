import { useAppLanguage } from "../shared/providers/WelcomeLanguage";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Welcome } from '../features/welcome/Welcome';
import { TeamLogo } from '../shared/ui/TeamLogo';
import { clearDemoSession, getAccessToken, saveDemoSession } from '../shared/api/demoSession';
import { SESSION_EXPIRED_EVENT } from '../shared/api/network';
import { logout } from '../features/auth/authApi';
import { useAuthSession } from '../features/auth/useAuthSession';
import { Portal } from '../features/portal/Portal';
import { isModelRoute, isWelcomeRoute, portalRoute, signInDestination, type PortalRoute, type PortalSection } from '../shared/navigation/portalNavigation';
import { captureSectionSource, shouldAnimateLink, type SectionNavigation } from '../features/portal/navigation/sectionTransition';
import { WorkspaceEntrance } from '../features/portal/animations/WorkspaceEntrance';
import { workspaceFlightTiming, type WorkspaceEntrancePhase, type WorkspaceFlightDirection } from '../features/portal/animations/WorkspaceFlight';
import { SectionTransition } from '../features/portal/animations/SectionTransition';
import '../features/portal/styles/workspace-entrance.css';
const Workspace = lazy(() => import('./App'));
type EntrancePhase = 'idle' | WorkspaceEntrancePhase;

const glassControlSelector = '.control-glass, .liquid-glass, button:not(.workspace-scrim, .globe-capital-marker, .portal-return-home, .theme-toggle, .welcome-primary, .login-page button, .globe-mode-option), summary:not(.portal-flat-summary), a.lab-action, .workspace-header nav > a, .workspace-directory-icon';

export function Entry() {
  const { tr, t } = useAppLanguage();
  const { signedIn, setSignedIn, authOptions, sessionChecked } = useAuthSession();
  const [signOutError, setSignOutError] = useState(false);
  const signingOut = useRef(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [hash, setHash] = useState(() => window.location.hash);
  const [googleArrival, setGoogleArrival] = useState(() =>
    window.location.hash === '#/overview' && new URLSearchParams(window.location.search).get('auth') === 'google-success');
  const atWelcome = isWelcomeRoute(hash);
  const route = portalRoute(hash);
  const [entrancePhase, setEntrancePhase] = useState<EntrancePhase>('idle');
  const entrancePhaseRef = useRef<EntrancePhase>('idle');
  const [entranceDirection, setEntranceDirection] = useState<WorkspaceFlightDirection>('in');
  const entranceDirectionRef = useRef<WorkspaceFlightDirection>('in');
  const [transitionReducedMotion, setTransitionReducedMotion] = useState(false);
  const [homeArrival, setHomeArrival] = useState<'full' | 'gentle' | null>(null);
  const [workspaceEntering, setWorkspaceEntering] = useState(false);
  const [sectionNavigation, setSectionNavigation] = useState<SectionNavigation | null>(null);
  const navigationRef = useRef<SectionNavigation | null>(null), navigationSerial = useRef(0);
  const [arrivingRoute, setArrivingRoute] = useState<PortalRoute | null>(null);
  const transitioning = entrancePhase !== 'idle' || sectionNavigation !== null;
  const showPortal = signedIn && !atWelcome && !googleArrival;
  const openingId = sectionNavigation?.phase === 'covering' ? sectionNavigation.section?.id : undefined;
  const modelActive = showPortal && isModelRoute(route);
  const libraryActive = showPortal && route === 'library';
  const [importsHost, setImportsHost] = useState<HTMLDivElement | null>(null);
  const [modelVisited, setModelVisited] = useState(modelActive);
  useEffect(() => {
    const navigate = () => {
      if (entranceDirectionRef.current === 'out' && entrancePhaseRef.current !== 'idle') return;
      const next = portalRoute(window.location.hash);
      if (navigationRef.current && navigationRef.current.route !== next) {
        navigationRef.current = null; setSectionNavigation(null); setArrivingRoute(null);
      }
      setHash(window.location.hash);
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { if (modelActive || libraryActive) setModelVisited(true); }, [modelActive, libraryActive]);
  useEffect(() => {
    const expire = () => {
      entrancePhaseRef.current = 'idle'; setEntrancePhase('idle');
      navigationRef.current = null; setSectionNavigation(null); setArrivingRoute(null);
      setSignedIn(false); setModelVisited(false); setGoogleArrival(false);
      if (signInDestination(window.location.hash) === '#/overview') window.location.hash = '';
      setHash(window.location.hash);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
  }, [setSignedIn]);
  const coverSection = useCallback((id: number) => {
    const pending = navigationRef.current;
    if (!pending || pending.id !== id || pending.phase !== 'covering') return;
    const next: SectionNavigation = { ...pending, phase: 'revealing' };
    navigationRef.current = next; setSectionNavigation(next); setArrivingRoute(next.route);
    window.location.hash = '/' + next.route;
    setHash(window.location.hash);
  }, []);
  const completeSection = useCallback((id: number) => {
    if (navigationRef.current?.id !== id) return;
    navigationRef.current = null; setSectionNavigation(null);
  }, []);
  const openSection = (section: PortalSection, link: HTMLAnchorElement) => {
    if (navigationRef.current || entrancePhaseRef.current !== 'idle') return;
    if (section.id === 'model') void import('./App').catch(() => undefined);
    if (section.id === 'theory') void import('../features/portal/pages/Theory').catch(() => undefined);
    if (section.id === 'library') void import('../features/portal/pages/DatasetStories').catch(() => undefined);
    const next: SectionNavigation = { id: ++navigationSerial.current, kind: 'open', phase: 'covering',
      route: portalRoute(section.href), section, source: captureSectionSource(link) };
    navigationRef.current = next; setWorkspaceEntering(false); setSectionNavigation(next);
  };
  const captureReturn = (event: MouseEvent<HTMLDivElement>) => {
    if (!signedIn || route === 'overview' || route === 'about' || !(event.target instanceof Element)) return;
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
      // Switch screens only after the transition overlay is opaque.
      let next: WorkspaceEntrancePhase = 'revealing';
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (entranceDirectionRef.current === 'in') {
        const destination = signInDestination(window.location.hash);
        window.location.hash = destination;
        if (destination === '#/overview' && !reducedMotion) next = 'preparing';
        setHash(destination); setSignedIn(true); setHomeArrival(null);
        setGoogleArrival(false);
      } else {
        // Leaving the workspace returns to the welcome page without ending the session.
        window.location.hash = ''; setHash('');
        if (!reducedMotion) next = 'preparing';
      }
      entrancePhaseRef.current = next;
      setEntrancePhase(next);
    } else if (entrancePhaseRef.current === 'preparing') {
      // Let the destination paint its first frame behind the opaque transition.
      entrancePhaseRef.current = 'revealing';
      setEntrancePhase('revealing');
      if (entranceDirectionRef.current === 'in') {
        setWorkspaceEntering(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }
    } else if (entrancePhaseRef.current === 'revealing') {
      entrancePhaseRef.current = 'idle'; setEntrancePhase('idle');
    }
  }, [setSignedIn]);
  const signIn = useCallback((token?: string | null) => {
    if (entrancePhaseRef.current !== 'idle') return;
    if (token !== undefined) saveDemoSession(token);
    if (signInDestination(window.location.hash) === '#/overview') {
      void import('../features/portal/animations/dataMorphRuntime').catch(() => undefined);
    }
    setTransitionReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    entranceDirectionRef.current = 'in'; setEntranceDirection('in');
    entrancePhaseRef.current = 'covering'; setEntrancePhase('covering');
  }, []);
  useEffect(() => {
    if (!googleArrival) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('auth') === 'google-success') {
      url.searchParams.delete('auth');
      window.history.replaceState(window.history.state, '', url);
    }
    // This query flag controls only the animation. Wait for the server session.
    if (sessionChecked) {
      if (signedIn && authOptions?.mode === 'atlas') signIn();
      else setGoogleArrival(false);
    }
  }, [googleArrival, sessionChecked, signedIn, authOptions?.mode, signIn]);
  const returnToWelcome = () => {
    if (!signedIn || atWelcome || entrancePhaseRef.current !== 'idle') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTransitionReducedMotion(reduced); setHomeArrival(reduced ? 'gentle' : 'full');
    entranceDirectionRef.current = 'out'; setEntranceDirection('out');
    entrancePhaseRef.current = 'covering'; setEntrancePhase('covering'); setWorkspaceEntering(false);
    navigationRef.current = null; setSectionNavigation(null); setArrivingRoute(null);
    void import('../features/welcome/globe/DataGlobe').catch(() => undefined);
  };
  const signOut = async () => {
    if (!signedIn || !atWelcome || signingOut.current || entrancePhaseRef.current !== 'idle') return;
    signingOut.current = true;
    setLogoutPending(true);
    setSignOutError(false);
    const revealWelcomeAt = performance.now() + 3500;
    try {
      if (authOptions?.mode === 'atlas' || getAccessToken()) await logout();
      clearDemoSession();
      setSignedIn(false); setModelVisited(false);
      const remaining = revealWelcomeAt - performance.now();
      if (remaining > 0) await new Promise<void>(resolve => window.setTimeout(resolve, remaining));
    } catch {
      setSignOutError(true);
    } finally {
      signingOut.current = false;
      setLogoutPending(false);
    }
  };
  useEffect(() => {
    if (entranceDirection !== 'out' || entrancePhase !== 'idle') return;
    document.querySelector<HTMLButtonElement>('.welcome-actions .welcome-primary')?.focus({ preventScroll: true });
  }, [signedIn, entranceDirection, entrancePhase]);
  useEffect(() => {
    if (entrancePhase === 'idle') return;
    // Animation events normally drive the handoff. Never leave the UI blocked
    // if an animation is cancelled, disabled by a stylesheet, or a tab is hidden.
    const expectedPhase = entrancePhase;
    const { cover, prepare, reveal } = workspaceFlightTiming[entranceDirection];
    const duration = entrancePhase === 'covering' ? cover : entrancePhase === 'preparing' ? prepare : reveal;
    const fallback = transitionReducedMotion ? 220 : duration + 220;
    const timer = window.setTimeout(() => {
      if (entrancePhaseRef.current === expectedPhase) advanceEntrance();
    }, fallback);
    return () => window.clearTimeout(timer);
  }, [entrancePhase, entranceDirection, transitionReducedMotion, advanceEntrance]);
  useEffect(() => {
    if (!workspaceEntering) return;
    if (route !== 'overview') { setWorkspaceEntering(false); return; }
    // Keep the entry class until the last shortcut has settled.
    const timer = window.setTimeout(() => setWorkspaceEntering(false), 1600);
    return () => window.clearTimeout(timer);
  }, [workspaceEntering, route]);

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

  return <>
    <div className="entry-screen" inert={transitioning || logoutPending} onClickCapture={captureReturn}
      data-transition={entrancePhase !== 'idle' ? entranceDirection : undefined}
      data-transition-phase={entrancePhase !== 'idle' ? entrancePhase : undefined}
      data-transition-motion={transitionReducedMotion ? 'gentle' : 'full'}>
      {googleArrival ? <div className="entry-loading" role="status">{tr("Opening your workspace…")}</div> : showPortal ? <>
        {!modelActive && <Portal key={route} route={route} hash={hash} onReturnToWelcome={returnToWelcome} entering={workspaceEntering} interactive={!transitioning}
          onOpenSection={openSection} {...(openingId !== undefined && { openingId })}
          sectionEntering={arrivingRoute === route && route !== 'overview'} returning={arrivingRoute === 'overview'}
          titleInTransit={Boolean(sectionNavigation?.source?.title && sectionNavigation.phase === 'revealing')} onImportsHost={setImportsHost} />}
      </> : <Welcome onSignIn={signIn} onSignOut={() => void signOut()} signedIn={signedIn} arrival={homeArrival} authOptions={authOptions}
        enteringWorkspace={entranceDirection === 'in' && entrancePhase === 'covering'} />}
      {signedIn && (modelVisited || modelActive || libraryActive) && <div className={'model-session' + (modelActive && arrivingRoute === route ? ' model-session--arriving' : '')} hidden={!modelActive}>
        <Suspense fallback={<div className="entry-loading" role="status">{tr("Opening your workspace…")}</div>}><Workspace active={modelActive} persistent={authOptions?.mode === 'atlas'} importsHost={libraryActive ? importsHost : null} /></Suspense>
      </div>}
    </div>
    <div className="welcome-signout-veil" data-active={logoutPending} aria-hidden="true">
      <div className="welcome-signout-mark"><TeamLogo /><span /></div>
    </div>
    {logoutPending && <p className="entry-transition-status" role="status">{t('Signing out…', 'Đang đăng xuất…')}</p>}
    {signOutError && <div className="workspace-notice fixed bottom-4 right-4 z-[70] rounded border bg-[var(--bg-panel)] p-3" role="alert">{t('Could not sign out. Please try again.', 'Chưa thể đăng xuất. Hãy thử lại.')}</div>}
    {entrancePhase !== 'idle' && <>
      <WorkspaceEntrance phase={entrancePhase} onComplete={advanceEntrance} direction={entranceDirection}
        reducedMotion={transitionReducedMotion} />
      <p className="entry-transition-status" role="status">{entranceDirection === 'out' ? tr("Returning to the welcome page…") : tr("Entering Workspace…")}</p>
    </>}
    {sectionNavigation && <>
      <SectionTransition navigation={sectionNavigation} onCovered={coverSection} onComplete={completeSection} />
      <p className="entry-transition-status" role="status">{sectionNavigation.kind === 'back' ? tr("Returning to Workspace…") : t(`Opening ${sectionNavigation.section?.title ?? ''}…`, `Đang mở ${tr(sectionNavigation.section?.title ?? '')}…`)}</p>
    </>}
  </>;
}

