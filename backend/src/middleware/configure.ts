import express, { type Express } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { atlasMode } from '../database/atlas';
import { atlasSessionUser, protectCookieWrite } from '../auth/googleAuth';
import { authenticate, AuthenticatedRequest, requireAuth } from '../auth/auth';
import { randomUUID } from 'node:crypto';
import { recordHttpRequest } from '../observability/metrics';
import { sendError } from '../http/response';

function createRateLimit(limit: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 429, 'RATE_LIMITED', 'Too many requests. Try again later.'),
  });
}

const computeRateLimit = createRateLimit(30, 60_000);

export function configureMiddleware(app: Express) {
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: false,
  }));
  app.use((req, res, next) => {
    const suppliedId = req.get('X-Request-ID');
    const requestId = suppliedId && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      recordHttpRequest(req.method, route, res.statusCode, duration);
      console.log(JSON.stringify({
        event: 'http_request_completed',
        requestId,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: duration,
      }));
    });
    next();
  });

  app.use(compression({
    threshold: 1024, // Only compress responses > 1KB
    level: 6,
  }));
  app.use(cors({
    origin: [/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/, ...(process.env.LAB_ALLOWED_ORIGIN ? [process.env.LAB_ALLOWED_ORIGIN] : [])],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID', 'Idempotency-Key'],
  }));
  app.use('/api', createRateLimit(300, 60_000));
  app.use(['/api/auth/login', '/api/auth/register', '/api/v1/auth/login', '/api/v1/auth/register',
    '/api/v2/auth/login', '/api/v2/auth/register'], createRateLimit(20, 15 * 60_000));
  app.use(['/api/v1/analyses', '/api/v2/analyses', '/api/v1/preprocessing-runs', '/api/v2/preprocessing-runs',
    '/api/v1/datasets', '/api/v2/datasets'], (req, _res, next) => {
    if (req.method !== 'POST') return next();
    return computeRateLimit(req, _res, next);
  });
  app.use('/api', (req: AuthenticatedRequest, res, next) => {
    const apiPath = req.path.replace(/^\/v[12](?=\/|$)/, '') || '/';
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && ['/health', '/auth/options', '/auth/google', '/auth/google/callback'].includes(apiPath)) return next();
    if (req.method === 'POST' && ['/auth/login', '/auth/register'].includes(apiPath)) return next();
    const authorize = () => {
      if (req.method === 'GET' && apiPath === '/auth/me') return next();
      requireAuth(req, res, next);
    };
    if (!atlasMode) return authenticate(req, res, error => error ? next(error) : authorize());
    void Promise.resolve().then(async () => {
      protectCookieWrite(req);
      req.user = await atlasSessionUser(req) ?? undefined;
      if (req.method === 'POST' && apiPath === '/auth/logout') return next();
      authorize();
    }).catch(next);
  });
  app.use(['/api/auth/login', '/api/auth/register', '/api/v1/auth/login', '/api/v1/auth/register',
    '/api/v2/auth/login', '/api/v2/auth/register'], express.json({ limit: '8kb' }));
  app.use(express.json({ limit: '1mb' }));
}
