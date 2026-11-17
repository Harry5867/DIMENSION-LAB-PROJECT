import express from 'express';
import { configureMiddleware } from './middleware/configure';
import { handleError } from './middleware/errors';
import { registerAuthRoutes } from './routes/auth';
import { registerHealthRoutes } from './routes/health';
import { registerDatasetRoutes } from './routes/datasets';
import { registerAnalysisRoutes } from './routes/analysis';
import { registerExperimentRoutes } from './routes/experiments';

export function createApp() {
  const app = express();
  configureMiddleware(app);
  registerAuthRoutes(app);
  registerHealthRoutes(app);
  registerDatasetRoutes(app);
  registerAnalysisRoutes(app);
  registerExperimentRoutes(app);
  app.use(handleError);
  return app;
}
