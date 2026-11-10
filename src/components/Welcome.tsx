import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { LabMark } from './LabMark';
import { DataAtmosphere } from './DataAtmosphere';
import { useDialogFocus } from '../utils/useDialogFocus';
import { DEMO_EMAIL, DEMO_PASSWORD, validDemoCredentials } from '../utils/demoSession';
import { fetchWithTimeout } from '../utils/network';
import type { WelcomeTheme } from '../utils/welcomePreferences';
import { useAppTheme } from './ThemeProvider';
import { useWelcomeLanguage } from './WelcomeLanguage';
import { WelcomeSettings } from './WelcomeSettings';
import type { GlobeMode } from './DataGlobe';
import { shouldPlayGenesis } from '../visuals/welcomeGenesis';
import './welcome.css';
import './welcome-exploration.css';
import './welcome-genesis.css';

const DataGlobe = lazy(() => import('./DataGlobe').then(module => ({ default: module.DataGlobe })));
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
let genesisStartedInPage = false;

class GlobeBoundary extends Component<{ fallback: ReactNode; onFailure: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
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

type AuthOptions = { mode: 'atlas' | 'demo'; google: boolean } | null;

function LoginPanel({ onClose, onSignIn, authOptions, googleError }: { onClose: () => void; onSignIn: (token: string | null) => void; authOptions: AuthOptions; googleError: boolean }) {
  const { t } = useWelcomeLanguage();
  const [closing, setClosing] = useState(false);
  const close = () => { loginRequest.current?.abort(); setClosing(true); };
  const dialog = useDialogFocus(true, close, authOptions?.mode === 'atlas' ? '.login-google' : 'input[type=email]');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const loginRequest = useRef<AbortController | null>(null);
  useEffect(() => () => loginRequest.current?.abort(), []);
  async function signIn() {
    if (closing || loginRequest.current) return;
    const request = new AbortController();
    loginRequest.current = request;
    setSubmitting(true);
    setError(false);
    try {
      const response = await fetchWithTimeout('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }), signal: request.signal,
      }, 5000);
      if (response.ok) {
        const result = await response.json();
        if (!request.signal.aborted && typeof result.data?.token === 'string') {
          onSignIn(result.data.token);
          return;
        }
      }
      if (![502, 503, 504].includes(response.status) && (response.status !== 500 || response.headers.get('content-type')?.includes('application/json'))) {
        if (!request.signal.aborted) setError(true);
        return;
      }
    } catch { /* The bundled sample workspace can run with no server. */ }
    finally { loginRequest.current = null; if (!request.signal.aborted) setSubmitting(false); }
    if (!request.signal.aborted) {
      if (validDemoCredentials(email, password)) onSignIn(null);
      else setError(true);
    }
  }
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClose, 420);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);
  return <div className={'login-backdrop' + (closing ? ' is-closing' : '')} onClick={close}>
    <div className="login-panel" role="dialog" aria-modal="true" aria-labelledby="login-title" tabIndex={-1} ref={dialog} onClick={event => event.stopPropagation()}
      onAnimationEnd={event => { if (closing && event.target === event.currentTarget) onClose(); }}>
      <header className="login-step login-step--header"><span>{t('DIMENSION / LAB — ACCESS', 'DIMENSION / LAB — ĐĂNG NHẬP')}</span><button className="login-close" aria-label={t('Close login panel', 'Đóng bảng đăng nhập')} onClick={close}><X size={18} /></button></header>
      <LabMark className="login-logo login-step login-step--logo" />
      <h2 id="login-title" className="login-step login-step--title">{t('Sign in', 'Đăng nhập')}</h2>
      {authOptions?.mode === 'atlas' ? <>
        {googleError && <p role="alert" className="login-error">{t('Google sign-in could not be completed. Please try again.', 'Không thể hoàn tất đăng nhập Google. Hãy thử lại.')}</p>}
        {authOptions.google ? <a className="lab-action login-google" href="/api/auth/google">{t('Sign in with Google', 'Đăng nhập với Google')}</a>
          : <p role="status">{t('Google sign-in is unavailable. Contact your workspace administrator.', 'Chưa thể đăng nhập bằng Google. Hãy liên hệ quản trị viên.')}</p>}
      </> : authOptions?.mode === 'demo' ? <>
      <form onSubmit={event => { event.preventDefault(); void signIn(); }}>
        <div className="login-field login-step login-step--email">
        <label htmlFor="login-email">{t('Email address', 'Địa chỉ email')}</label>
        <input id="login-email" type="email" autoComplete="username" placeholder="you@example.com" value={email} required onChange={event => { setEmail(event.target.value); setError(false); }} aria-invalid={error} aria-describedby={error ? 'login-error' : undefined} />
        </div>
        <div className="login-field login-step login-step--password">
        <label htmlFor="login-password">{t('Password', 'Mật khẩu')}</label>
        <div className="login-password"><input id="login-password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder={t('Enter your password', 'Nhập mật khẩu của bạn')} required value={password} onChange={event => { setPassword(event.target.value); setError(false); }} aria-invalid={error} aria-describedby={error ? 'login-error' : undefined} /><button className="login-visibility-toggle" type="button" aria-controls="login-password" aria-label={visible ? t('Hide password', 'Ẩn mật khẩu') : t('Show password', 'Hiện mật khẩu')} onClick={() => setVisible(value => !value)}>{visible ? t('HIDE', 'ẨN') : t('SHOW', 'HIỆN')}</button></div>
        </div>
        {error && <p role="alert" id="login-error" className="login-error">{t('Email or password is incorrect. Use the demo account below.', 'Email hoặc mật khẩu chưa đúng. Hãy dùng tài khoản mẫu bên dưới.')}</p>}
        <button className="welcome-primary login-submit login-step login-step--submit" type="submit" disabled={closing || submitting}><span>{t('Sign in', 'Đăng nhập')}</span><ArrowUpRight size={18} aria-hidden="true" /></button>
      </form>
      <div className="login-demo">
        <button type="button" className="lab-action login-demo-action login-step login-step--demo" onClick={() => { setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); setError(false); }}><span>{t('Use demo account', 'Dùng tài khoản mẫu')}</span><ArrowUpRight size={14} aria-hidden="true" /></button>
      </div>
      </> : <p role="status">{t('Checking sign-in options…', 'Đang kiểm tra phương thức đăng nhập…')}</p>}
    </div>
  </div>;
}

