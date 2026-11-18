import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import type { AuthOptions } from '@dimension-lab/contracts';
import { DEMO_EMAIL, DEMO_PASSWORD, validDemoCredentials } from '@dimension-lab/contracts/demo';
import { useWelcomeLanguage } from '../../../shared/providers/WelcomeLanguage';
import { fetchWithTimeout } from '../../../shared/api/network';
import { getApiDataRecord } from '../../../shared/api/typeGuards';
import { TeamLogo } from '../../../shared/ui/TeamLogo';
import { LoginBackdrop } from './LoginBackdrop';
import './login.css';

export function LoginPanel({ onClose, onSignIn, authOptions, googleError }: { onClose: () => void; onSignIn: (token?: string | null) => void; authOptions: AuthOptions | null; googleError: boolean }) {
  const { t } = useWelcomeLanguage();
  const heading = useRef<HTMLHeadingElement>(null);
  const [emailEntered, setEmailEntered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [feedback, setFeedback] = useState('');
  const [registered, setRegistered] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const loginRequest = useRef<AbortController | null>(null);
  useEffect(() => () => loginRequest.current?.abort(), []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [registering, emailEntered]);
  const close = () => { loginRequest.current?.abort(); onClose(); };
  async function signIn() {
    if (loginRequest.current) return;
    const atlas = authOptions?.mode === 'atlas';
    setFeedback('');
    setRegistered(false);
    if (registering && (password !== confirmation || !displayName.trim() || [...password].length < 12
      || new TextEncoder().encode(password).length > 512)) {
      setFeedback(t('Enter a display name and matching passwords of at least 12 characters and at most 512 bytes.',
        'Hãy nhập tên hiển thị và hai mật khẩu giống nhau, tối thiểu 12 ký tự và tối đa 512 byte.'));
      return;
    }
    const request = new AbortController();
    loginRequest.current = request;
    setSubmitting(true);
    setError(false);
    try {
      const response = await fetchWithTimeout(registering ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(registering && { displayName }) }), signal: request.signal,
      }, atlas ? 15000 : 5000);
      if (atlas) {
        if (response.ok) {
          const data = getApiDataRecord(await response.json());
          if (request.signal.aborted) return;
          if (registering && data?.registered === true) {
            setRegistering(false);
            setRegistered(true);
            setPassword('');
            setConfirmation('');
            setVisible(false);
            return;
          }
          if (!registering && data?.authenticated === true) {
            onSignIn();
            return;
          }
        }
        if (response.status === 401) setFeedback(t('Email or password is incorrect.', 'Email hoặc mật khẩu chưa đúng.'));
        else if (response.status === 409) setFeedback(t('This email is already registered.', 'Email này đã được đăng ký.'));
        else if (response.status === 429) setFeedback(t('Too many attempts. Try again in a minute.', 'Bạn đã thử quá nhiều lần. Hãy thử lại sau một phút.'));
        else if (response.status === 400) setFeedback(t('Check the information you entered.', 'Hãy kiểm tra lại thông tin đã nhập.'));
        else setFeedback(t('The request could not be completed. Try again.', 'Không thể hoàn tất yêu cầu. Hãy thử lại.'));
        return;
      }
      if (response.ok) {
        const data = getApiDataRecord(await response.json());
        if (!request.signal.aborted && typeof data?.token === 'string') {
          onSignIn(data.token);
          return;
        }
      }
      if (![502, 503, 504].includes(response.status) && (response.status !== 500 || response.headers.get('content-type')?.includes('application/json'))) {
        if (!request.signal.aborted) setError(true);
        return;
      }
    } catch {
      if (atlas) {
        if (!request.signal.aborted) setFeedback(t('Could not reach the server. Try again.', 'Không thể kết nối máy chủ. Hãy thử lại.'));
        return;
      }
    }
    finally { loginRequest.current = null; if (!request.signal.aborted) setSubmitting(false); }
    if (!request.signal.aborted) {
      if (validDemoCredentials(email, password)) onSignIn(null);
      else setError(true);
    }
  }
  return <main className="login-page" aria-labelledby="login-title" onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) close();
  }}>
    <LoginBackdrop />
    <button className="back-control back-control--icon login-back control-glass" type="button" aria-label="Back to welcome" onClick={close}>
      <ArrowLeft size={20} strokeWidth={1.7} aria-hidden="true" />
    </button>
    <div className="login-content">
      <header className="login-heading">
        <h1 id="login-title" ref={heading} tabIndex={-1}>{!emailEntered ? t('Log in or sign up', 'Đăng nhập hoặc đăng ký') : registering ? t('Create account', 'Tạo tài khoản') : t('Sign in', 'Đăng nhập')}</h1>
        <TeamLogo label="Dimension Lab" />
      </header>
      <p className="login-subtitle">{t('Explore your data and discover the patterns within.', 'Khám phá dữ liệu và tìm ra những quy luật bên trong.')}</p>
      {authOptions ? <>
      {googleError && !registering && <p role="alert" className="login-error">{t('Google sign-in could not be completed. Please try again.', 'Không thể hoàn tất đăng nhập Google. Hãy thử lại.')}</p>}
      {registered && <p role="status">{t('Account created. Sign in with your password.', 'Đã tạo tài khoản. Hãy nhập mật khẩu để đăng nhập.')}</p>}
      <form onSubmit={event => { event.preventDefault(); if (emailEntered) void signIn(); else setEmailEntered(true); }}>
        {registering && <div className="login-field">
          <label htmlFor="login-name">{t('Display name', 'Tên hiển thị')}</label>
          <input id="login-name" autoComplete="name" maxLength={80} required value={displayName} onChange={event => setDisplayName(event.target.value)} />
        </div>}
        <div className="login-field login-email-field">
        <label htmlFor="login-email">{t('Email address', 'Địa chỉ email')}</label>
        <input id="login-email" type="email" autoComplete="username" maxLength={254} value={email} required onChange={event => { setEmail(event.target.value); setError(false); }} aria-invalid={error} aria-describedby={error ? 'login-error' : undefined} />
        </div>
        {emailEntered && <div className="login-field">
          <label htmlFor="login-password">{t('Password', 'Mật khẩu')}</label>
          <div className="login-password">
            <input id="login-password" type={visible ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'}
              placeholder={registering ? t('At least 12 characters', 'Tối thiểu 12 ký tự') : t('Enter your password', 'Nhập mật khẩu của bạn')}
              required value={password} onChange={event => { setPassword(event.target.value); setError(false); }}
              aria-invalid={error} aria-describedby={error ? 'login-error' : undefined} />
            <button className="login-visibility-toggle" type="button" aria-controls="login-password"
              aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(value => !value)}>
              {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>}
        {registering && <div className="login-field">
          <label htmlFor="login-confirmation">{t('Confirm password', 'Xác nhận mật khẩu')}</label>
          <input id="login-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        </div>}
        {feedback && <p role="alert" className="login-error">{feedback}</p>}
        {error && <p role="alert" id="login-error" className="login-error">{t('Email or password is incorrect. Use the demo account below.', 'Email hoặc mật khẩu chưa đúng. Hãy dùng tài khoản mẫu bên dưới.')}</p>}
        <button className={emailEntered ? 'login-submit' : 'login-submit liquid-glass'} type="submit" disabled={submitting}>{!emailEntered ? t('Continue', 'Tiếp tục') : submitting ? t('Please wait…', 'Vui lòng đợi…') : registering ? t('Create account', 'Tạo tài khoản') : t('Sign in', 'Đăng nhập')}</button>
      </form>
      {authOptions.mode === 'demo' && <div className="login-demo">
        <button type="button" className="login-option" disabled={submitting} onClick={() => { setEmailEntered(true); setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); setError(false); }}><span>{t('Use demo account', 'Dùng tài khoản mẫu')}</span></button>
      </div>}
      {authOptions.google && <>
        <p className="login-divider">{t('or', 'hoặc')}</p>
        <a className="login-option login-google welcome-rim" href="/api/auth/google" aria-disabled={submitting || undefined} onClick={event => {
          if (submitting) event.preventDefault();
        }}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.5 6.1-8.7 6.1-14.9Z" />
            <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.6l-6.6-5A12.4 12.4 0 0 1 12.5 28H5.7v5.2A20 20 0 0 0 24 44Z" />
            <path fill="#FBBC05" d="M12.5 28a12 12 0 0 1 0-8v-5.2H5.7a20 20 0 0 0 0 18.4Z" />
            <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3l5.9-5.8A20 20 0 0 0 5.7 14.8l6.8 5.2A12 12 0 0 1 24 12Z" />
          </svg>
          {t('Continue with Google', 'Tiếp tục với Google')}
        </a>
      </>}
      {emailEntered && authOptions.registration && <p className="login-switch">
        {registering ? t('Already have an account?', 'Đã có tài khoản?') : t('New to Dimension Lab?', 'Bạn mới đến Dimension Lab?')}{' '}
        <button type="button" disabled={submitting} onClick={() => {
          setRegistering(value => !value);
          setPassword(''); setConfirmation(''); setVisible(false); setFeedback(''); setRegistered(false);
        }}>{registering ? t('Sign in', 'Đăng nhập') : t('Create an account', 'Tạo tài khoản')}</button>
      </p>}
      </> : <p role="status">{t('Checking sign-in options…', 'Đang kiểm tra phương thức đăng nhập…')}</p>}
    </div>
  </main>;
}
