import { computeGMM } from '../src/algorithms/gmm';
import { parseAnalysisTask, runAnalysisTask, AnalysisTaskResult } from '../src/algorithms/analysisTasks';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import multer from 'multer';
import crypto from 'crypto';
import { MAX_CSV_BYTES, MAX_CSV_COLUMNS, MAX_CSV_ROWS, parseCSVString } from '../src/utils/dataParser';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../src/utils/demoSession';
import {
  ClusteringConfig,
  DatasetDocument,
  JsonValue,
  ReductionConfig,
} from '../src/types';
import {
  initDatabase,
  getAllDatasets,
  getDatasetById,
  saveDataset,
  updateDataset,
  deleteDataset,
  getAllExperiments,
  saveExperiment,
  isMongoConnected,
  testDbConnection,
  getComputeCache,
  saveComputeCache,
  clearComputeCache,
  getSystemHealth,
} from './db';
import { projectionSettingsError, reduceMatrix } from '../src/utils/exploration';
import { computeKMeans } from '../src/algorithms/kmeans';
import { computeDBSCAN } from '../src/algorithms/dbscan';
import { summarizeClustering } from '../src/algorithms/metrics';
import { clusterCountError } from '../src/algorithms/unsupervised';
import { sendSuccess, sendError } from './response';
import { isNumberMatrix } from './computeValidation';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from './errors';
import {
  authenticate,
  requireRole,
  AuthenticatedRequest,
  issueSession,
  requireAuth,
  revokeSession,
} from './auth';

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.LAB_BIND_HOST || '127.0.0.1';

