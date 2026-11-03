import express from 'express';
import cors from 'cors';
import compression from 'compression';
import multer from 'multer';
import crypto from 'crypto';
import { parseCSVString } from '../src/utils/dataParser';
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
import { computePCA } from '../src/algorithms/pca';
import { computeTSNE } from '../src/algorithms/tsne';
import { computeUMAP } from '../src/algorithms/umap';
import { computeKMeans } from '../src/algorithms/kmeans';
import { computeDBSCAN } from '../src/algorithms/dbscan';
import { computeSilhouetteScore, computeARI } from '../src/algorithms/metrics';
import { sendSuccess, sendError } from './response';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from './errors';
import {
  authenticate,
  requireAuth,
  requireRole,
  AuthenticatedRequest,
  DEMO_USERS,
  UserRole,
} from './auth';

const app = express();
const PORT = process.env.PORT || 5000;

// 1. High-Performance Middlewares: Gzip Compression & Security CORS
app.use(compression({
  threshold: 1024, // Only compress responses > 1KB
  level: 6,
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// 2. Structured Request Timing & Authentication Context
app.use(authenticate);

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

const upload = multer({ storage: multer.memoryStorage() });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberMatrix(value: unknown): value is number[][] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((row) => Array.isArray(row)
      && row.length > 0
      && row.every((item) => typeof item === 'number' && Number.isFinite(item)));
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
  return (value.method === 'K-Means' || value.method === 'DBSCAN' || value.method === 'None')
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
    const { role = 'admin' } = req.body as { role?: UserRole };
    const token = `${role}_token`;
    const user = DEMO_USERS[token];

    if (!user) {
      throw new BadRequestError(`Vai trò "${role}" không tồn tại. Chọn 'admin', 'researcher' hoặc 'viewer'.`);
    }

    sendSuccess(res, {
      token,
      user,
      message: `Đăng nhập thành công với vai trò ${user.name} (${user.role}).`,
    });
  } catch (err) {
    next(err);
  }
});

// Lấy thông tin phiên đăng nhập hiện tại
app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
  sendSuccess(res, {
    authenticated: Boolean(req.user),
    user: req.user || null,
  });
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
app.post('/api/test-db', async (_req, res, next) => {
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
      message: `Đã xóa ${cleared} bản ghi cache thành công!`,
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
      throw new NotFoundError(`Bộ dữ liệu [${id}]`);
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
        throw new BadRequestError('Vui lòng đính kèm file CSV!');
      }

      const csvString = req.file.buffer.toString('utf-8');
      const parsed = parseCSVString(csvString, req.file.originalname);
      const newDataset: DatasetDocument = {
        id: `dataset_${Date.now()}`,
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
      throw new BadRequestError('Tên bộ dữ liệu không hợp lệ.');
    }
    const updated = await updateDataset(id, { name: name.trim() });
    if (!updated) {
      throw new NotFoundError(`Bộ dữ liệu [${id}]`);
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
    const success = await deleteDataset(id);
    if (!success) {
      throw new NotFoundError(`Bộ dữ liệu [${id}]`);
    }
    sendSuccess(res, { message: 'Đã xóa bộ dữ liệu thành công.' });
  } catch (err) {
    next(err);
  }
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
      throw new BadRequestError('Tham số tính toán ma trận hoặc cấu hình không hợp lệ.');
    }
    const { matrix, groundTruth, reductionConfig, clusteringConfig } = body;
    if (!groundTruth.every((value) => value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean')) {
      throw new BadRequestError('Nhãn dữ liệu ground-truth không hợp lệ.');
    }

    // Generate Deterministic Cache Key (Fingerprint of Data & Parameters)
    const cacheKey = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          rows: matrix.length,
          cols: matrix[0]?.length || 0,
          head: matrix[0]?.slice(0, 6),
          mid: matrix[Math.floor(matrix.length / 2)]?.slice(0, 6),
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
    let coordinates: [number, number, number][] = [];
    let explainedVariance: [number, number, number] | undefined;
    let totalExplainedVariance: number | undefined;
    let components: number[][] | undefined;

    if (reductionConfig.method === 'PCA') {
      const pcaRes = computePCA(matrix);
      coordinates = pcaRes.coordinates;
      explainedVariance = pcaRes.explainedVariance;
      totalExplainedVariance = pcaRes.totalExplainedVariance;
      components = pcaRes.components;
    } else if (reductionConfig.method === 't-SNE') {
      coordinates = computeTSNE(matrix, {
        perplexity: reductionConfig.perplexity || 30,
        learningRate: reductionConfig.learningRate || 100,
        iterations: reductionConfig.iterations || 250,
      });
    } else if (reductionConfig.method === 'UMAP') {
      coordinates = computeUMAP(matrix, {
        nNeighbors: reductionConfig.nNeighbors || 15,
        minDist: reductionConfig.minDist || 0.1,
      });
    }

    // Step B: Clustering
    let clusterAssignments: number[] = [];
    let noiseCount = 0;

    if (clusteringConfig.method === 'K-Means') {
      const kmeansRes = computeKMeans(coordinates, clusteringConfig.k || 2);
      clusterAssignments = kmeansRes.clusters;
    } else if (clusteringConfig.method === 'DBSCAN') {
      const dbscanRes = computeDBSCAN(
        coordinates,
        clusteringConfig.epsilon || 3.5,
        clusteringConfig.minPts || 5
      );
      clusterAssignments = dbscanRes.clusters;
      noiseCount = dbscanRes.noiseCount;
    } else {
      clusterAssignments = new Array(coordinates.length).fill(0);
    }

    // Step C: Metrics Evaluation
    const silhouette = computeSilhouetteScore(coordinates, clusterAssignments);
    let ari: number | null = null;
    if (groundTruth && groundTruth.length === clusterAssignments.length) {
      ari = computeARI(groundTruth, clusterAssignments);
    }

    const clusterCounts: Record<number, number> = {};
    for (const c of clusterAssignments) {
      if (c >= 0) clusterCounts[c] = (clusterCounts[c] || 0) + 1;
    }

    const computeTimeMs = Date.now() - startTime;

    const resultPayload = {
      coordinates,
      clusterAssignments,
      silhouetteScore: silhouette,
      adjustedRandIndex: ari,
      explainedVariance,
      totalExplainedVariance,
      components,
      clusterCounts,
      noiseCount,
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

app.post('/api/experiments', async (req, res, next) => {
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
      throw new BadRequestError('Thông tin lưu thí nghiệm không hợp lệ.');
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

    sendSuccess(res, { id, message: 'Đã lưu thí nghiệm thành công.' }, 201);
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

  // Bắt lỗi không xác định (Unhandled 500)
  console.error('💥 [Server Internal Error]:', err);
  const message = err instanceof Error ? err.message : String(err);
  sendError(res, 500, 'INTERNAL_SERVER_ERROR', message || 'Lỗi xử lý nội bộ máy chủ.');
});

// 14. Initialize Database & Graceful Start
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
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
