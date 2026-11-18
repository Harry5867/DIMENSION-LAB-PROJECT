const successResponse = {
  description: 'Successful response.',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiSuccess' },
    },
  },
};

const errorResponse = {
  description: 'Error response.',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiError' },
    },
  },
};

const jsonRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/JsonObject' },
    },
  },
};

const uploadRequestBody = {
  required: true,
  description: 'One UTF-8 encoded CSV file, up to 5 MiB.',
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        required: ['file'],
        properties: { file: { type: 'string', format: 'binary' } },
      },
    },
  },
};

function endpoint(
  tag: string,
  summary: string,
  description: string,
  options: {
    public?: boolean;
    body?: typeof jsonRequestBody | typeof uploadRequestBody;
    successStatus?: 200 | 201 | 202;
    idempotencyKey?: boolean;
  } = {},
) {
  return {
    tags: [tag],
    summary,
    description,
    ...(options.public ? { security: [] } : {}),
    ...(options.body ? { requestBody: options.body } : {}),
    ...(options.idempotencyKey ? { parameters: [{
      name: 'Idempotency-Key',
      in: 'header',
      required: false,
      description: 'Optional safe key (1-128 characters). Repeating the same key and payload returns the original job for seven days.',
      schema: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$', minLength: 1, maxLength: 128 },
    }] } : {}),
    responses: {
      [options.successStatus ?? 200]: successResponse,
      '400': errorResponse,
      '401': errorResponse,
      '403': errorResponse,
      '404': errorResponse,
      '409': errorResponse,
      '413': errorResponse,
      '429': errorResponse,
      '503': errorResponse,
      '500': errorResponse,
      '501': errorResponse,
    },
  };
}

