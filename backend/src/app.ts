import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureMiddleware } from './middleware/configure';
import { handleError } from './middleware/errors';
import { registerAuthRoutes } from './routes/auth';
import { registerHealthRoutes } from './routes/health';
import { registerDatasetRoutes } from './routes/datasets';
import { registerAnalysisRoutes } from './routes/analysis';
import { registerExperimentRoutes } from './routes/experiments';
import { registerDocsRoutes } from './routes/docs';
import { NotFoundError } from './http/errors';

export function createApp() {
  const app = express();
  configureMiddleware(app);
  registerDocsRoutes(app);
  registerAuthRoutes(app);
  registerHealthRoutes(app);
  registerDatasetRoutes(app);
  registerAnalysisRoutes(app);
  registerExperimentRoutes(app);
  app.use('/api', (_req, _res, next) => next(new NotFoundError('API endpoint')));
  if (process.env.NODE_ENV === 'production') {
    const frontendDirectory = fileURLToPath(new URL('../../dist', import.meta.url));
    app.use(express.static(frontendDirectory));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(resolve(frontendDirectory, 'index.html'), error => {
        if (error) next(error);
      });
    });
  }
  app.use(handleError);
  return app;
}
