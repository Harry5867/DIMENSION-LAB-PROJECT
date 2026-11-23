import type { RequestHandler } from 'express';

const policy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "connect-src 'self'",
].join('; ');

export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    // Swagger and offline reports contain their own scripts. Start testing the SPA policy
    // in report-only mode before enforcing it on the production frontend.
    if (req.path !== '/docs' && !req.path.startsWith('/docs/')) {
      res.setHeader('Content-Security-Policy-Report-Only', policy);
    }
    if (process.env.LAB_ENABLE_HSTS === '1') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
};