const compatibility = 'Compatibility aliases — /api';
const v1 = 'API v1 — canonical';

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Dimension Lab API',
    version: '1.1.0',
    description: [
      '`/api/v1` and `/api/v2` are versioned APIs. `/api/v2` adds point-level diagnostics, manual point exclusions, advanced quality evaluation, and bounded parameter optimization. Existing `/api` endpoints remain supported as compatibility aliases.',
      'Long-running quality checks, preprocessing, analyses, optimization, and reports return HTTP 202 and a job ID. Poll `/api/v1/jobs/{id}` for status and results. An optional `Idempotency-Key` makes job creation safe to retry for seven days.',
      'In Atlas mode, jobs are durable MongoDB queue records claimed atomically by API or standalone worker instances. Delivery is at least once: jobs use 15-minute renewable leases, up to three attempts with bounded exponential backoff, dead-letter status after exhaustion, and seven-day terminal retention. Preprocessing records its job ID on the derived immutable dataset version to avoid duplicate writes on retry. Demo mode remains process-local.',
      'CSV business rules reject malformed numeric feature values, inconsistent dataset metadata, and invalid analysis settings. Missing values, duplicates, constant features, and outliers are reviewable findings; quality responses include suggested thresholds and a rationale without automatically changing the data.',
      'Use `/livez` for process liveness, `/readyz` for dependency readiness, and admin-authenticated `/api/metrics` for Prometheus-format request, job-state, and process metrics. Send `X-Request-ID` for correlation.',
    ].join('\n\n'),
  },
  servers: [{ url: '/', description: 'This backend server' }],
  tags: [
    { name: 'Operations', description: 'Readiness, liveness and protected Prometheus metrics.' },
    { name: v1, description: 'Canonical versioned routes. Requires an authenticated session except public auth and health endpoints.' },
    { name: compatibility, description: 'Supported legacy aliases for existing clients.' },
  ],
  paths: {
    '/openapi.json': {
      get: endpoint('Operations', 'OpenAPI document', 'Return the OpenAPI 3.0 description for every registered API route.', { public: true }),
    },
    '/livez': {
      get: endpoint('Operations', 'Liveness probe', 'Confirms the Node process is running; does not check dependencies.', { public: true }),
    },
    '/readyz': {
      get: endpoint('Operations', 'Readiness probe', 'Returns 503 when a required Atlas dependency is unavailable.', { public: true }),
    },
    '/api/metrics': {
      get: endpoint('Operations', 'Prometheus metrics', 'Admin-authenticated request, job-state, and process metrics. Protect scrape access at the network edge.'),
    },
    '/api/health': {
      get: endpoint(compatibility, 'Health check', 'Compatibility alias. Check backend and storage readiness.', { public: true }),
    },
    '/api/system-health': {
      get: endpoint(compatibility, 'System health', 'Compatibility alias. Read process and database metrics.'),
    },
    '/api/test-db': {
      post: endpoint(compatibility, 'Test database', 'Compatibility alias. Admin-only database connectivity check.'),
    },
    '/api/cache': {
      delete: endpoint(compatibility, 'Clear compute cache', 'Compatibility alias. Admin-only cache invalidation.'),
    },
    '/api/auth/options': {
      get: endpoint(compatibility, 'Authentication options', 'Compatibility alias. Read enabled authentication providers.', { public: true }),
    },
    '/api/auth/register': {
      post: endpoint(compatibility, 'Register', 'Compatibility alias. Register a password user when registration is enabled.', { public: true, body: jsonRequestBody }),
    },
    '/api/auth/login': {
      post: endpoint(compatibility, 'Login', 'Compatibility alias. Authenticate with email and password.', { public: true, body: jsonRequestBody }),
    },
    '/api/auth/me': {
      get: endpoint(compatibility, 'Current user', 'Compatibility alias. Read the active session and user profile.', { public: true }),
    },
    '/api/auth/logout': {
      post: endpoint(compatibility, 'Logout', 'Compatibility alias. Revoke the current session.'),
    },
    '/api/auth/google': {
      get: endpoint(compatibility, 'Start Google sign-in', 'Compatibility alias. Redirect to Google when OAuth is configured.', { public: true }),
    },
    '/api/auth/google/callback': {
      get: endpoint(compatibility, 'Google sign-in callback', 'Compatibility alias. Complete the Google OAuth flow.', { public: true }),
    },
    '/api/datasets': {
      get: endpoint(compatibility, 'List datasets', 'Compatibility alias. List accessible datasets; supports offset and limit query parameters.'),
    },
    '/api/datasets/upload': {
      post: endpoint(compatibility, 'Upload dataset', 'Compatibility alias. Upload and parse a CSV file. Requires admin or researcher role.', { body: uploadRequestBody, successStatus: 201 }),
    },
    '/api/datasets/{id}': {
      get: endpoint(compatibility, 'Get dataset', 'Compatibility alias. Read a dataset and its rows.'),
      patch: endpoint(compatibility, 'Rename dataset', 'Compatibility alias. Rename a dataset. Requires admin or researcher role.', { body: jsonRequestBody }),
      delete: endpoint(compatibility, 'Delete dataset', 'Compatibility alias. Delete a dataset; requires an authorized role.'),
    },
    '/api/datasets/{id}/preview': {
      get: endpoint(compatibility, 'Preview dataset', 'Compatibility alias. Read dataset metadata and a sample of rows.'),
    },
    '/api/datasets/{id}/download': {
      get: endpoint(compatibility, 'Download dataset', 'Compatibility alias. Download the source CSV file.'),
    },
    '/api/unsupervised': {
      post: endpoint(compatibility, 'Run unsupervised analysis', 'Compatibility alias for the original unsupervised analysis operation.', { body: jsonRequestBody }),
    },
    '/api/compute': {
      post: endpoint(compatibility, 'Compute analysis', 'Compatibility alias for the original compute operation.', { body: jsonRequestBody }),
    },
    '/api/experiments': {
      get: endpoint(compatibility, 'List experiments', 'Compatibility alias. List saved experiments for the active user.'),
      post: endpoint(compatibility, 'Save experiment', 'Compatibility alias. Save an analysis experiment. Requires admin or researcher role.', { body: jsonRequestBody }),
    },
    '/api/v1/auth/login': {
      post: endpoint(v1, 'Login', 'Create an HttpOnly cookie session in Atlas mode or a demo bearer session in demo mode.', { public: true, body: jsonRequestBody }),
    },
    '/api/v1/auth/logout': {
      post: endpoint(v1, 'Logout', 'Revoke and clear the active session.'),
    },
    '/api/v1/auth/me': {
      get: endpoint(v1, 'Current user', 'Read the active session and user profile.', { public: true }),
    },
    '/api/v1/auth/options': {
      get: endpoint(v1, 'Authentication options', 'Read enabled authentication providers.', { public: true }),
    },
    '/api/v1/auth/register': {
      post: endpoint(v1, 'Register', 'Register a password user when registration is enabled.', { public: true, body: jsonRequestBody }),
    },
    '/api/v1/auth/google': {
      get: endpoint(v1, 'Start Google sign-in', 'Redirect to Google when OAuth is configured.', { public: true }),
    },
    '/api/v1/auth/google/callback': {
      get: endpoint(v1, 'Google sign-in callback', 'Complete the Google OAuth flow.', { public: true }),
    },
    '/api/v1/health': {
      get: endpoint(v1, 'Health check', 'Check backend and storage readiness.', { public: true }),
    },
    '/api/v1/system-health': {
      get: endpoint(v1, 'System health', 'Read process and database metrics.'),
    },
    '/api/v1/test-db': {
      post: endpoint(v1, 'Test database', 'Admin-only database connectivity check.'),
    },
    '/api/v1/cache': {
      delete: endpoint(v1, 'Clear compute cache', 'Admin-only cache invalidation.'),
    },
    '/api/v1/users': {
      get: endpoint(v1, 'List users', 'Admin-only paginated user list. Demo mode lists built-in accounts; persistent management requires Atlas mode.'),
      post: endpoint(v1, 'Create user', 'Admin-only password account creation. Requires Atlas storage mode.', { body: jsonRequestBody, successStatus: 201 }),
    },
    '/api/v1/users/{id}': {
      get: endpoint(v1, 'Get user', 'Admin-only user details.'),
      patch: endpoint(v1, 'Update user', 'Admin-only profile and role changes. Requires Atlas storage mode.', { body: jsonRequestBody }),
      delete: endpoint(v1, 'Delete user', 'Admin-only user deletion. Requires Atlas storage mode.'),
    },
    '/api/v1/datasets': {
      get: endpoint(v1, 'List datasets', 'List accessible datasets; supports offset and limit query parameters.'),
      post: endpoint(v1, 'Upload dataset', 'Upload a CSV and create its initial immutable version. Requires admin or researcher role.', { body: uploadRequestBody, successStatus: 201 }),
    },
    '/api/v1/datasets/{datasetId}': {
      get: endpoint(v1, 'Get dataset', 'Read the current dataset and its rows.'),
      patch: endpoint(v1, 'Rename dataset', 'Rename a dataset. Requires admin or researcher role.', { body: jsonRequestBody }),
      delete: endpoint(v1, 'Delete dataset', 'Delete a dataset; requires an authorized role.'),
    },
    '/api/v1/datasets/{datasetId}/versions': {
      get: endpoint(v1, 'List dataset versions', 'List immutable versions for a dataset.'),
      post: endpoint(v1, 'Upload dataset version', 'Upload a new immutable dataset version. Requires admin or researcher role.', { body: uploadRequestBody, successStatus: 201 }),
    },
    '/api/v1/datasets/{datasetId}/versions/{versionId}': {
      get: endpoint(v1, 'Get dataset version', 'Read version metadata.'),
    },
    '/api/v1/datasets/{datasetId}/versions/{versionId}/preview': {
      get: endpoint(v1, 'Preview dataset version', 'Preview up to 20 rows from a specific version.'),
    },
    '/api/v1/datasets/{datasetId}/versions/{versionId}/download': {
      get: endpoint(v1, 'Download dataset version', 'Download the CSV for a specific version.'),
    },
    '/api/v1/datasets/{datasetId}/versions/{versionId}/quality-checks': {
      post: endpoint(v1, 'Check data quality', 'Reject structurally invalid feature data. Return reviewable missing-value, duplicate, constant-feature, and outlier findings with suggested thresholds and their rationale; suggestions do not automatically alter data.', { successStatus: 202, idempotencyKey: true }),
    },
    '/api/v1/quality-checks/{id}': {
      get: endpoint(v1, 'Get quality check', 'Read the status and results of a quality-check job.'),
    },
    '/api/v1/preprocessing-runs': {
      post: endpoint(v1, 'Start preprocessing', 'Queue mean imputation and normalization; create a derived immutable version. Requires admin or researcher role.', { body: jsonRequestBody, successStatus: 202, idempotencyKey: true }),
      get: endpoint(v1, 'List preprocessing runs', 'List preprocessing jobs for the active user.'),
    },
    '/api/v1/preprocessing-runs/{id}': {
      get: endpoint(v1, 'Get preprocessing run', 'Read run status and output version.'),
    },
    '/api/v1/analyses': {
      post: endpoint(v1, 'Create analysis', 'Queue PCA, t-SNE, or UMAP dimensionality reduction with K-Means, GMM, DBSCAN, or no clustering.', { body: jsonRequestBody, successStatus: 202, idempotencyKey: true }),
      get: endpoint(v1, 'List analyses', 'List analyses accessible to the active user.'),
    },
    '/api/v1/analyses/{id}': {
      get: endpoint(v1, 'Get analysis', 'Read analysis status, configuration, and results when complete.'),
    },
    '/api/v1/analyses/{id}/results': {
      get: endpoint(v1, 'Get analysis results', 'Read projected coordinates, optional PCA components, and cluster assignments.'),
    },
    '/api/v1/analyses/{id}/visualization': {
      get: endpoint(v1, 'Get 3D visualization data', 'Read the 3D point coordinates and cluster labels.'),
    },
    '/api/v1/analyses/{id}/evaluation': {
      get: endpoint(v1, 'Get analysis evaluation', 'Read clustering and dimensional-reduction evaluation metrics.'),
    },
    '/api/v1/analyses/{id}/reports': {
      post: endpoint(v1, 'Create analysis report', 'Generate an HTML or JSON report for a completed analysis. Requires admin or researcher role.', { body: jsonRequestBody, successStatus: 202, idempotencyKey: true }),
    },
    '/api/v1/reports/{id}': {
      get: endpoint(v1, 'Get report', 'Read report status and metadata.'),
    },
    '/api/v1/reports/{id}/download': {
      get: endpoint(v1, 'Download report', 'Download the generated HTML or JSON report.'),
    },
    '/api/v1/jobs/{id}': {
      get: endpoint(v1, 'Get job', 'Read queued-task status, progress, and results.'),
    },
    '/api/v1/jobs/{id}/cancel': {
      post: endpoint(v1, 'Cancel job', 'Cancel a queued task. Running tasks cannot be interrupted.'),
    },
    '/api/v1/experiments': {
      get: endpoint(v1, 'List experiments', 'List saved experiments for the active user.'),
      post: endpoint(v1, 'Save experiment', 'Save an analysis experiment. Requires admin or researcher role.', { body: jsonRequestBody }),
    },
    '/api/v1/compute': {
      post: endpoint(compatibility, 'Compute analysis', 'Compatibility alias for synchronous compute clients.', { body: jsonRequestBody }),
    },
    '/api/v1/unsupervised': {
      post: endpoint(compatibility, 'Run unsupervised task', 'Compatibility alias for the original task endpoint.', { body: jsonRequestBody }),
    },
    '/api/v2/analyses': {
      post: endpoint('API v2', 'Create analysis', 'Run PCA, t-SNE, or UMAP with K-Means, GMM, DBSCAN, or no clustering. The result includes point outlier/noise diagnostics and dimensionality/clustering quality metrics.', { body: jsonRequestBody, successStatus: 202, idempotencyKey: true }),
      get: endpoint('API v2', 'List analyses', 'List analysis jobs owned by the active user.'),
    },
    '/api/v2/analyses/optimize': {
      post: endpoint('API v2', 'Optimize analysis parameters', 'Automatically compare up to nine bounded configurations and rank them using silhouette quality and neighborhood trustworthiness. Limited to 200 rows per tuning run.', { body: jsonRequestBody, successStatus: 202, idempotencyKey: true }),
    },
    '/api/v2/analyses/{id}/points': {
      get: endpoint('API v2', 'List analysis points', 'Return paginated source rows, identifiers, labels, 3D coordinates, cluster/noise labels, robust outlier scores, and exclusion state. Page limit is 500.'),
    },
    '/api/v2/analyses/{id}/points/{rowIndex}': {
      delete: endpoint('API v2', 'Exclude analysis point', 'Exclude one source row from the analysis point view without changing the source dataset.'),
    },
    '/api/v2/analyses/{id}/points/{rowIndex}/restore': {
      post: endpoint('API v2', 'Restore analysis point', 'Restore a previously excluded source row.'),
    },
    '/api/v2/analyses/{id}/points/filter': {
      post: endpoint('API v2', 'Bulk filter analysis points', 'Exclude detected outliers, DBSCAN noise, both outliers and noise, or restore all excluded points.', { body: jsonRequestBody }),
    },
    '/api/v2/analyses/{id}/evaluation': {
      get: endpoint('API v2', 'Get advanced analysis evaluation', 'Read silhouette and Davies–Bouldin cluster quality, trustworthiness, noise, and robust outlier diagnostics.'),
    },
    '/api/v2/jobs/{id}': {
      get: endpoint('API v2', 'Get job', 'Read queued-task status, progress, and results, including parameter optimization results.'),
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'lab_session' },
    },
    schemas: {
      ApiSuccess: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: '#/components/schemas/JsonValue' },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: ['success', 'data', 'timestamp'],
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
          message: { type: 'string', description: 'Legacy-compatible copy of error.message.' },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: ['success', 'error', 'timestamp'],
      },
      JsonValue: {
        anyOf: [
          { type: 'string', nullable: true },
          { type: 'number' },
          { type: 'boolean' },
          { type: 'object', additionalProperties: { $ref: '#/components/schemas/JsonValue' } },
          { type: 'array', items: { $ref: '#/components/schemas/JsonValue' } },
        ],
      },
      JsonObject: {
        type: 'object',
        additionalProperties: { $ref: '#/components/schemas/JsonValue' },
      },
      AuthCredentials: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
          role: { type: 'string', enum: ['admin', 'researcher', 'viewer'] },
        },
        required: ['email', 'password'],
        additionalProperties: false,
      },
      RegistrationRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 12, maxLength: 512 },
          displayName: { type: 'string', minLength: 1, maxLength: 80 },
        },
        required: ['email', 'password', 'displayName'],
        additionalProperties: false,
      },
      DatasetRenameRequest: {
        type: 'object',
        properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
        required: ['name'],
        additionalProperties: false,
      },
      UserCreateRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 12, maxLength: 512 },
          name: { type: 'string', minLength: 1, maxLength: 80 },
          role: { type: 'string', enum: ['admin', 'researcher', 'viewer'], default: 'researcher' },
        },
        required: ['email', 'password', 'name'],
        additionalProperties: true,
      },
      UserUpdateRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'researcher', 'viewer'] },
        },
        minProperties: 1,
        additionalProperties: false,
      },
      ReductionConfig: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['PCA', 't-SNE', 'UMAP'] },
          normalization: { type: 'string', enum: ['none', 'z-score', 'min-max'] },
          perplexity: { type: 'number', minimum: 1, maximum: 50 },
          learningRate: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 500 },
          iterations: { type: 'integer', minimum: 1, maximum: 500 },
          nNeighbors: { type: 'integer', minimum: 2, maximum: 50 },
          minDist: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['method', 'normalization', 'perplexity', 'learningRate', 'iterations', 'nNeighbors', 'minDist'],
        additionalProperties: false,
      },
      ReductionOptions: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['PCA', 't-SNE', 'UMAP'] },
          normalization: { type: 'string', enum: ['none', 'z-score', 'min-max'] },
          perplexity: { type: 'number', minimum: 1, maximum: 50 },
          learningRate: { type: 'number', exclusiveMinimum: true, minimum: 0, maximum: 500 },
          iterations: { type: 'integer', minimum: 1, maximum: 500 },
          nNeighbors: { type: 'integer', minimum: 2, maximum: 50 },
          minDist: { type: 'number', minimum: 0, maximum: 1 },
        },
        additionalProperties: false,
      },
      ClusteringConfig: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['K-Means', 'DBSCAN', 'GMM', 'None'] },
          k: { type: 'integer', minimum: 1 },
          epsilon: { type: 'number', minimum: 0, exclusiveMinimum: true },
          minPts: { type: 'integer', minimum: 1 },
          gmmIterations: { type: 'integer', minimum: 1, maximum: 500 },
          gmmTolerance: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 1 },
          seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
        },
        required: ['method', 'k', 'epsilon', 'minPts'],
        additionalProperties: false,
      },
      ClusteringOptions: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['K-Means', 'DBSCAN', 'GMM', 'None'] },
          k: { type: 'integer', minimum: 1 },
          epsilon: { type: 'number', exclusiveMinimum: true, minimum: 0 },
          minPts: { type: 'integer', minimum: 1 },
          gmmIterations: { type: 'integer', minimum: 1, maximum: 500 },
          gmmTolerance: { type: 'number', exclusiveMinimum: true, minimum: 0, maximum: 1 },
          seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
        },
        additionalProperties: false,
      },
      AnalysisRequest: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
          version: { type: 'integer', minimum: 1 },
          features: { type: 'array', items: { type: 'string' }, minItems: 3 },
          reduction: { $ref: '#/components/schemas/ReductionOptions' },
          clustering: { $ref: '#/components/schemas/ClusteringOptions' },
        },
        required: ['datasetId'],
        additionalProperties: false,
      },
      PreprocessingRequest: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
          version: { type: 'integer', minimum: 1 },
          normalization: { type: 'string', enum: ['none', 'z-score', 'min-max'], default: 'z-score' },
          features: { type: 'array', items: { type: 'string' }, minItems: 3 },
        },
        required: ['datasetId'],
        additionalProperties: false,
      },
      OptimizationRequest: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
          version: { type: 'integer', minimum: 1 },
          features: { type: 'array', items: { type: 'string' }, minItems: 3 },
          reduction: { $ref: '#/components/schemas/ReductionConfig' },
          clustering: { $ref: '#/components/schemas/ClusteringConfig' },
        },
        required: ['datasetId', 'reduction', 'clustering'],
        additionalProperties: false,
      },
      ReportRequest: {
        type: 'object',
        properties: { format: { type: 'string', enum: ['html', 'json'], default: 'html' } },
        additionalProperties: false,
      },
      PointFilterRequest: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['exclude-outliers', 'exclude-noise', 'exclude-outliers-and-noise', 'restore-all'],
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      ExperimentRequest: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
          datasetName: { type: 'string' },
          reductionMethod: { type: 'string' },
          clusteringMethod: { type: 'string' },
          k: { type: 'number' },
          silhouetteScore: { type: 'number', nullable: true },
          ari: { type: 'number', nullable: true },
          params: { $ref: '#/components/schemas/JsonObject' },
        },
        required: ['datasetId', 'datasetName', 'reductionMethod', 'clusteringMethod', 'k', 'silhouetteScore', 'ari'],
        additionalProperties: false,
      },
      ComputeRequest: {
        type: 'object',
        properties: {
          matrix: { type: 'array', minItems: 1, items: { type: 'array', minItems: 3, items: { type: 'number' } } },
          groundTruth: { type: 'array', items: { $ref: '#/components/schemas/JsonValue' } },
          reductionConfig: { $ref: '#/components/schemas/ReductionConfig' },
          clusteringConfig: { $ref: '#/components/schemas/ClusteringConfig' },
        },
        required: ['matrix', 'reductionConfig', 'clusteringConfig'],
        additionalProperties: false,
      },
      UnsupervisedRequest: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['anomaly', 'association'] },
          rows: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/JsonObject' } },
          features: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } },
          normalization: { type: 'string', enum: ['z-score', 'min-max', 'none'] },
          options: { $ref: '#/components/schemas/JsonObject' },
        },
        required: ['kind', 'rows', 'features', 'options'],
        additionalProperties: false,
      },
      AuthOptions: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['demo', 'atlas'] },
          google: { type: 'boolean' },
          registration: { type: 'boolean' },
        },
        HealthStatus: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['alive', 'ready', 'ok'] },
            database: { type: 'string' },
          },
          required: ['status'],
          additionalProperties: true,
        },
        SystemHealth: {
          type: 'object',
          properties: {
            uptime: { type: 'string' },
            memory: {
              type: 'object',
              properties: {
                rssMb: { type: 'string' },
                heapUsedMb: { type: 'string' },
                heapTotalMb: { type: 'string' },
              },
              required: ['rssMb', 'heapUsedMb', 'heapTotalMb'],
            },
            database: {
              type: 'object',
              properties: {
                engine: { type: 'string' },
                connected: { type: 'boolean' },
                latency: { type: 'string' },
                totalDocuments: { type: 'integer' },
              },
              required: ['engine', 'connected', 'latency', 'totalDocuments'],
            },
            cache: {
              type: 'object',
              properties: { memoryEntries: { type: 'integer' }, status: { type: 'string' } },
              required: ['memoryEntries', 'status'],
            },
          },
          required: ['uptime', 'memory', 'database', 'cache'],
        },
        required: ['mode', 'google', 'registration'],
      },
      AuthSession: {
        type: 'object',
        properties: {
          authenticated: { type: 'boolean' },
          user: { type: 'object', allOf: [{ $ref: '#/components/schemas/User' }], nullable: true },
        },
        required: ['authenticated', 'user'],
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
          authenticated: { type: 'boolean' },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
      OpenApiDocument: {
        type: 'object',
        properties: {
          openapi: { type: 'string', example: '3.0.3' },
          info: { type: 'object', additionalProperties: true },
          servers: { type: 'array', items: { type: 'object', additionalProperties: true } },
          paths: { type: 'object', additionalProperties: { type: 'object', additionalProperties: true } },
          components: { type: 'object', additionalProperties: true },
          tags: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
        required: ['openapi', 'info', 'paths'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'researcher', 'viewer'] },
          email: { type: 'string', format: 'email' },
          provider: { type: 'string' },
        },
        required: ['id', 'name', 'role'],
        additionalProperties: true,
      },
      ExperimentRecord: {
        type: 'object',
        properties: {
          id: { $ref: '#/components/schemas/JsonValue' },
          dataset_id: { type: 'string' },
          dataset_name: { type: 'string' },
          reduction_method: { type: 'string' },
          clustering_method: { type: 'string' },
          k: { type: 'number' },
          silhouette_score: { type: 'number', nullable: true },
          ari: { type: 'number', nullable: true },
          params: { $ref: '#/components/schemas/JsonObject' },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'dataset_id', 'dataset_name', 'reduction_method', 'clustering_method', 'k', 'silhouette_score', 'ari', 'params', 'created_at'],
      },
      DatasetSummaryList: { type: 'array', items: { $ref: '#/components/schemas/DatasetSummary' } },
      DatasetVersionList: { type: 'array', items: { $ref: '#/components/schemas/DatasetVersion' } },
      UserList: { type: 'array', items: { $ref: '#/components/schemas/User' } },
      ApiJobList: { type: 'array', items: { $ref: '#/components/schemas/ApiJob' } },
      PointList: { type: 'array', items: { $ref: '#/components/schemas/Point' } },
      ExperimentList: { type: 'array', items: { $ref: '#/components/schemas/ExperimentRecord' } },
      ApiJob: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['quality-check', 'preprocessing-run', 'analysis', 'optimization', 'report'] },
          status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] },
          progress: { type: 'number', minimum: 0, maximum: 100 },
          attempts: { type: 'integer', minimum: 0 },
          maxAttempts: { type: 'integer', minimum: 1 },
          deadLetter: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          result: { $ref: '#/components/schemas/JsonValue' },
          error: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
            required: ['code', 'message'],
          },
        },
        required: ['id', 'type', 'status', 'progress', 'attempts', 'maxAttempts', 'createdAt', 'updatedAt'],
      },
      Dataset: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          filename: { type: 'string' },
          totalRows: { type: 'integer', minimum: 0 },
          features: { type: 'array', items: { type: 'string' } },
          labelColumn: { type: 'string', nullable: true },
          idColumn: { type: 'string', nullable: true },
          rawRows: { type: 'array', items: { $ref: '#/components/schemas/JsonObject' } },
          createdAt: { type: 'string', format: 'date-time' },
          rows: { type: 'array', items: { $ref: '#/components/schemas/JsonObject' } },
        },
        required: ['id', 'name', 'filename', 'totalRows', 'features', 'labelColumn', 'idColumn', 'createdAt'],
        additionalProperties: true,
      },
      DatasetSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          filename: { type: 'string' },
          total_rows: { type: 'integer' },
          features_count: { type: 'integer' },
          label_column: { type: 'string', nullable: true },
          id_column: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
          is_preloaded: { type: 'boolean' },
          is_local: { type: 'boolean' },
        },
        required: ['id', 'name', 'filename', 'total_rows', 'label_column', 'id_column', 'created_at'],
        additionalProperties: true,
      },
      DatasetVersion: {
        type: 'object',
        properties: {
          version: { type: 'integer', minimum: 1 },
          parentVersion: { type: 'integer', minimum: 1 },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['version', 'createdAt'],
        additionalProperties: true,
      },
      AnalysisResult: {
        type: 'object',
        properties: {
          coordinates: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 } },
          clusterAssignments: { type: 'array', items: { type: 'integer' } },
          silhouetteScore: { type: 'number', nullable: true },
          adjustedRandIndex: { type: 'number', nullable: true },
          explainedVariance: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
          totalExplainedVariance: { type: 'number' },
          components: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          clusterCounts: { type: 'object', additionalProperties: { type: 'integer' } },
          noiseCount: { type: 'integer' },
          computeTimeMs: { type: 'number' },
        },
        required: ['coordinates', 'clusterAssignments', 'silhouetteScore', 'adjustedRandIndex', 'clusterCounts', 'noiseCount'],
        additionalProperties: true,
      },
      Visualization: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['scatter3d'] },
          points: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rowIndex: { type: 'integer' },
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number' },
                cluster: { type: 'integer' },
              },
              required: ['rowIndex', 'x', 'y', 'z', 'cluster'],
            },
          },
        },
        required: ['type', 'points'],
      },
      Evaluation: {
        type: 'object',
        properties: {
          silhouetteScore: { type: 'number', nullable: true },
          adjustedRandIndex: { type: 'number', nullable: true },
          explainedVariance: { type: 'array', items: { type: 'number' } },
          totalExplainedVariance: { type: 'number' },
          clusterCounts: { type: 'object', additionalProperties: { type: 'integer' } },
          noiseCount: { type: 'integer' },
          computeTimeMs: { type: 'number' },
          quality: { $ref: '#/components/schemas/JsonObject' },
          outliers: { $ref: '#/components/schemas/JsonObject' },
        },
        additionalProperties: true,
      },
      Point: {
        type: 'object',
        properties: {
          rowIndex: { type: 'integer' },
          id: { $ref: '#/components/schemas/JsonValue' },
          label: { $ref: '#/components/schemas/JsonValue' },
          values: { $ref: '#/components/schemas/JsonObject' },
          coordinates: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
          cluster: { type: 'integer' },
          isNoise: { type: 'boolean' },
          robustOutlierScore: { type: 'number' },
          isOutlier: { type: 'boolean' },
          excluded: { type: 'boolean' },
        },
        required: ['rowIndex', 'id', 'label', 'values', 'coordinates', 'cluster', 'isNoise', 'excluded'],
        additionalProperties: false,
      },
      ErrorResult: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          clearedCount: { type: 'integer' },
          registered: { type: 'boolean' },
          authenticated: { type: 'boolean' },
          deleted: { type: 'boolean' },
          id: { $ref: '#/components/schemas/JsonValue' },
          status: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  },
  security: [{ bearerAuth: [] }, { sessionCookie: [] }],
};

