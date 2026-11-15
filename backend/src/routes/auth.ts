import { isRecord } from '../http/validation';
import { atlasMode } from '../database/atlas';
import { beginGoogleSignIn, finishGoogleSignIn, googleEnabled, issueAtlasSession, protectCookieWrite, revokeAtlasSession } from '../auth/googleAuth';
import { passwordRegistrationEnabled, registerPasswordUser, verifyPasswordUser } from '../auth/passwordAuth';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@dimension-lab/contracts/demo';
import { sendSuccess } from '../http/response';
import { BadRequestError, UnauthorizedError } from '../http/errors';
import { AuthenticatedRequest, issueSession, revokeSession } from '../auth/auth';
import type { Express } from 'express';

export function registerAuthRoutes(app: Express) {
  app.post('/api/auth/register', async (req, res, next) => {
    try {
      protectCookieWrite(req);
      await registerPasswordUser(req);
      sendSuccess(res, { registered: true }, 201);
    } catch (error) { next(error); }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      if (atlasMode) {
        protectCookieWrite(req);
        const user = await verifyPasswordUser(req);
        await issueAtlasSession(req, res, user, 'password');
        return sendSuccess(res, { authenticated: true });
      }
      const { email, password, role = 'admin' } = isRecord(req.body) ? req.body : {};
      const expectedEmail = process.env.LAB_AUTH_EMAIL || DEMO_EMAIL;
      const expectedPassword = process.env.LAB_AUTH_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : DEMO_PASSWORD);
      if (!expectedPassword || typeof email !== 'string' || email.trim().toLowerCase() !== expectedEmail.toLowerCase()
        || password !== expectedPassword) {
        throw new UnauthorizedError('Invalid email or password.');
      }
      if (role !== 'admin' && role !== 'researcher' && role !== 'viewer') {
        throw new BadRequestError('Unknown workspace role.');
      }

      const { token, user } = issueSession(role);
      res.setHeader('Cache-Control', 'no-store');
      sendSuccess(res, {
        token,
        user,
        message: `Signed in as ${user.name} (${user.role}).`,
      });
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
    });
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      if (atlasMode) await revokeAtlasSession(req, res);
      else revokeSession(req);
      sendSuccess(res, { authenticated: false });
    } catch (error) { next(error); }
  });

  // -------------------------------------------------------------
  // CORE BUSINESS & SCIENTIFIC DATA ENDPOINTS
  // -------------------------------------------------------------

  // 3. Health check & DB status
}
