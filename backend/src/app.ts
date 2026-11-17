import express from 'express';
import { configureMiddleware } from './middleware/configure';
import { handleError } from './middleware/errors';
import { registerAuthRoutes } from './routes/auth';
import { registerHealthRoutes } from './routes/health';
import { registerDatasetRoutes } from './routes/datasets';
import { registerAnalysisRoutes } from './routes/analysis';
import { registerExperimentRoutes } from './routes/experiments';
import { registerDocsRoutes } from './routes/docs';
import { registerV1Routes, registerV2Routes } from './routes/v1';
import './services/apiJobHandlers';

export function createApp() {
  const app = express();
  configureMiddleware(app);
  registerDocsRoutes(app);
  registerAuthRoutes(app);
  registerHealthRoutes(app);
  registerDatasetRoutes(app);
  registerAnalysisRoutes(app);
  registerExperimentRoutes(app);
  registerAuthRoutes(app, '/api/v1');
  registerHealthRoutes(app, '/api/v1');
  registerDatasetRoutes(app, '/api/v1');
  registerAnalysisRoutes(app, '/api/v1');
  registerExperimentRoutes(app, '/api/v1');
  registerV1Routes(app);
  registerAuthRoutes(app, '/api/v2');
  registerHealthRoutes(app, '/api/v2');
  registerDatasetRoutes(app, '/api/v2');
  registerAnalysisRoutes(app, '/api/v2');
  registerExperimentRoutes(app, '/api/v2');
  registerV2Routes(app);
  app.use(handleError);
  return app;
}
