import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { atlasMode } from '../database/atlas';
import { atlasSessionUser, protectCookieWrite } from '../auth/googleAuth';
import { authenticate, AuthenticatedRequest, requireAuth } from '../auth/auth';
import type { Express } from 'express';
import { trackApiRequest } from './requestContext';
import { securityHeaders } from './securityHeaders';
import { installWorkloadLimits } from './workloadLimits';

export function configureMiddleware(app: Express) {
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use('/api', trackApiRequest);
  app.use(compression({
    threshold: 1024, // Only compress responses > 1KB
    level: 6,
  }));
  app.use(cors({
    origin: [
      ...(process.env.NODE_ENV !== 'production' ? [/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/] : []),
      ...(process.env.LAB_ALLOWED_ORIGIN ? [process.env.LAB_ALLOWED_ORIGIN] : []),
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Request-Id', 'X-Next-Offset', 'X-Cache', 'Retry-After'],
  }));
  app.use('/api', (req: AuthenticatedRequest, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && ['/health', '/auth/options', '/auth/google', '/auth/google/callback'].includes(req.path)) return next();
    if (req.method === 'POST' && ['/auth/login', '/auth/register', '/auth/verify-email'].includes(req.path)) return next();
    const authorize = () => {
      if (req.method === 'GET' && req.path === '/auth/me') return next();
      requireAuth(req, res, next);
    };
    if (!atlasMode) return authenticate(req, res, error => error ? next(error) : authorize());
    void Promise.resolve().then(async () => {
      protectCookieWrite(req);
      const user = await atlasSessionUser(req);
      if (user) req.user = user;
      else delete req.user;
      if (req.method === 'POST' && req.path === '/auth/logout') return next();
      authorize();
    }).catch(next);
  });
  installWorkloadLimits(app);
  app.post(['/api/auth/login', '/api/auth/register', '/api/auth/verify-email'], express.json({ limit: '8kb' }));
  const json = express.json({ limit: '32mb' });
  app.post(['/api/experiments', '/api/unsupervised/history'], json);
  app.patch('/api/datasets/:id', json);
}