// 1. High-Performance Middlewares: Gzip Compression & Security CORS
app.use(compression({
  threshold: 1024, // Only compress responses > 1KB
  level: 6,
}));
app.use(cors({
  origin: [/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/, ...(process.env.LAB_ALLOWED_ORIGIN ? [process.env.LAB_ALLOWED_ORIGIN] : [])],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use('/api', authenticate, (req, res, next) => {
  if (req.method === 'GET' && (req.path === '/health' || req.path === '/auth/me')) return next();
  if (req.method === 'POST' && req.path === '/auth/login') return next();
  res.setHeader('Cache-Control', 'no-store');
  requireAuth(req, res, next);
});
app.use('/api/auth/login', express.json({ limit: '2kb' }));
app.use(express.json({ limit: '32mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/api/health') {
      console.log(`📡 [HTTP] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_BYTES + 1, files: 1, fields: 0 },
});

function parseUploadedCSV(content: Buffer, name: string) {
  if (content.length > MAX_CSV_BYTES) throw new AppError('The CSV exceeds the 5 MiB file limit.', 413, 'PAYLOAD_TOO_LARGE');
  try {
    return parseCSVString(new TextDecoder('utf-8', { fatal: true }).decode(content), name);
  } catch (error) {
    throw new BadRequestError(error instanceof TypeError ? 'The CSV must use UTF-8 encoding.'
      : error instanceof Error ? error.message : 'Invalid CSV file.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReductionConfig(value: unknown): value is ReductionConfig {
  if (!isRecord(value)) return false;
  return (value.method === 'PCA' || value.method === 't-SNE' || value.method === 'UMAP')
    && (value.normalization === 'z-score' || value.normalization === 'min-max' || value.normalization === 'none')
    && typeof value.perplexity === 'number'
    && typeof value.learningRate === 'number'
    && typeof value.iterations === 'number'
    && typeof value.nNeighbors === 'number'
    && typeof value.minDist === 'number';
}

function isClusteringConfig(value: unknown): value is ClusteringConfig {
  if (!isRecord(value)) return false;
  return (value.method === 'K-Means' || value.method === 'DBSCAN' || value.method === 'GMM' || value.method === 'None')
    && typeof value.k === 'number'
    && typeof value.epsilon === 'number'
    && typeof value.minPts === 'number';
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

// -------------------------------------------------------------
// AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC) ROUTES
// -------------------------------------------------------------

// Đăng nhập giả lập hoặc chuyển đổi vai trò (admin, researcher, viewer)
app.post('/api/auth/login', (req, res, next) => {
  try {
    const { email, password, role = 'admin' } = isRecord(req.body) ? req.body : {};
    const expectedEmail = process.env.LAB_AUTH_EMAIL || DEMO_EMAIL;
    const expectedPassword = process.env.LAB_AUTH_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : DEMO_PASSWORD);
    if (!expectedPassword || typeof email !== 'string' || email.trim().toLowerCase() !== expectedEmail.toLowerCase()
      || password !== expectedPassword) {
      throw new UnauthorizedError('Invalid email or password.');
    }
    if (role !== 'admin' && role !== 'researcher' && role !== 'viewer') {
      throw new BadRequestError('Unknown workspace role.');
    }

    const { token, user } = issueSession(role);
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, {
      token,
      user,
      message: `Signed in as ${user.name} (${user.role}).`,
    });
  } catch (err) {
    next(err);
  }
});

// Lấy thông tin phiên đăng nhập hiện tại
app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, {
    authenticated: Boolean(req.user),
    user: req.user || null,
  });
});

app.post('/api/auth/logout', (req, res) => {
  revokeSession(req);
  sendSuccess(res, { authenticated: false });
});

// -------------------------------------------------------------
// CORE BUSINESS & SCIENTIFIC DATA ENDPOINTS
// -------------------------------------------------------------

// 3. Health check & DB status
app.get('/api/health', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    database: isMongoConnected ? 'MongoDB Atlas (Cloud)' : 'In-Memory (Ready for MongoDB)',
  });
});

// 4. Enterprise System Health & RAM Monitoring
app.get('/api/system-health', async (_req, res, next) => {
  try {
    const health = await getSystemHealth();
    sendSuccess(res, health);
  } catch (err) {
    next(err);
  }
});

// 5. Force test connection to MongoDB
app.post('/api/test-db', requireRole(['admin']), async (_req, res, next) => {
  try {
    const result = await testDbConnection();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// 6. Clear Compute Cache (Yêu cầu quyền Admin)
app.delete('/api/cache', requireRole(['admin']), async (_req, res, next) => {
  try {
    const cleared = await clearComputeCache();
    sendSuccess(res, {
      message: `Cleared ${cleared} cache entries.`,
      clearedCount: cleared,
    });
  } catch (err) {
    next(err);
  }
});

// 7. Get list of datasets
app.get('/api/datasets', async (_req, res, next) => {
  try {
    const list = await getAllDatasets();
    sendSuccess(res, list);
  } catch (err) {
    next(err);
  }
});

// 8. Get single dataset detail
app.get('/api/datasets/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const data = await getDatasetById(id);
    if (!data) {
      throw new NotFoundError(`Dataset [${id}]`);
    }
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// 9. Upload and parse new dataset to MongoDB (Yêu cầu quyền Admin hoặc Researcher)
app.post(
  '/api/datasets/upload',
  requireRole(['admin', 'researcher']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new BadRequestError('Attach a CSV file.');
      }

      const parsed = parseUploadedCSV(req.file.buffer, req.file.originalname);
      const newDataset: DatasetDocument = {
        id: `dataset_${crypto.randomUUID()}`,
        name: req.file.originalname.replace(/\.csv$/i, ''),
        filename: req.file.originalname,
        totalRows: parsed.totalRows,
        features: parsed.featureColumns,
        labelColumn: parsed.labelColumn,
        idColumn: parsed.idColumn,
        rawRows: parsed.rawRows,
        createdAt: new Date().toISOString(),
      };

      await saveDataset(newDataset);
      sendSuccess(res, newDataset, 201);
    } catch (err) {
      next(err);
    }
  }
);

// 10. Update dataset name / metadata (Yêu cầu quyền Admin hoặc Researcher)
app.patch('/api/datasets/:id', requireRole(['admin', 'researcher']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { name } = req.body as { name?: string };
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestError('Invalid dataset name.');
    }
    if (id === 'cancer_wdbc' || id === 'wholesale_customers') throw new ForbiddenError('Sample datasets are read-only.');
    const updated = await updateDataset(id, name.trim());
    if (!updated) {
      throw new NotFoundError(`Dataset [${id}]`);
    }
    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

// 11. Delete dataset (Yêu cầu quyền Admin)
app.delete('/api/datasets/:id', requireRole(['admin']), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (id === 'cancer_wdbc' || id === 'wholesale_customers') throw new ForbiddenError('Sample datasets are read-only.');
    const success = await deleteDataset(id);
    if (!success) {
      throw new NotFoundError(`Dataset [${id}]`);
    }
    sendSuccess(res, { message: 'Dataset deleted.' });
  } catch (err) {
    next(err);
  }
});

// Separate task result schema; never store rule sets as cluster assignments.
const taskCache = new Map<string, AnalysisTaskResult>();
app.post('/api/unsupervised', (req, res, next) => {
  try {
    const task = parseAnalysisTask(req.body);
    const key = crypto.createHash('sha256').update(JSON.stringify(task)).digest('hex');
    const cached = taskCache.get(key);
    if (cached) { sendSuccess(res, { ...cached, fromCache: true }); return; }
    const result = runAnalysisTask(task);
    if (taskCache.size >= 3) taskCache.delete(taskCache.keys().next().value!);
    taskCache.set(key, result);
    sendSuccess(res, { ...result, fromCache: false });
  } catch (error) { next(new BadRequestError(error instanceof Error ? error.message : 'Invalid unsupervised task.')); }
});

// 12. High-Performance Compute API with SHA-256 Multi-Tier Caching
app.post('/api/compute', async (req, res, next) => {
  try {
    const body: unknown = req.body;
    if (!isRecord(body)
      || !isNumberMatrix(body.matrix)
      || !Array.isArray(body.groundTruth)
      || !isReductionConfig(body.reductionConfig)
      || !isClusteringConfig(body.clusteringConfig)) {
      throw new BadRequestError('Invalid feature matrix or analysis settings.');
    }
    const { matrix, groundTruth, reductionConfig, clusteringConfig } = body;
    if (matrix.length > MAX_CSV_ROWS || matrix[0].length > MAX_CSV_COLUMNS) {
      throw new BadRequestError(`The matrix limit is ${MAX_CSV_ROWS} rows and ${MAX_CSV_COLUMNS} columns.`);
    }
    if ((groundTruth.length !== 0 && groundTruth.length !== matrix.length) || !groundTruth.every((value) => value === null
      || typeof value === 'string'
      || (typeof value === 'number' && Number.isFinite(value))
      || typeof value === 'boolean')) {
      throw new BadRequestError('Invalid ground-truth labels.');
    }

    const settingsError = projectionSettingsError(reductionConfig, matrix.length)
      ?? clusterCountError(clusteringConfig.method, clusteringConfig.k, matrix.length);
    if (settingsError) throw new BadRequestError(settingsError);
    if (clusteringConfig.method === 'DBSCAN' && (!Number.isFinite(clusteringConfig.epsilon) || clusteringConfig.epsilon <= 0
      || !Number.isInteger(clusteringConfig.minPts) || clusteringConfig.minPts < 1)) {
      throw new BadRequestError('Invalid DBSCAN radius or minimum point count.');
    }
    if (clusteringConfig.method === 'GMM') {
      const { gmmIterations = 100, gmmTolerance = 1e-5, seed = 42 } = clusteringConfig;
      if (!Number.isInteger(gmmIterations) || gmmIterations < 1 || gmmIterations > 500
        || !Number.isFinite(gmmTolerance) || gmmTolerance <= 0 || gmmTolerance > 1
        || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new BadRequestError('Invalid GMM iterations, tolerance, or seed.');
      }
    }

    // Generate Deterministic Cache Key (Fingerprint of Data & Parameters)
    const cacheKey = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          version: 4, // Invalidate results that used nonzero PCA null axes or the old ARI.
          matrix,
          groundTruth,
          reduction: reductionConfig,
          clustering: clusteringConfig,
        })
      )
      .digest('hex');

    // Check Multi-Tier Cache first (Sub-millisecond hit)
    const cachedResult = await getComputeCache(cacheKey);
    if (cachedResult) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', cacheKey);
      return sendSuccess(res, {
        ...cachedResult,
        fromCache: true,
        computeTimeMs: 0,
      });
    }

    const startTime = Date.now();

    // Step A: Dimensionality Reduction
    const projection = reduceMatrix(matrix, reductionConfig);
    const { coordinates } = projection;
    if (coordinates.some(point => point.some(value => !Number.isFinite(value)))) {
      throw new BadRequestError('The projection produced non-finite values. Check the scale of the input.');
    }

    // Step B: Clustering
    let clusterAssignments: number[] = [];
    if (clusteringConfig.method === 'K-Means') {
      const kmeansRes = computeKMeans(coordinates, clusteringConfig.k);
      clusterAssignments = kmeansRes.clusters;
    } else if (clusteringConfig.method === 'GMM') {
      clusterAssignments = computeGMM(coordinates, { k: clusteringConfig.k, maxIterations: clusteringConfig.gmmIterations, tolerance: clusteringConfig.gmmTolerance, seed: clusteringConfig.seed }).clusters;
    } else if (clusteringConfig.method === 'DBSCAN') {
      const dbscanRes = computeDBSCAN(
        coordinates,
        clusteringConfig.epsilon,
        clusteringConfig.minPts
      );
      clusterAssignments = dbscanRes.clusters;
    }

    // Step C: Metrics Evaluation
    const clusterMetrics = summarizeClustering(coordinates, clusterAssignments, groundTruth);

    const computeTimeMs = Date.now() - startTime;

    const resultPayload = {
      ...projection,
      clusterAssignments,
      ...clusterMetrics,
    };

    // Asynchronously write to Cache
    saveComputeCache(cacheKey, resultPayload).catch(console.error);

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Key', cacheKey);
    sendSuccess(res, {
      ...resultPayload,
      fromCache: false,
      computeTimeMs,
    });
  } catch (error) {
    next(error);
  }
});

// 13. Experiments History in MongoDB
app.get('/api/experiments', async (_req, res, next) => {
  try {
    const list = await getAllExperiments();
    sendSuccess(res, list);
  } catch (err) {
    next(err);
  }
});

app.post('/api/experiments', requireRole(['admin', 'researcher']), async (req, res, next) => {
  try {
    const body: unknown = req.body;
    if (!isRecord(body)
      || typeof body.datasetId !== 'string'
      || typeof body.datasetName !== 'string'
      || typeof body.reductionMethod !== 'string'
      || typeof body.clusteringMethod !== 'string'
      || typeof body.k !== 'number'
      || !(typeof body.silhouetteScore === 'number' || body.silhouetteScore === null)
      || !(typeof body.ari === 'number' || body.ari === null)
      || (body.params !== undefined && !isJsonValue(body.params))) {
      throw new BadRequestError('Invalid experiment data.');
    }

    const id = await saveExperiment({
      datasetId: body.datasetId,
      datasetName: body.datasetName,
      reductionMethod: body.reductionMethod,
      clusteringMethod: body.clusteringMethod,
      k: body.k,
      silhouetteScore: body.silhouetteScore,
      ari: body.ari,
      params: isRecord(body.params) && isJsonValue(body.params) ? body.params : {},
    });

    sendSuccess(res, { id, message: 'Experiment saved.' }, 201);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// CENTRALIZED ERROR HANDLING MIDDLEWARE
// -------------------------------------------------------------
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);

  // Bắt lỗi Custom AppError (400, 401, 403, 404, ...)
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return sendError(res, tooLarge ? 413 : 400, tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      tooLarge ? 'The CSV exceeds the 5 MiB file limit.' : 'Send exactly one CSV file in the file field.');
  }
  if (isRecord(err) && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    return sendError(res, err.type === 'entity.too.large' ? 413 : 400, 'INVALID_REQUEST_BODY', 'Invalid or oversized JSON request.');
  }

  // Bắt lỗi không xác định (Unhandled 500)
  console.error('💥 [Server Internal Error]:', err);
  sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error.');
});

// 14. Initialize Database & Graceful Start
initDatabase()
  .then(() => {
    app.listen(Number(PORT), HOST, () => {
      console.log(`🚀 [Fullstack Backend] Running on http://localhost:${PORT}`);
      console.log(`🛡️  [Security RBAC] Authentication & Role Guard (HTTP 401/403) Active`);
      console.log(`⚡ [Performance Middleware] Gzip Compression Enabled`);
      console.log(`🧠 [Compute Caching] Multi-tier SHA-256 LRU + MongoDB Cache Active`);
    });
  })
  .catch(console.error);

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 [Server] Đang đóng ứng dụng an toàn...');
  process.exit(0);
});
