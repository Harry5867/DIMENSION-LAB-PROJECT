import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import type { AuthOptions } from '@dimension-lab/contracts';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@dimension-lab/contracts/demo';
import { useWelcomeLanguage } from '../../../shared/providers/WelcomeLanguage';
import { usePasswordSignIn } from '../usePasswordSignIn';
import { TeamLogo } from '../../../shared/ui/TeamLogo';
import { LoginBackdrop } from './LoginBackdrop';
import './login.css';

export function LoginPanel({ onClose, onSignIn, authOptions, googleError }: { onClose: () => void; onSignIn: (token?: string | null) => void; authOptions: AuthOptions | null; googleError: boolean }) {
  const { t } = useWelcomeLanguage();
  const heading = useRef<HTMLHeadingElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const [emailEntered, setEmailEntered] = useState(false);
  const [invalidEmail, setInvalidEmail] = useState(false);
  const [code, setCode] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const { challenge, feedback, error, submitting, submit, setFeedback, setError, cancel } =
    usePasswordSignIn(authOptions, onSignIn);
  useEffect(() => {
    const target = challenge ? codeInput.current : emailEntered ? passwordInput.current : emailInput.current;
    target?.focus({ preventScroll: true });
  }, [challenge, emailEntered, authOptions]);
  const close = () => { cancel(); onClose(); };
  const signIn = () => submit(email, password, code, () => {
    setPassword(''); setVisible(false); setCode('');
  });
  return <main className="login-page" aria-labelledby="login-title" onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) close();
  }}>
    <LoginBackdrop />
    <button className="login-back control-glass" type="button" aria-label="Back to welcome" onClick={close}>
      <ArrowLeft size={20} strokeWidth={1.7} aria-hidden="true" />
    </button>
    <div className="login-content">
      <header className="login-heading">
        <h1 id="login-title" ref={heading} tabIndex={-1}>{!emailEntered ? t('Log in or sign up', 'Đăng nhập hoặc đăng ký') : challenge ? t('Verify email', 'Xác minh email') : t('Sign in', 'Đăng nhập')}</h1>
        <TeamLogo label="Dimension Lab" />
      </header>
      {emailEntered ? <p className="login-identity">{email}</p> : <p className="login-subtitle">{t('Explore your data and discover the patterns within.', 'Khám phá dữ liệu và tìm ra những quy luật bên trong.')}</p>}
      {authOptions ? <>
      {googleError && !emailEntered && <p role="alert" className="login-error">{t('Google sign-in could not be completed. Please try again.', 'Không thể hoàn tất đăng nhập Google. Hãy thử lại.')}</p>}
      {challenge && <p role="status">{t('Enter the six-digit code sent to your email.', 'Nhập mã sáu chữ số đã gửi đến email của bạn.')}</p>}
      <form onSubmit={event => { event.preventDefault(); if (emailEntered) void signIn(); else { setEmail(email.trim()); setEmailEntered(true); } }}>
        {!emailEntered && <div className="login-field login-email-field">
        <label htmlFor="login-email">{t('Email address', 'Địa chỉ email')}</label>
        <input ref={emailInput} id="login-email" type="email" pattern="[^@\s]+@[^@\s]+\.[^@\s]+" aria-invalid={invalidEmail} aria-describedby={invalidEmail ? "email-format-error" : undefined}
          onInvalid={event => { event.preventDefault(); setInvalidEmail(true); event.currentTarget.focus(); }} autoComplete="username" maxLength={254} value={email} required onChange={event => { setEmail(event.target.value); setInvalidEmail(false); }} />
        </div>}
        {invalidEmail && !emailEntered && <p id="email-format-error" role="alert" className="login-error">{t('Enter a valid email address and try again.', 'Hãy nhập lại địa chỉ email hợp lệ.')}</p>}
        {emailEntered && !challenge && <div className="login-field">
          <label htmlFor="login-password">{t('Password', 'Mật khẩu')}</label>
          <div className="login-password">
            <input ref={passwordInput} id="login-password" type={visible ? 'text' : 'password'} autoComplete="current-password"
              placeholder={t('Enter your password', 'Nhập mật khẩu của bạn')} minLength={authOptions.mode === 'atlas' ? 12 : undefined}
              required value={password} onChange={event => { setPassword(event.target.value); setError(false); setFeedback(''); }}
              aria-invalid={error} aria-describedby={error ? 'login-error' : undefined} />
            <button className="login-visibility-toggle" type="button" aria-controls="login-password"
              aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(value => !value)}>
              {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>}
        {challenge && <div className="login-field">
          <label htmlFor="email-code">{t('Verification code', 'Mã xác minh')}</label>
          <input ref={codeInput} id="email-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => { setCode(event.target.value); setFeedback(''); }} />
        </div>}
        {feedback && <p role="alert" className="login-error">{feedback}</p>}
        {error && <p role="alert" id="login-error" className="login-error">{t('Email or password is incorrect. Use your demo credentials.', 'Email hoặc mật khẩu chưa đúng. Hãy dùng thông tin tài khoản mẫu.')}</p>}
        <button className={emailEntered ? 'login-submit' : 'login-submit liquid-glass'} type="submit" disabled={submitting}>{submitting ? t('Please wait…', 'Vui lòng đợi…') : challenge ? t('Verify email', 'Xác minh email') : !emailEntered || authOptions.mode === 'atlas' ? t('Continue', 'Tiếp tục') : t('Sign in', 'Đăng nhập')}</button>
      </form>
      {!emailEntered && authOptions.mode === 'demo' && <div className="login-demo">
        <button type="button" className="login-option" disabled={submitting} onClick={() => { setEmailEntered(true); setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); setError(false); }}><span>{t('Use demo account', 'Dùng tài khoản mẫu')}</span></button>
      </div>}
      {!emailEntered && authOptions.google && <>
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
      </> : <p role="status">{t('Checking sign-in options…', 'Đang kiểm tra phương thức đăng nhập…')}</p>}
    </div>
  </main>;
}
