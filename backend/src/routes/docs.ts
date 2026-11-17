import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from '../docs/openapi';
import type { Express } from 'express';

export function registerDocsRoutes(app: Express) {
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Dimension Lab API',
    swaggerOptions: {
      filter: true,
      persistAuthorization: false,
    },
  }));
}
