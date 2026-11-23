import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';
import { isRecord } from '../http/validation';

export const trackApiRequest: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const started = performance.now();
  res.setHeader('X-Request-Id', requestId);

  res.once('close', () => {
    const status = res.writableFinished ? res.statusCode : null;
    // Use the route template so paths, query strings and credentials never enter logs.
    const match: unknown = req.route;
    const path = isRecord(match) ? match.path : undefined;
    const current = req.path.toLowerCase().replace(/\/$/, '');
    const route = typeof path === 'string' ? path : Array.isArray(path) && path.includes(current) ? current : undefined;
    if (route === '/api/health' && status === 200) return;
    console.log(JSON.stringify({
      event: 'api.request', requestId, method: req.method, route, status,
      durationMs: Math.round(performance.now() - started),
    }));
  });
  next();
};