type OperationRecord = Record<string, unknown> & {
  tags?: string[];
  responses?: Record<string, unknown>;
  requestBody?: Record<string, unknown>;
  parameters?: Array<Record<string, unknown>>;
};

const paths = openApiSpec.paths as unknown as Record<string, Record<string, OperationRecord>>;
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

paths['/api/datasets'].post = { ...paths['/api/datasets/upload'].post };

function copyMissingOperations(sourcePrefix: string, targetPrefix: string, retag?: string) {
  for (const [sourcePath, pathItem] of Object.entries(paths)) {
    if (!sourcePath.startsWith(`${sourcePrefix}/`)
      || sourcePrefix === '/api' && /^\/api\/v[12](?:\/|$)/.test(sourcePath)) continue;
    const targetPath = `${targetPrefix}${sourcePath.slice(sourcePrefix.length)}`;
    paths[targetPath] ??= {};
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method) || paths[targetPath][method]) continue;
      paths[targetPath][method] = {
        ...operation,
        ...(retag ? { tags: [retag] } : {}),
      };
    }
  }
}

copyMissingOperations('/api', '/api/v1');
copyMissingOperations('/api', '/api/v2');
copyMissingOperations('/api/v1', '/api/v2', 'API v2');

const requestSchemas: Array<[RegExp, string]> = [
  [/\/auth\/register$/, 'RegistrationRequest'],
  [/\/auth\/login$/, 'AuthCredentials'],
  [/\/users$/, 'UserCreateRequest'],
  [/\/users\/\{id\}$/, 'UserUpdateRequest'],
  [/\/datasets\/\{id\}$/, 'DatasetRenameRequest'],
  [/\/datasets\/\{datasetId\}$/, 'DatasetRenameRequest'],
  [/\/(?:compute)$/, 'ComputeRequest'],
  [/\/(?:preprocessing-runs)$/, 'PreprocessingRequest'],
  [/\/analyses\/optimize$/, 'OptimizationRequest'],
  [/\/analyses$/, 'AnalysisRequest'],
  [/\/analyses\/\{id\}\/reports$/, 'ReportRequest'],
  [/\/analyses\/\{id\}\/points\/filter$/, 'PointFilterRequest'],
  [/\/experiments$/, 'ExperimentRequest'],
  [/\/unsupervised$/, 'UnsupervisedRequest'],
  [/\/datasets\/\{datasetId\}\/versions\/\{versionId\}\/quality-checks$/, 'JsonObject'],
];

