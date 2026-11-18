import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import type { AuthOptions } from '@dimension-lab/contracts';
import { LoginPanel } from '../auth/components/LoginPanel';
import { TeamLogo } from '../../shared/ui/TeamLogo';
import { ThemeToggle } from '../../shared/ui/ThemeToggle';
import { DataAtmosphere } from './animations/DataAtmosphere';
import { useAppTheme } from '../../shared/providers/ThemeProvider';
import { useWelcomeLanguage } from '../../shared/providers/WelcomeLanguage';
import { shouldPlayGenesis } from './animations/welcomeGenesis';
import './styles/welcome.css';
import './styles/welcome-settings.css';
import './styles/welcome-genesis.css';

const DataGlobe = lazy(() => import('./globe/DataGlobe').then(module => ({ default: module.DataGlobe })));
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
let genesisStartedInPage = false;

class GlobeBoundary extends Component<{ fallback: ReactNode; onFailure: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch() { this.props.onFailure(); }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
type WelcomeProps = { onSignIn: (token?: string | null) => void; onSignOut?: () => void; signedIn?: boolean; arrival?: 'full' | 'gentle' | null; authOptions?: AuthOptions | null };
export function Welcome({ onSignIn, onSignOut, signedIn, arrival = null, authOptions = null }: WelcomeProps) {
  const { theme } = useAppTheme();
  const { language, t } = useWelcomeLanguage();
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia(reducedMotionQuery).matches);
  const motionEnabled = !systemReduced;
  useEffect(() => {
    const preference = window.matchMedia(reducedMotionQuery);
    const sync = () => setSystemReduced(preference.matches);
    sync();
    preference.addEventListener('change', sync);
    return () => preference.removeEventListener('change', sync);
  }, []);
  const [googleError] = useState(() => new URLSearchParams(window.location.search).get('auth') === 'google-error');
  const [loginPhase, setLoginPhase] = useState<'welcome' | 'opening' | 'open' | 'closing'>(googleError ? 'open' : 'welcome');
  const login = loginPhase !== 'welcome';
  useEffect(() => {
    if (googleError) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash);
  }, [googleError]);
  const globeMode = 'atlas';
  const [genesisPhase, setGenesisPhase] = useState<'playing' | 'finished' | 'bypassed'>(() =>
    shouldPlayGenesis(Boolean(arrival) || googleError, genesisStartedInPage, systemReduced) ? 'playing' : 'bypassed');
  const genesisId = genesisPhase === 'playing' ? 1 : null;
  const [startedId, setStartedId] = useState<number | null>(null);
  const genesisVisited = genesisPhase === 'playing' || genesisPhase === 'finished';
  const genesisHost = useRef<HTMLCanvasElement>(null);
  const genesisLogo = useRef<HTMLSpanElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const focusAfterLogin = useRef(false);
  const focusAfterSkip = useRef(false);
  useEffect(() => {
    if (loginPhase !== 'welcome' || !focusAfterLogin.current) return;
    focusAfterLogin.current = false;
    enterRef.current?.focus({ preventScroll: true });
  }, [loginPhase]);
  const finishGenesis = useCallback(() => {
    setGenesisPhase(current => current === 'playing' ? 'finished' : current);
  }, []);
  useEffect(() => {
    if (genesisId === null) return;
    genesisStartedInPage = true;
    if (systemReduced) finishGenesis();
  }, [genesisId, systemReduced, finishGenesis]);
  useEffect(() => {
    if (genesisId === null) {
      if (focusAfterSkip.current) {
        focusAfterSkip.current = false;
        enterRef.current?.focus({ preventScroll: true });
      }
      return;
    }
    if (startedId === genesisId) return;
    // A restored tab can stay hidden until the user opens it. Give the globe
    // time to start once the page is visible.
    let timeout: number | undefined;
    const startTimeout = () => {
      window.clearTimeout(timeout);
      if (!document.hidden) timeout = window.setTimeout(finishGenesis, 8000);
    };
    startTimeout();
    document.addEventListener('visibilitychange', startTimeout);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', startTimeout);
    };
  }, [genesisId, startedId, finishGenesis]);
  useEffect(() => {
    if (genesisId === null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      focusAfterSkip.current = true;
      finishGenesis();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [genesisId, finishGenesis]);
  const intro = {
    eyebrow: t('THE DATA EXPLORATION LAB', 'PHÒNG THÍ NGHIỆM KHÁM PHÁ DỮ LIỆU'),
    title: t('LESS NOISE MORE DIMENSION.', 'ÍT NHIỄU THÊM GÓC NHÌN.'),
    lines: [t('LESS NOISE', 'ÍT NHIỄU'), t('MORE', 'THÊM'), t('DIMENSION', 'GÓC NHÌN')],
    description: t('Discover patterns beyond what you can see.', 'Khám phá những quy luật vượt ngoài tầm nhìn.'),
  };
  useEffect(() => { document.title = t('Dimension Lab — A world of dimensions', 'Dimension Lab — Thế giới đa chiều'); return () => { document.title = 'Dimension Lab — Interactive Data Exploration'; }; }, [t]);
  const openLogin = () => {
    if (genesisId !== null) finishGenesis();
    if (signedIn) onSignIn();
    else setLoginPhase('opening');
  };
  const closeLogin = () => {
    setLoginPhase('closing');
  };
  const finishLoginTransition = () => {
    if (loginPhase === 'opening') setLoginPhase('open');
    if (loginPhase === 'closing') {
      focusAfterLogin.current = true;
      setLoginPhase('welcome');
    }
  };
  return <div className={'welcome-page' + (arrival ? ' welcome-page--returning' : '')} lang={language} data-theme={theme} data-globe-mode={globeMode} data-arrival-motion={arrival ?? undefined} data-motion={motionEnabled ? 'full' : 'gentle'} data-login-phase={loginPhase}
    data-genesis={(!login && genesisId !== null) || undefined} data-genesis-visited={genesisVisited || undefined}>
    {!login && genesisId !== null && <>
      <canvas className="welcome-genesis" ref={genesisHost} aria-hidden="true" />
      <div className="genesis-pointer-guard" aria-hidden="true" />
    </>}
    <DataAtmosphere variant="welcome" active={loginPhase !== 'open' && genesisId === null} />
    <div className="welcome-surface" inert={login || genesisId !== null}>
    <header className="welcome-header">
      <a href="#/" className="welcome-brand" aria-label={t('Dimension Lab welcome', 'Trang chủ Dimension Lab')}>
        <TeamLogo ref={genesisLogo} />
      </a>
      <div className="welcome-header-actions">
        <div className="welcome-theme-toggle"><ThemeToggle /></div>
        {signedIn && onSignOut && <button className="welcome-signout" type="button" onClick={onSignOut}>
          <LogOut size={15} aria-hidden="true" /> {t('Sign out', 'Đăng xuất')}
        </button>}
      </div>
    </header>
    <main className="welcome-main">
      <section className="welcome-copy">
        <div className="welcome-intro">
        <p className="welcome-eyebrow"><span /> {intro.eyebrow}</p>
        <h1 aria-label={intro.title}>{intro.lines.map((line, index) => <span className="welcome-title-line" aria-hidden="true" key={index}><span>{line}{index === intro.lines.length - 1 && <span className="welcome-period">.</span>}</span></span>)}</h1>
        <p className="welcome-description">{intro.description}</p>
        </div>
        <div className="welcome-actions">
          <button ref={enterRef} className="welcome-primary welcome-enter" onClick={openLogin}>
            {t('ENTER THE LAB', 'VÀO PHÒNG LAB')}
          </button>
        </div>
      </section>
      <GlobeBoundary
        onFailure={finishGenesis}
        fallback={<div className="data-globe globe-loading" role="status">{t('The globe is unavailable.', 'Hiện không tải được quả cầu.')}</div>}
      >
        <Suspense fallback={<div className="data-globe globe-loading" role="status" aria-hidden={genesisId !== null}>{t('Loading the data globe…', 'Đang tải quả cầu dữ liệu…')}</div>}>
          <DataGlobe suspended={loginPhase === 'open'} motionEnabled={motionEnabled} theme={theme}
            {...(genesisId !== null && { genesis: { id: genesisId, host: genesisHost, logo: genesisLogo, onStarted: setStartedId, onComplete: finishGenesis } })}
          />
        </Suspense>
      </GlobeBoundary>
    </main>
    </div>
    {login && <div className="welcome-login-layer" inert={loginPhase === 'closing'} onAnimationEnd={event => {
      if (event.target === event.currentTarget) finishLoginTransition();
    }}>
      <LoginPanel onClose={closeLogin} onSignIn={onSignIn} authOptions={authOptions} googleError={googleError} />
    </div>}
  </div>;
}