type WelcomeProps = { onSignIn: (token?: string | null) => void; signedIn?: boolean; arrival?: 'full' | 'gentle' | null; authOptions?: AuthOptions };
export function Welcome(props: WelcomeProps) {
  const { theme, setMode } = useAppTheme();
  return <WelcomeScreen {...props} theme={theme} onTheme={setMode} />;
}

function WelcomeScreen({ onSignIn, signedIn, arrival = null, theme, onTheme, authOptions = null }: WelcomeProps & {
  theme: 'light' | 'dark'; onTheme: (theme: WelcomeTheme) => void;
}) {
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
  const [login, setLogin] = useState(googleError);
  useEffect(() => {
    if (googleError) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash);
  }, [googleError]);
  const [active, setActive] = useState<number | null>(null);
  const [globeControlsHost, setGlobeControlsHost] = useState<HTMLDivElement | null>(null);
  const [explorationControlsHost, setExplorationControlsHost] = useState<HTMLDivElement | null>(null);
  const [globeMode, setGlobeMode] = useState<GlobeMode>('atlas');
  const [genesisPhase, setGenesisPhase] = useState<'playing' | 'finished' | 'bypassed'>(() =>
    shouldPlayGenesis(Boolean(arrival), genesisStartedInPage, systemReduced) ? 'playing' : 'bypassed');
  const genesisId = genesisPhase === 'playing' ? 1 : null;
  const [startedId, setStartedId] = useState<number | null>(null);
  const genesisVisited = genesisPhase === 'playing' || genesisPhase === 'finished';
  const genesisHost = useRef<HTMLCanvasElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const focusAfterSkip = useRef(false);
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
    title: t('LESS NOISE. MORE DIMENSION.', 'ÍT NHIỄU. THÊM GÓC NHÌN.'),
    lines: [t('LESS NOISE.', 'ÍT NHIỄU.'), t('MORE DIMENSION', 'THÊM GÓC NHÌN')],
    description: t('DISCOVER PATTERNS BEYOND WHAT YOU CAN SEE.', 'KHÁM PHÁ NHỮNG QUY LUẬT VƯỢT NGOÀI TẦM NHÌN.'),
  };
  const concept = active === null ? null : items[active];
  useEffect(() => { document.title = t('Dimension Lab — A world of dimensions', 'Dimension Lab — Thế giới đa chiều'); return () => { document.title = 'Dimension Lab — Interactive Data Exploration'; }; }, [t]);
  const selectConcept = (index: number) => {
    setActive(current => current === index ? null : index);
  };
  const openLogin = () => {
    if (genesisId !== null) finishGenesis();
    setActive(null);
    if (signedIn) onSignIn();
    else setLogin(true);
  };
  return <div className={'welcome-page' + (arrival ? ' welcome-page--returning' : '')} lang={language} data-theme={theme} data-globe-mode={globeMode} data-arrival-motion={arrival ?? undefined} data-motion={motionEnabled ? 'full' : 'gentle'} data-login-open={login || undefined}
    data-genesis={genesisId !== null || undefined} data-genesis-visited={genesisVisited || undefined}>
    {genesisId !== null && <>
      <canvas className="welcome-genesis" ref={genesisHost} aria-hidden="true" />
      <div className="genesis-pointer-guard" aria-hidden="true" />
    </>}
    <DataAtmosphere variant="welcome" active={!login && genesisId === null} />
    <div className="welcome-surface" inert={login || genesisId !== null}>
    <header className="welcome-header">
      <a href="#/" className="workspace-brand" aria-label={t('Dimension Lab welcome', 'Trang chủ Dimension Lab')}>
        <LabMark className="welcome-mark" /> DIMENSION <span className="brand-slash">/</span> LAB
      </a>
      <nav className="welcome-concepts" aria-label={t('Globe concepts', 'Các chủ đề khám phá')}>
        {items.map((item, index) => (
          <button key={index} aria-label={t('Discover ', 'Chủ đề: ') + item.name.toLowerCase()}
            aria-pressed={active === index} aria-expanded={active === index} aria-controls={active === index ? 'welcome-concept-panel' : undefined} onClick={() => selectConcept(index)}>
            <span className="welcome-concept-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="welcome-concept-label" aria-hidden="true">{item.name}</span>
          </button>
        ))}
      </nav>
      <div className="welcome-globe-modes" ref={setGlobeControlsHost} />
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
          <button ref={enterRef} className="welcome-primary welcome-enter" onClick={openLogin}>{t('ENTER THE LAB', 'VÀO PHÒNG LAB')}</button>
        </div>
      </section>
      <GlobeBoundary
        onFailure={finishGenesis}
        fallback={<div className="data-globe globe-loading" role="status">{t('The globe is unavailable.', 'Hiện không tải được quả cầu.')}</div>}
      >
        <Suspense fallback={<div className="data-globe globe-loading" role="status" aria-hidden={genesisId !== null}>{t('Loading the data globe…', 'Đang tải quả cầu dữ liệu…')}</div>}>
          <DataGlobe suspended={login} motionEnabled={motionEnabled} theme={theme} modeControlsTarget={globeControlsHost} explorationControlsTarget={explorationControlsHost}
            onModeChange={mode => { setGlobeMode(mode); setActive(null); }} showDetails={active === null}
            genesis={genesisId === null ? undefined : { id: genesisId, host: genesisHost, onStarted: setStartedId, onComplete: finishGenesis }}
            onExplore={() => setActive(null)} />
        </Suspense>
      </GlobeBoundary>
      {concept && <section id="welcome-concept-panel" className="welcome-concept" aria-labelledby="welcome-concept-title">
        <button type="button" aria-label={t('Close concept', 'Đóng chủ đề')} onClick={() => setActive(null)}><X size={16} /></button>
        <p className="welcome-eyebrow">{t('THE DATA EXPLORATION LAB', 'KHÁM PHÁ DỮ LIỆU')}</p>
        <h2 id="welcome-concept-title">{concept.name}</h2>
        <p>{concept.text}</p>
      </section>}
    </main>
    <footer className="welcome-footer"><WelcomeSettings theme={theme} onTheme={onTheme} /></footer>
    </div>
    {login && <LoginPanel onClose={() => setLogin(false)} onSignIn={onSignIn} authOptions={authOptions} googleError={googleError} />}
  </div>;
}

