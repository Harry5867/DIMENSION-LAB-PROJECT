import type { OpenAPIV3 } from 'openapi-types';

const successResponse = (description: string): OpenAPIV3.ResponseObject => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/SuccessEnvelope' },
    },
  },
});

const errorResponse = (description: string): OpenAPIV3.ResponseObject => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorEnvelope' },
    },
  },
});

const idParameter: OpenAPIV3.ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const authResponses: OpenAPIV3.ResponsesObject = {
  '401': errorResponse('Missing or invalid session.'),
  '403': errorResponse('The current user does not have permission.'),
};

export const openApiSpec: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'Dimension Lab API',
    version: '1.0.0',
    description: [
      'HTTP API currently used by Dimension Lab. These paths describe the existing /api endpoints;',
      'they do not include the unmerged /api/v1 or /api/v2 features from the son branch.',
      'Demo mode returns a short-lived Bearer token. Atlas mode uses the HttpOnly lab_session cookie',
      'after password or Google sign-in. Never put production credentials in this documentation.',
    ].join(' '),
  },
  tags: [
    { name: 'Auth' },
    { name: 'Health' },
    { name: 'Datasets' },
    { name: 'Analysis' },
    { name: 'Experiments' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque session token',
        description: 'Used by demo mode. Atlas mode authenticates with the lab_session cookie.',
      },
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'lab_session',
        description: 'HttpOnly session cookie set after Atlas password or Google sign-in.',
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: 'object',
        required: ['success', 'data', 'timestamp'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: { description: 'Endpoint-specific response payload.' },
          timestamp: { type: 'string', format: 'date-time' },
        },
        additionalProperties: true,
      },
      ErrorEnvelope: {
        type: 'object',
        required: ['success', 'error', 'timestamp'],
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {},
            },
          },
          message: { type: 'string', description: 'Legacy-compatible error message.' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
          role: { type: 'string', enum: ['admin', 'researcher', 'viewer'], description: 'Demo mode only.' },
          enroll: { type: 'boolean', description: 'Request email verification for first-time password sign-in in Atlas mode.' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'displayName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password', minLength: 12 },
          displayName: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
      ReductionConfig: {
        type: 'object',
        required: ['method', 'normalization', 'perplexity', 'learningRate', 'iterations', 'nNeighbors', 'minDist'],
        properties: {
          method: { type: 'string', enum: ['PCA', 't-SNE', 'UMAP'] },
          normalization: { type: 'string', enum: ['none', 'z-score', 'min-max'] },
          perplexity: { type: 'number' },
          learningRate: { type: 'number' },
          iterations: { type: 'integer' },
          nNeighbors: { type: 'integer' },
          minDist: { type: 'number' },
        },
      },
      ClusteringConfig: {
        type: 'object',
        required: ['method', 'k', 'epsilon', 'minPts'],
        properties: {
          method: { type: 'string', enum: ['None', 'K-Means', 'DBSCAN', 'GMM'] },
          k: { type: 'integer' },
          epsilon: { type: 'number' },
          minPts: { type: 'integer' },
          gmmIterations: { type: 'integer' },
          gmmTolerance: { type: 'number' },
          seed: { type: 'integer' },
        },
      },
      ComputeRequest: {
        type: 'object',
        required: ['matrix', 'groundTruth', 'reductionConfig', 'clusteringConfig'],
        properties: {
          matrix: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          groundTruth: { type: 'array', items: { nullable: true, oneOf: [
            { type: 'string' }, { type: 'number' }, { type: 'boolean' },
          ] } },
          reductionConfig: { $ref: '#/components/schemas/ReductionConfig' },
          clusteringConfig: { $ref: '#/components/schemas/ClusteringConfig' },
        },
      },
      RenameDatasetRequest: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      },
      ExperimentRequest: {
        type: 'object',
        required: ['datasetId', 'datasetName', 'reductionMethod', 'clusteringMethod', 'k', 'silhouetteScore', 'ari'],
        properties: {
          datasetId: { type: 'string' },
          datasetName: { type: 'string' },
          reductionMethod: { type: 'string' },
          clusteringMethod: { type: 'string' },
          k: { type: 'number' },
          silhouetteScore: { type: 'number', nullable: true },
          ari: { type: 'number', nullable: true },
          params: { type: 'object', additionalProperties: true },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }, { sessionCookie: [] }],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'], summary: 'Check API and storage availability', security: [],
        responses: { '200': successResponse('API and configured storage are available.'), '503': errorResponse('Storage is unavailable.') },
      },
    },
    '/api/system-health': {
      get: {
        tags: ['Health'], summary: 'Read system health details', responses: { '200': successResponse('Health details.'), ...authResponses },
      },
    },
    '/api/test-db': {
      post: {
        tags: ['Health'], summary: 'Check the database connection', description: 'Admin only.',
        responses: { '200': successResponse('Database connectivity result.'), ...authResponses },
      },
    },
    '/api/cache': {
      delete: {
        tags: ['Health'], summary: 'Clear compute cache', description: 'Admin only.',
        responses: { '200': successResponse('Cache cleared.'), ...authResponses },
      },
    },
    '/api/auth/options': {
      get: {
        tags: ['Auth'], summary: 'Read enabled sign-in options', security: [],
        responses: { '200': successResponse('Authentication configuration; no secret values are returned.') },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Sign in with email and password', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        description: 'With enroll=true in Atlas mode, a first-time password user receives an email code.',
        responses: { '200': successResponse('Signed in.'), '202': successResponse('Verification required; includes a challenge.'), '401': errorResponse('Credentials are invalid.'), '403': errorResponse('Origin is not allowed.') },
      },
    },
    '/api/auth/verify-email': {
      post: {
        tags: ['Auth'], summary: 'Complete first-time password sign-in', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['challenge', 'code'], properties: { challenge: { type: 'string' }, code: { type: 'string', pattern: '^[0-9]{6}$' } } } } } },
        responses: { '200': successResponse('Email verified and signed in.'), '401': errorResponse('Code expired or invalid.'), '429': errorResponse('Too many attempts.') },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Register a password account', security: [],
        description: 'Available only when password registration is enabled for the configured environment.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } } },
        responses: { '201': successResponse('Account registered.'), '400': errorResponse('Request is invalid.'), '403': errorResponse('Registration is disabled.') },
      },
    },
    '/api/auth/google': {
      get: {
        tags: ['Auth'], summary: 'Start Google OAuth sign-in', security: [],
        responses: { '302': { description: 'Redirects to Google. Requires valid server-side OAuth configuration.' }, '503': errorResponse('Google sign-in is not configured.') },
      },
    },
    '/api/auth/google/callback': {
      get: {
        tags: ['Auth'], summary: 'Complete Google OAuth sign-in', security: [],
        responses: { '303': { description: 'Redirects to the application after OAuth completes.' } },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'], summary: 'Read the current session', security: [],
        responses: { '200': successResponse('Authentication state and user profile, if signed in.') },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'], summary: 'Sign out and revoke the current session',
        responses: { '200': successResponse('Session revoked.') },
      },
    },
    '/api/datasets': {
      get: {
        tags: ['Datasets'], summary: 'List available datasets',
        parameters: [
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: { '200': successResponse('Dataset page; X-Next-Offset is set when more rows are available.'), ...authResponses },
      },
    },
    '/api/datasets/upload': {
      post: {
        tags: ['Datasets'], summary: 'Upload and parse a CSV dataset', description: 'Admin or researcher only; maximum file size is 5 MiB.',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: {
          type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } },
        } } } },
        responses: { '201': successResponse('Dataset created.'), '400': errorResponse('CSV is invalid.'), '413': errorResponse('CSV exceeds the file limit.'), ...authResponses },
      },
    },
    '/api/datasets/{id}': {
      parameters: [idParameter],
      get: { tags: ['Datasets'], summary: 'Read a dataset and its rows', responses: { '200': successResponse('Dataset details.'), '404': errorResponse('Dataset not found.'), ...authResponses } },
      patch: {
        tags: ['Datasets'], summary: 'Rename a dataset', description: 'Admin or researcher only; sample datasets are read-only.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RenameDatasetRequest' } } } },
        responses: { '200': successResponse('Dataset renamed.'), '400': errorResponse('Name is invalid.'), '404': errorResponse('Dataset not found.'), ...authResponses },
      },
      delete: {
        tags: ['Datasets'], summary: 'Delete a dataset', description: 'Admin only in demo mode; researcher or admin in Atlas mode.',
        responses: { '200': successResponse('Dataset deleted.'), '404': errorResponse('Dataset not found.'), ...authResponses },
      },
    },
    '/api/datasets/{id}/preview': {
      parameters: [idParameter],
      get: { tags: ['Datasets'], summary: 'Read dataset metadata and the first 20 rows', responses: { '200': successResponse('Dataset preview.'), '404': errorResponse('Dataset not found.'), ...authResponses } },
    },
    '/api/datasets/{id}/download': {
      parameters: [idParameter],
      get: {
        tags: ['Datasets'], summary: 'Download the original CSV',
        responses: {
          '200': { description: 'CSV file.', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } },
          '404': errorResponse('Dataset not found.'), ...authResponses,
        },
      },
    },
    '/api/compute': {
      post: {
        tags: ['Analysis'], summary: 'Run dimensionality reduction and clustering',
        description: 'Requires a signed-in user. A cache hit is indicated by X-Cache: HIT; a new computation returns X-Cache: MISS.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ComputeRequest' } } } },
        responses: { '200': successResponse('Analysis result.'), '400': errorResponse('Input or algorithm settings are invalid.'), ...authResponses },
      },
    },
    '/api/unsupervised': {
      post: {
        tags: ['Analysis'], summary: 'Run an unsupervised analysis task',
        description: 'Requires a signed-in user. The task payload is validated by the analysis-task schema.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        responses: { '200': successResponse('Unsupervised analysis result.'), '400': errorResponse('Task is invalid.'), ...authResponses },
      },
    },
    '/api/unsupervised/history': {
      get: { tags: ['Analysis'], summary: 'List your five most recent saved analysis runs (Atlas)', responses: { '200': successResponse('Private analysis history.'), ...authResponses } },
      post: {
        tags: ['Analysis'], summary: 'Save an analysis run to your account',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['dataset', 'createdAt', 'task', 'result'] } } } },
        responses: { '201': successResponse('Updated private history.'), '400': errorResponse('Invalid run.'), '413': errorResponse('Run exceeds 3 MiB.'), ...authResponses },
      },
    },
    '/api/experiments': {
      get: { tags: ['Experiments'], summary: 'List the current user’s saved experiments', responses: { '200': successResponse('Experiment history.'), ...authResponses } },
      post: {
        tags: ['Experiments'], summary: 'Save an experiment', description: 'Admin or researcher only.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ExperimentRequest' } } } },
        responses: { '201': successResponse('Experiment saved.'), '400': errorResponse('Experiment is invalid.'), ...authResponses },
      },
    },
  },
};