function dataSchemaFor(path: string, method: string) {
  if (path === '/openapi.json') return 'OpenApiDocument';
  if (/\/auth\/options$/.test(path)) return 'AuthOptions';
  if (/\/auth\/me$/.test(path)) return 'AuthSession';
  if (/\/auth\/login$/.test(path)) return 'LoginResponse';
  if (/\/system-health$/.test(path)) return 'SystemHealth';
  if (/\/(?:livez|readyz|health)$/.test(path)) return 'HealthStatus';
  if (/\/users$/.test(path) && method === 'get') return 'UserList';
  if (/\/users\/\{id\}$/.test(path)) return method === 'delete' ? 'ErrorResult' : 'User';
  if (/\/datasets$/.test(path) && method === 'get') return 'DatasetSummaryList';
  if (/\/datasets\/upload$/.test(path) || /\/datasets$/.test(path) && method === 'post') return 'Dataset';
  if (/\/datasets\/\{(?:id|datasetId)\}$/.test(path)) {
    return method === 'delete' ? 'ErrorResult' : method === 'patch' ? 'DatasetSummary' : 'Dataset';
  }
  if (/\/datasets\/\{(?:id|datasetId)\}\/versions$/.test(path) && method === 'get') return 'DatasetVersionList';
  if (/\/versions$/.test(path) && method === 'post') return 'DatasetVersion';
  if (/\/versions\/\{versionId\}\/download$/.test(path) || /\/datasets\/\{id\}\/download$/.test(path)
    || /\/reports\/\{id\}\/download$/.test(path)) return undefined;
  if (/\/datasets\/\{datasetId\}\/versions\/\{versionId\}\/preview$/.test(path)) return 'Dataset';
  if (/\/datasets\/\{datasetId\}\/versions\/\{versionId\}$/.test(path)) return 'Dataset';
  if (/\/datasets\/\{(?:id|datasetId)\}\/preview$/.test(path)) return 'Dataset';
  if (/\/quality-checks$/.test(path) && method === 'post') return 'ApiJob';
  if ((/\/(?:quality-checks|preprocessing-runs|analyses|reports)(?:\/\{id\})?$/.test(path)
    || /\/analyses\/(?:optimize|\{id\}\/reports)$/.test(path)) && method === 'post') return 'ApiJob';
  if (/\/preprocessing-runs$|\/analyses$/.test(path) && method === 'get') return 'ApiJobList';
  if (/\/experiments$/.test(path) && method === 'get') return 'ExperimentList';
  if (/\/analyses\/\{id\}\/points$/.test(path)) return 'PointList';
  if (/\/quality-checks\/\{id\}$|\/preprocessing-runs\/\{id\}$|\/analyses\/\{id\}$|\/jobs\/\{id\}$|\/reports\/\{id\}$/.test(path)) {
    return 'ApiJob';
  }
  if (/\/(?:jobs\/\{id\}\/cancel|users\/\{id\}|cache)$/.test(path) && method !== 'get') return 'ErrorResult';
  if (/\/analyses\/\{id\}\/results$/.test(path)) return 'AnalysisResult';
  if (/\/analyses\/\{id\}\/visualization$/.test(path)) return 'Visualization';
  if (/\/analyses\/\{id\}\/evaluation$/.test(path)) return 'Evaluation';
  return 'JsonValue';
}

