import { atlasMode } from '../database/atlas';
import { beginGoogleSignIn, finishGoogleSignIn, googleEnabled, issueAtlasSession, protectCookieWrite, revokeAtlasSession } from '../auth/googleAuth';
import { finishEnrollment, passwordRegistrationEnabled, registerPasswordUser } from '../auth/passwordAuth';
import { DEMO_EMAIL } from '@dimension-lab/contracts/demo';
import { sendSuccess } from '../http/response';
import { AuthenticatedRequest, revokeSession } from '../auth/auth';
import { signInWithPassword } from '../services/auth';
import type { Express } from 'express';

export function registerAuthRoutes(app: Express) {
  app.post('/api/auth/verify-email', async (req, res, next) => {
    try {
      protectCookieWrite(req);
      const user = await finishEnrollment(req.body, req.ip);
      await issueAtlasSession(req, res, user, user.linkedGoogle ? undefined : 'password');
      sendSuccess(res, { authenticated: true });
    } catch (error) { next(error); }
  });
  app.post('/api/auth/register', async (req, res, next) => {
    try {
      protectCookieWrite(req);
      await registerPasswordUser(req.body, req.ip);
      sendSuccess(res, { registered: true }, 201);
    } catch (error) { next(error); }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      if (atlasMode) protectCookieWrite(req);
      const result = await signInWithPassword(req.body, req.ip);
      if (result.kind === 'challenge') return sendSuccess(res, { verificationRequired: true, challenge: result.challenge }, 202);
      if (result.kind === 'atlas') {
        const { user } = result;
        await issueAtlasSession(req, res, user, user.linkedGoogle ? undefined : 'password');
        return sendSuccess(res, { authenticated: true });
      }
      const { token, user } = result;
      sendSuccess(res, { token, user, message: 'Signed in as ' + user.name + ' (' + user.role + ').' });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/options', (_req, res) => sendSuccess(res, {
    mode: atlasMode ? 'atlas' : 'demo', google: googleEnabled(), registration: passwordRegistrationEnabled(),
  }));
  app.get('/api/auth/google', (req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    void beginGoogleSignIn(req, res).catch(next);
  });
  app.get('/api/auth/google/callback', (req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    void finishGoogleSignIn(req, res).catch(next);
  });

  // Lấy thông tin phiên đăng nhập hiện tại
  app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, {
      authenticated: Boolean(req.user),
      user: req.user || null,
      ...(req.user && { email: atlasMode ? req.user.username : process.env.LAB_AUTH_EMAIL || DEMO_EMAIL }),
    });
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      if (atlasMode) await revokeAtlasSession(req, res);
      else revokeSession(req);
      sendSuccess(res, { authenticated: false });
    } catch (error) { next(error); }
  });

}
