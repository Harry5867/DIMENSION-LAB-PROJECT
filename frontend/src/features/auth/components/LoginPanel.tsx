import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import type { AuthOptions } from '@dimension-lab/contracts';
import { DEMO_EMAIL, DEMO_PASSWORD, validDemoCredentials } from '@dimension-lab/contracts/demo';
import { useWelcomeLanguage } from '../../../shared/providers/WelcomeLanguage';
import { fetchWithTimeout } from '../../../shared/api/network';
import { useDialogFocus } from '../../../shared/hooks/useDialogFocus';
import { LabMark } from '../../../shared/ui/LabMark';

export function LoginPanel({ onClose, onSignIn, authOptions, googleError }: { onClose: () => void; onSignIn: (token?: string | null) => void; authOptions: AuthOptions | null; googleError: boolean }) {
  const { t } = useWelcomeLanguage();
  const [closing, setClosing] = useState(false);
  const close = () => { loginRequest.current?.abort(); setClosing(true); };
  const dialog = useDialogFocus(true, close, '#login-email');
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
  async function signIn() {
    if (closing || loginRequest.current) return;
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
          const result = await response.json();
          if (request.signal.aborted) return;
          if (registering && result.data?.registered === true) {
            setRegistering(false);
            setRegistered(true);
            setPassword('');
            setConfirmation('');
            setVisible(false);
            return;
          }
          if (!registering && result.data?.authenticated === true) {
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
      <h2 id="login-title" className="login-step login-step--title">{registering ? t('Create account', 'Tạo tài khoản') : t('Sign in', 'Đăng nhập')}</h2>
      {authOptions ? <>
      {googleError && !registering && <p role="alert" className="login-error">{t('Google sign-in could not be completed. Please try again.', 'Không thể hoàn tất đăng nhập Google. Hãy thử lại.')}</p>}
      {registered && <p role="status">{t('Account created. Sign in with your password.', 'Đã tạo tài khoản. Hãy nhập mật khẩu để đăng nhập.')}</p>}
      <form onSubmit={event => { event.preventDefault(); void signIn(); }}>
        {registering && <div className="login-field">
          <label htmlFor="login-name">{t('Display name', 'Tên hiển thị')}</label>
          <input id="login-name" autoComplete="name" maxLength={80} required value={displayName} onChange={event => setDisplayName(event.target.value)} />
        </div>}
        <div className="login-field login-step login-step--email">
        <label htmlFor="login-email">{t('Email address', 'Địa chỉ email')}</label>
        <input id="login-email" type="email" autoComplete="username" placeholder="you@example.com" maxLength={254} value={email} required onChange={event => { setEmail(event.target.value); setError(false); }} aria-invalid={error} aria-describedby={error ? 'login-error' : undefined} />
        </div>
        <div className="login-field login-step login-step--password">
        <label htmlFor="login-password">{t('Password', 'Mật khẩu')}</label>
        <div className="login-password"><input id="login-password" type={visible ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} placeholder={registering ? t('At least 12 characters', 'Tối thiểu 12 ký tự') : t('Enter your password', 'Nhập mật khẩu của bạn')} required value={password} onChange={event => { setPassword(event.target.value); setError(false); }} aria-invalid={error} aria-describedby={error ? 'login-error' : undefined} /><button className="login-visibility-toggle" type="button" aria-controls="login-password" aria-label={visible ? t('Hide password', 'Ẩn mật khẩu') : t('Show password', 'Hiện mật khẩu')} onClick={() => setVisible(value => !value)}>{visible ? t('HIDE', 'ẨN') : t('SHOW', 'HIỆN')}</button></div>
        </div>
        {registering && <div className="login-field">
          <label htmlFor="login-confirmation">{t('Confirm password', 'Xác nhận mật khẩu')}</label>
          <input id="login-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        </div>}
        {feedback && <p role="alert" className="login-error">{feedback}</p>}
        {error && <p role="alert" id="login-error" className="login-error">{t('Email or password is incorrect. Use the demo account below.', 'Email hoặc mật khẩu chưa đúng. Hãy dùng tài khoản mẫu bên dưới.')}</p>}
        <button className="welcome-primary login-submit login-step login-step--submit" type="submit" disabled={closing || submitting}><span>{submitting ? t('Please wait…', 'Vui lòng đợi…') : registering ? t('Create account', 'Tạo tài khoản') : t('Sign in', 'Đăng nhập')}</span><ArrowUpRight size={18} aria-hidden="true" /></button>
      </form>
      {authOptions.mode === 'demo' && <div className="login-demo">
        <button type="button" className="lab-action login-demo-action login-step login-step--demo" onClick={() => { setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); setError(false); }}><span>{t('Use demo account', 'Dùng tài khoản mẫu')}</span><ArrowUpRight size={14} aria-hidden="true" /></button>
      </div>}
      {authOptions.registration && <div className="login-demo">
        <button className="lab-action login-demo-action" type="button" disabled={closing || submitting} onClick={() => {
          setRegistering(value => !value);
          setPassword('');
          setConfirmation('');
          setVisible(false);
          setFeedback('');
          setRegistered(false);
        }}>{registering ? t('Back to sign in', 'Quay lại đăng nhập') : t('Create account', 'Tạo tài khoản')}</button>
      </div>}
      {authOptions.google && !registering && <a className="lab-action login-google" href="/api/auth/google">{t('Sign in with Google', 'Đăng nhập với Google')}</a>}
      </> : <p role="status">{t('Checking sign-in options…', 'Đang kiểm tra phương thức đăng nhập…')}</p>}
    </div>
  </div>;
}