function addPathParameters(path: string, operation: OperationRecord) {
  const parameters = [...(operation.parameters ?? [])];
  for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
    if (parameters.some(parameter => parameter.in === 'path' && parameter.name === name)) continue;
    parameters.push({
      name,
      in: 'path',
      required: true,
      schema: name === 'rowIndex' || name === 'versionId'
        ? { type: 'integer', minimum: name === 'rowIndex' ? 0 : 1 }
        : { type: 'string', minLength: 1 },
    });
  }
  const queryParameters = /\/(?:datasets|users)$/.test(path)
    || /\/analyses\/\{id\}\/points$/.test(path);
  if (queryParameters) {
    parameters.push(
      { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: path.endsWith('/points') ? 500 : 100 } },
    );
  }
  if (/\/analyses\/\{id\}\/points$/.test(path)) {
    parameters.push({
      name: 'includeExcluded',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: false },
    });
  }
  if (parameters.length) operation.parameters = parameters;
}

for (const [path, pathItem] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!methods.has(method)) continue;
    addPathParameters(path, operation);

    if (operation.requestBody) {
      const requestBody = operation.requestBody;
      const content = requestBody.content as Record<string, { schema?: unknown }> | undefined;
      const json = content?.['application/json'];
      if (json) {
        const schemaName = requestSchemas.find(([pattern]) => pattern.test(path))?.[1] ?? 'JsonObject';
        json.schema = { $ref: `#/components/schemas/${schemaName}` };
      }
      if (/\/analyses\/\{id\}\/reports$/.test(path)) requestBody.required = false;
    }

    const responses = operation.responses;
    if (!responses) continue;
    for (const [status, responseValue] of Object.entries(responses)) {
      const response = responseValue as {
        description?: string;
        headers?: Record<string, unknown>;
        content?: Record<string, { schema?: unknown }>;
      };
      const content = response.content;
      if (!content) continue;
      const json = content['application/json'];
      if (json && !status.startsWith('4') && !status.startsWith('5')) {
        const schemaName = dataSchemaFor(path, method);
        json.schema = path === '/openapi.json'
          ? { $ref: '#/components/schemas/OpenApiDocument' }
          : schemaName
          ? {
            allOf: [
              { $ref: '#/components/schemas/ApiSuccess' },
              { type: 'object', properties: { data: { $ref: `#/components/schemas/${schemaName}` } } },
            ],
          }
          : { $ref: '#/components/schemas/ApiSuccess' };
        if (path === '/openapi.json') {
          response.description = 'OpenAPI 3.0 document.';
        }
      }
      if (!status.startsWith('4') && !status.startsWith('5')) {
        const headers: Record<string, unknown> = {};
        if (/\/(?:datasets|users)$/.test(path) && method === 'get') {
          headers['X-Next-Offset'] = {
            description: 'Offset for the next page, present when additional records exist.',
            schema: { type: 'integer', minimum: 0 },
          };
        }
        if (/\/analyses\/\{id\}\/points$/.test(path)) {
          headers['X-Total-Count'] = { description: 'Total number of included points.', schema: { type: 'integer' } };
          headers['X-Next-Offset'] = { description: 'Offset for the next page, when present.', schema: { type: 'integer', minimum: 0 } };
        }
        if (Object.keys(headers).length) response.headers = headers;
      }
    }
  }
}

for (const path of ['/api/metrics', '/api/auth/google', '/api/auth/google/callback',
  '/api/v1/auth/google', '/api/v1/auth/google/callback',
  '/api/v2/auth/google', '/api/v2/auth/google/callback']) {
  const operation = paths[path]?.get;
  if (!operation?.responses) continue;
  if (path.endsWith('/metrics')) {
    operation.responses['200'] = {
      description: 'Prometheus text exposition format.',
      content: { 'text/plain': { schema: { type: 'string' } } },
    };
  } else {
    delete operation.responses['200'];
    operation.responses['302'] = { description: 'Redirect to the identity provider or application.' };
  }
}

for (const path of Object.keys(paths).filter(path =>
  /\/(?:datasets\/\{(?:id|datasetId)\}(?:\/versions\/\{versionId\})?\/download|reports\/\{id\}\/download)$/.test(path))) {
  const operation = paths[path].get;
  if (!operation?.responses) continue;
  operation.responses['200'] = {
    description: 'Download the requested file.',
    content: path.includes('/reports/')
      ? {
        'text/html': { schema: { type: 'string' } },
        'application/json': { schema: { type: 'string' } },
      }
      : { 'text/csv': { schema: { type: 'string' } } },
  };
}
