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
      schema: { type: 'object', additionalProperties: true },
    },
  },
};

const uploadRequestBody = {
  required: true,
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
      schema: { type: 'string', minLength: 1, maxLength: 128 },
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
          data: { type: 'object', additionalProperties: true },
          timestamp: { type: 'string', format: 'date-time' },
        },
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
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }, { sessionCookie: [] }],
};
