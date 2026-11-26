import { useEffect, useState } from 'react';
import type { AuthOptions } from '@dimension-lab/contracts';
import { clearDemoSession, getAccessToken, hasDemoSession } from '../../shared/api/demoSession';
import { getAuthOptions, getSession } from './authApi';

export function useAuthSession() {
  const [signedIn, setSignedIn] = useState(false);
  const [authOptions, setAuthOptions] = useState<AuthOptions | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      const options = await getAuthOptions(signal);
      if (signal.aborted) return;
      if (options.mode === 'atlas') {
        clearDemoSession();
        setSignedIn(false);
      }
      setAuthOptions(options);
      if (options.mode === 'demo' && !getAccessToken()) {
        setSignedIn(hasDemoSession());
        return;
      }
      const session = await getSession(signal).catch(() => undefined);
      if (!signal.aborted && session) setSignedIn(session.authenticated);
    })().catch(() => {
      if (!signal.aborted) {
        setAuthOptions(options => options ?? { mode: 'demo', google: false, registration: false });
        setSignedIn(hasDemoSession());
      }
    }).finally(() => {
      if (!signal.aborted) setSessionChecked(true);
    });
    return () => controller.abort();
  }, []);

  return { signedIn, setSignedIn, authOptions, sessionChecked };
}
