import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { atlasMode } from '../database/atlas';
import { googleSessionUser, protectCookieWrite } from '../auth/googleAuth';
import { authenticate, AuthenticatedRequest, requireAuth } from '../auth/auth';
import type { Express } from 'express';

export function configureMiddleware(app: Express) {
  // 1. High-Performance Middlewares: Gzip Compression & Security CORS
  app.use(compression({
    threshold: 1024, // Only compress responses > 1KB
    level: 6,
  }));
  app.use(cors({
    origin: [/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/, ...(process.env.LAB_ALLOWED_ORIGIN ? [process.env.LAB_ALLOWED_ORIGIN] : [])],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));
  app.use('/api', (req: AuthenticatedRequest, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && ['/health', '/auth/options', '/auth/google', '/auth/google/callback'].includes(req.path)) return next();
    if (req.method === 'POST' && req.path === '/auth/login') return next();
    const authorize = () => {
      if (req.method === 'GET' && req.path === '/auth/me') return next();
      requireAuth(req, res, next);
    };
    if (!atlasMode) return authenticate(req, res, error => error ? next(error) : authorize());
    void Promise.resolve().then(async () => {
      protectCookieWrite(req);
      req.user = await googleSessionUser(req) ?? undefined;
      if (req.method === 'POST' && req.path === '/auth/logout') return next();
      authorize();
    }).catch(next);
  });
  app.use('/api/auth/login', express.json({ limit: '2kb' }));
  app.use(express.json({ limit: '32mb' }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path !== '/api/health') {
        console.log(`📡 [HTTP] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });
}
