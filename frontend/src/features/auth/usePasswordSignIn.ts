import { useEffect, useRef, useState } from 'react';
import type { AuthOptions } from '@dimension-lab/contracts';
import { validDemoCredentials } from '@dimension-lab/contracts/demo';
import { ApiError, isServiceUnavailable, NetworkError } from '../../shared/api/network';
import { useWelcomeLanguage } from '../../shared/providers/WelcomeLanguage';
import { signIn } from './authApi';

export function usePasswordSignIn(options: AuthOptions | null, onSignIn: (token?: string | null) => void) {
  const { t } = useWelcomeLanguage();
  const [challenge, setChallenge] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);
  useEffect(() => () => currentRequest.current?.abort(), []);

  async function submit(email: string, password: string, code: string, onChallenge: () => void) {
    if (currentRequest.current) return;
    const atlas = options?.mode === 'atlas';
    const request = new AbortController();
    currentRequest.current = request;
    setSubmitting(true);
    setError(false);
    setFeedback('');
    try {
      const result = await signIn(challenge ? { challenge, code } : { email, password, ...(atlas && { enroll: true }) },
        atlas, request.signal);
      if (request.signal.aborted) return;
      if (result.kind === 'challenge') {
        onChallenge();
        setChallenge(result.challenge);
      } else if (result.kind === 'demo') onSignIn(result.token);
      else onSignIn();
    } catch (error) {
      if (request.signal.aborted) return;
      const status = error instanceof ApiError ? error.status : undefined;
      if (!atlas && isServiceUnavailable(error)) {
        if (validDemoCredentials(email, password)) onSignIn(null);
        else setError(true);
      } else if (!atlas && status === 401) setError(true);
      else if (status === 401 && challenge) setFeedback(t('Invalid or expired code. Try again, or restart sign-in for a new code.', 'Mã sai hoặc đã hết hạn. Hãy thử lại hoặc đăng nhập lại để nhận mã mới.'));
      else if (status === 503) setFeedback(t('Sign-in is temporarily unavailable. Try again later.', 'Tạm thời chưa thể đăng nhập. Hãy thử lại sau.'));
      else if (status === 401) setFeedback(options?.google
        ? t('Email or password is incorrect. If you joined with Google, choose Continue with Google on the email screen.', 'Email hoặc mật khẩu chưa đúng. Nếu bạn đã dùng Google, hãy chọn Tiếp tục với Google.')
        : t('Email or password is incorrect.', 'Email hoặc mật khẩu chưa đúng.'));
      else if (status === 409) setFeedback(t('Restart sign-in with your existing account.', 'Hãy đăng nhập lại bằng tài khoản hiện có.'));
      else if (status === 403 && error instanceof ApiError) setFeedback(t(error.message, 'Tài khoản hoặc yêu cầu này chưa được phép truy cập.'));
      else if (status === 429) setFeedback(t('Too many attempts. Try again in a minute.', 'Bạn đã thử quá nhiều lần. Hãy thử lại sau một phút.'));
      else if (status === 400) setFeedback(t('Check the information you entered.', 'Hãy kiểm tra lại thông tin đã nhập.'));
      else if (error instanceof NetworkError) setFeedback(t('Could not reach the server. Try again.', 'Không thể kết nối máy chủ. Hãy thử lại.'));
      else setFeedback(t('The request could not be completed. Try again.', 'Không thể hoàn tất yêu cầu. Hãy thử lại.'));
    } finally {
      currentRequest.current = null;
      if (!request.signal.aborted) setSubmitting(false);
    }
  }
  return { challenge, feedback, error, submitting, submit, setFeedback, setError, cancel: () => currentRequest.current?.abort() };
}
