import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LogOut, X } from 'lucide-react';
import type { AuthOptions } from '@dimension-lab/contracts';
import { LoginPanel } from '../auth/components/LoginPanel';
import { TeamLogo } from '../../shared/ui/TeamLogo';
import { ThemeToggle } from '../../shared/ui/ThemeToggle';
import { DataAtmosphere } from './animations/DataAtmosphere';
import { useAppTheme } from '../../shared/providers/ThemeProvider';
import { useWelcomeLanguage } from '../../shared/providers/WelcomeLanguage';
import type { GlobeMode } from './globe/DataGlobe';
import { shouldPlayGenesis } from './animations/welcomeGenesis';
import './styles/welcome.css';
import './styles/welcome-settings.css';
import './styles/welcome-exploration.css';
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
const concepts = [
  { name: 'Data', text: 'Every point holds a story. Start with the data you want to understand.' },
  { name: 'Dimensions', text: 'Look beyond individual features. Find a new perspective in three dimensions.' },
  { name: 'Patterns', text: 'Reveal relationships that are difficult to see in a table.' },
  { name: 'Clusters', text: 'Discover natural groups and the points that stand apart.' },
  { name: 'Exploration', text: 'Rotate, inspect, and experiment. Let curiosity guide the next question.' },
];
const vietnameseConcepts = [
  { name: 'Dữ liệu', text: 'Mỗi điểm chứa một câu chuyện. Bắt đầu từ dữ liệu bạn muốn tìm hiểu.' },
  { name: 'Các chiều', text: 'Nhìn xa hơn từng đặc trưng. Tìm một góc nhìn mới trong không gian ba chiều.' },
  { name: 'Quy luật', text: 'Khám phá những mối liên hệ khó nhận ra trong bảng dữ liệu.' },
  { name: 'Phân cụm', text: 'Tìm các nhóm tự nhiên và những điểm khác biệt.' },
  { name: 'Khám phá', text: 'Xoay, xem xét và thử nghiệm. Để sự tò mò dẫn lối cho câu hỏi tiếp theo.' },
];

type WelcomeProps = { onSignIn: (token?: string | null) => void; onSignOut?: () => void; signedIn?: boolean; arrival?: 'full' | 'gentle' | null; authOptions?: AuthOptions | null };
export function Welcome({ onSignIn, onSignOut, signedIn, arrival = null, authOptions = null }: WelcomeProps) {
  const { theme } = useAppTheme();
  const { language, t } = useWelcomeLanguage();
  const items = language === 'vi' ? vietnameseConcepts : concepts;
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
  const [active, setActive] = useState<number | null>(null);
  const conceptButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const [globeControlsHost, setGlobeControlsHost] = useState<HTMLDivElement | null>(null);
  const [explorationControlsHost, setExplorationControlsHost] = useState<HTMLDivElement | null>(null);
  const [globeMode, setGlobeMode] = useState<GlobeMode>('atlas');
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
  const exploring = globeMode !== 'atlas';
  const intro = globeMode === 'terrain' ? {
    eyebrow: t('POPULATION / 2026', 'DÂN SỐ / 2026'),
    title: t('Population terrain.', 'Địa hình dân số.'),
    lines: [t('Population terrain', 'Địa hình dân số')],
    description: t('Explore the shape of population density.', 'Khám phá hình dạng mật độ dân số.'),
  } : globeMode === 'stories' ? {
    eyebrow: t('VISUAL STORIES', 'CÂU CHUYỆN TRỰC QUAN'),
    title: t('Every point, a story.', 'Mỗi điểm, một câu chuyện.'),
    lines: [t('Every point, a story', 'Mỗi điểm, một câu chuyện')],
    description: t('Discover the ideas behind the data.', 'Khám phá những ý tưởng đằng sau dữ liệu.'),
  } : {
    eyebrow: t('THE DATA EXPLORATION LAB', 'PHÒNG THÍ NGHIỆM KHÁM PHÁ DỮ LIỆU'),
    title: t('LESS NOISE MORE DIMENSION.', 'ÍT NHIỄU THÊM GÓC NHÌN.'),
    lines: [t('LESS NOISE', 'ÍT NHIỄU'), t('MORE', 'THÊM'), t('DIMENSION', 'GÓC NHÌN')],
    description: t('Discover patterns beyond what you can see.', 'Khám phá những quy luật vượt ngoài tầm nhìn.'),
  };
  const concept = active === null ? null : items[active];
  useEffect(() => { document.title = t('Dimension Lab — A world of dimensions', 'Dimension Lab — Thế giới đa chiều'); return () => { document.title = 'Dimension Lab — Interactive Data Exploration'; }; }, [t]);
  const selectConcept = (index: number) => {
    setActive(current => current === index ? null : index);
  };
  const closeConcept = useCallback(() => {
    if (active === null) return;
    setActive(null);
    conceptButtons.current[active]?.focus({ preventScroll: true });
  }, [active]);
  useEffect(() => {
    if (active === null || login || genesisId !== null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closeConcept();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [active, closeConcept, login, genesisId]);
  const openLogin = () => {
    if (genesisId !== null) finishGenesis();
    setActive(null);
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
      <div className="welcome-concept-group" data-open={concept ? '' : undefined}>
        <nav className="welcome-concepts" aria-label={t('Globe concepts', 'Các chủ đề khám phá')}>
          {items.map((item, index) => (
            <button key={item.name} type="button" ref={element => { conceptButtons.current[index] = element; }}
              aria-label={t('Discover ', 'Chủ đề: ') + item.name.toLowerCase()}
              aria-pressed={active === index} aria-expanded={active === index} aria-controls={active === index ? 'welcome-concept-panel' : undefined} onClick={() => selectConcept(index)}>
              <span className="welcome-concept-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="welcome-concept-label" aria-hidden="true">{item.name}</span>
            </button>
          ))}
        </nav>
        {concept && <section id="welcome-concept-panel" className="welcome-concept" aria-labelledby="welcome-concept-title">
          <div className="welcome-concept-heading">
            <h2 id="welcome-concept-title">{concept.name}</h2>
            <button type="button" aria-label={t('Close concept', 'Đóng chủ đề')} onClick={closeConcept}><X size={16} aria-hidden="true" /></button>
          </div>
          <p>{concept.text}</p>
        </section>}
      </div>
      <div className="welcome-globe-modes" ref={setGlobeControlsHost} />
      <div className="welcome-theme-toggle"><ThemeToggle /></div>
    </header>
    <main className="welcome-main">
      <section className={'welcome-copy' + (exploring ? ' welcome-copy--exploring' : '')}>
        <div className="welcome-mode-intro" key={globeMode}>
        <p className="welcome-eyebrow"><span /> {intro.eyebrow}</p>
        <h1 aria-label={intro.title}>{intro.lines.map((line, index) => <span className="welcome-title-line" aria-hidden="true" key={index}><span>{line}{index === intro.lines.length - 1 && <span className="welcome-period">.</span>}</span></span>)}</h1>
        <p className="welcome-description">{intro.description}</p>
        </div>
        <div className="welcome-exploration-controls" ref={setExplorationControlsHost} hidden={!exploring} tabIndex={exploring ? 0 : undefined}
          role="region" aria-label={t('Exploration controls and details', 'Điều khiển và thông tin khám phá')} />
        <div className="welcome-actions">
          <button ref={enterRef} className="welcome-primary welcome-enter" onClick={openLogin}>
            {t('ENTER THE LAB', 'VÀO PHÒNG LAB')}
          </button>
          {signedIn && onSignOut && <button className="welcome-signout" type="button" onClick={onSignOut}>
            <LogOut size={15} aria-hidden="true" /> {t('Sign out', 'Đăng xuất')}
          </button>}
        </div>
      </section>
      <GlobeBoundary
        onFailure={finishGenesis}
        fallback={<div className="data-globe globe-loading" role="status">{t('The globe is unavailable.', 'Hiện không tải được quả cầu.')}</div>}
      >
        <Suspense fallback={<div className="data-globe globe-loading" role="status" aria-hidden={genesisId !== null}>{t('Loading the data globe…', 'Đang tải quả cầu dữ liệu…')}</div>}>
          <DataGlobe suspended={loginPhase === 'open'} motionEnabled={motionEnabled} theme={theme} modeControlsTarget={globeControlsHost} explorationControlsTarget={explorationControlsHost}
            onModeChange={mode => { setGlobeMode(mode); setActive(null); }} showDetails={active === null}
            {...(genesisId !== null && { genesis: { id: genesisId, host: genesisHost, logo: genesisLogo, onStarted: setStartedId, onComplete: finishGenesis } })}
            onExplore={() => setActive(null)} />
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

