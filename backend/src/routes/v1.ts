import multer from 'multer';
import { MAX_CSV_BYTES, parseCSVString } from '@dimension-lab/algorithms/dataParser';
import { clusterCountError } from '@dimension-lab/algorithms/unsupervised';
import { projectionSettingsError } from '@dimension-lab/algorithms/projection';
import type { DatasetDocument, DatasetRow } from '@dimension-lab/contracts';
import { atlasMode } from '../database/atlas';
import { AuthenticatedRequest, listDemoUsers, requireRole } from '../auth/auth';
import { isClusteringConfig, isRecord, isReductionConfig } from '../http/validation';
import { BadRequestError, AppError, ForbiddenError, NotFoundError } from '../http/errors';
import { sendSuccess } from '../http/response';
import { createDemoDatasetVersion, getDemoDataset, getDemoDatasetVersion, isSampleDataset, listDemoDatasetVersions } from '../repositories/db';
import { loadOwnedDataset, loadOwnedDatasetVersion, listOwnedDatasetVersions, publishOwnedDatasetVersion } from '../repositories/atlasDatasets';
import { createManagedUser, deleteManagedUser, getManagedUser, listManagedUsers, updateManagedUser } from '../repositories/users';
import { enqueueApiJob, getApiJob, cancelApiJob, listApiJobs, type ApiJob } from '../services/apiJobs';
import { assertDatasetBusinessRules } from '../services/dataQuality';

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CSV_BYTES + 1, files: 1, fields: 0 } });
const excludedAnalysisRows = new Map<string, Set<number>>();

function publicJob(job: ApiJob) {
  const { ownerId: _ownerId, ...visible } = job;
  return visible;
}

function sendAcceptedJob(res: Parameters<typeof sendSuccess>[0], job: ApiJob, apiPrefix: string) {
  res.location(`${apiPrefix}/jobs/${job.id}`);
  sendSuccess(res, publicJob(job), 202);
}

function parseVersion(value: string) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new BadRequestError('Version must be a positive integer.');
  return version;
}

function toCsv(headers: string[], rows: DatasetRow[]) {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(cell).join(','), ...rows.map(row => headers.map(header => cell(row[header])).join(','))].join('\r\n');
}

function uploadedCsv(file: Express.Multer.File | undefined) {
  if (!file) throw new BadRequestError('Attach a CSV file.');
  if (file.buffer.length > MAX_CSV_BYTES) throw new AppError('The CSV exceeds the 5 MiB file limit.', 413, 'PAYLOAD_TOO_LARGE');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
  } catch {
    throw new BadRequestError('The CSV must use UTF-8 encoding.');
  }
  const parsed = parseCSVString(text, file.originalname);
  return { parsed, content: file.buffer };
}

function ownedSampleDataset(id: string) {
  return isSampleDataset(id);
}

async function listVersions(id: string, ownerId: string) {
  if (atlasMode && !ownedSampleDataset(id)) return listOwnedDatasetVersions(id, ownerId);
  const dataset = getDemoDataset(id);
  return dataset ? listDemoDatasetVersions(id) : null;
}

async function loadVersion(id: string, version: number, ownerId: string) {
  if (atlasMode && !ownedSampleDataset(id)) return loadOwnedDatasetVersion(id, version, ownerId);
  return getDemoDatasetVersion(id, version)?.dataset ?? null;
}

async function loadCurrentDataset(id: string, ownerId: string) {
  if (atlasMode && !ownedSampleDataset(id)) return loadOwnedDataset(id, ownerId);
  return getDemoDataset(id);
}

async function getCompletedJob(id: string, ownerId: string, type: string) {
  const job = await getApiJob(id, ownerId);
  if (!job || job.type !== type) throw new NotFoundError('Job');
  if (job.status === 'failed') throw new AppError(job.error?.message ?? 'The job failed.', 409, job.error?.code ?? 'JOB_FAILED');
  if (job.status !== 'succeeded') throw new AppError('The job has not completed.', 409, 'JOB_NOT_COMPLETED');
  return job;
}

function registerVersionedRoutes(app: import('express').Express, version: 'v1' | 'v2') {
  const apiPrefix = `/api/${version}`;
  const isV2 = version === 'v2';
  app.get(`${apiPrefix}/users`, requireRole(['admin']), async (req: AuthenticatedRequest, res, next) => {
    try {
      const offset = Number(req.query.offset ?? 0), limit = Number(req.query.limit ?? 50);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new BadRequestError('Invalid user page.');
      }
      if (!atlasMode) {
        const users = listDemoUsers().slice(offset, offset + limit + 1).map(user => ({ ...user, provider: 'demo' }));
        if (users.length > limit) res.setHeader('X-Next-Offset', String(offset + limit));
        sendSuccess(res, users.slice(0, limit));
        return;
      }
      const users = await listManagedUsers(offset, limit + 1);
      if (users.length > limit) res.setHeader('X-Next-Offset', String(offset + limit));
      sendSuccess(res, users.slice(0, limit));
    } catch (error) { next(error); }
  });

  app.post(`${apiPrefix}/users`, requireRole(['admin']), async (req, res, next) => {
    try { sendSuccess(res, await createManagedUser(req.body), 201); }
    catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/users/:id`, requireRole(['admin']), async (req, res, next) => {
    try {
      if (!atlasMode) {
        const user = listDemoUsers().find(item => item.id === String(req.params.id));
        if (!user) throw new NotFoundError('User');
        sendSuccess(res, { ...user, provider: 'demo' });
        return;
      }
      const user = await getManagedUser(String(req.params.id));
      if (!user) throw new NotFoundError('User');
      sendSuccess(res, user);
    } catch (error) { next(error); }
  });

  app.patch(`${apiPrefix}/users/:id`, requireRole(['admin']), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (String(req.params.id) === req.user!.id && isRecord(req.body) && req.body.role && req.body.role !== 'admin') {
        throw new ForbiddenError('You cannot remove your own admin role.');
      }
      sendSuccess(res, await updateManagedUser(String(req.params.id), req.body));
    } catch (error) { next(error); }
  });

  app.delete(`${apiPrefix}/users/:id`, requireRole(['admin']), async (req: AuthenticatedRequest, res, next) => {
    try {
      await deleteManagedUser(String(req.params.id), req.user!.id);
      sendSuccess(res, { deleted: true });
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/datasets/:datasetId/versions`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = String(req.params.datasetId);
      const versions = await listVersions(id, req.user!.id);
      if (!versions) throw new NotFoundError('Dataset');
      sendSuccess(res, versions);
    } catch (error) { next(error); }
  });

  app.post(`${apiPrefix}/datasets/:datasetId/versions`, requireRole(['admin', 'researcher']), csvUpload.single('file'),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const id = String(req.params.datasetId);
        if (ownedSampleDataset(id)) throw new ForbiddenError('Sample datasets are read-only.');
        const current = await loadCurrentDataset(id, req.user!.id);
        if (!current) throw new NotFoundError('Dataset');
        const { parsed, content } = uploadedCsv(req.file);
        const dataset: DatasetDocument = {
          ...current,
          filename: req.file!.originalname,
          totalRows: parsed.totalRows,
          features: parsed.featureColumns,
          labelColumn: parsed.labelColumn,
          idColumn: parsed.idColumn,
          rawRows: parsed.rawRows,
          createdAt: new Date().toISOString(),
        };
        assertDatasetBusinessRules(dataset);
        let version: { version: number; parentVersion: number; createdAt: string };
        if (atlasMode && !ownedSampleDataset(id)) {
          const created = await publishOwnedDatasetVersion(id, dataset, content, req.user!.id, parsed.headers);
          if (!created) throw new NotFoundError('Dataset');
          version = created;
        } else {
          const currentVersions = listDemoDatasetVersions(id);
          const created = createDemoDatasetVersion(dataset, content, currentVersions[0]?.version ?? 1);
          version = { version: created.version, parentVersion: created.parentVersion!, createdAt: created.createdAt };
        }
        sendSuccess(res, version, 201);
      } catch (error) { next(error); }
    });

  app.get(`${apiPrefix}/datasets/:datasetId/versions/:versionId`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const dataset = await loadVersion(String(req.params.datasetId), parseVersion(String(req.params.versionId)), req.user!.id);
      if (!dataset) throw new NotFoundError('Dataset version');
      const { rawRows: _rows, ...metadata } = dataset;
      sendSuccess(res, metadata);
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/datasets/:datasetId/versions/:versionId/preview`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const dataset = await loadVersion(String(req.params.datasetId), parseVersion(String(req.params.versionId)), req.user!.id);
      if (!dataset) throw new NotFoundError('Dataset version');
      const { rawRows, ...metadata } = dataset;
      sendSuccess(res, { ...metadata, rows: rawRows.slice(0, 20) });
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/datasets/:datasetId/versions/:versionId/download`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = String(req.params.datasetId), version = parseVersion(String(req.params.versionId));
      const dataset = await loadVersion(id, version, req.user!.id);
      if (!dataset) throw new NotFoundError('Dataset version');
      const headers = [...new Set(dataset.rawRows.flatMap(row => Object.keys(row)))];
      res.attachment(dataset.filename);
      res.type('text/csv; charset=utf-8').send(toCsv(headers, dataset.rawRows));
    } catch (error) { next(error); }
  });

  app.post(`${apiPrefix}/datasets/:datasetId/versions/:versionId/quality-checks`,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const datasetId = String(req.params.datasetId), version = parseVersion(String(req.params.versionId));
        const dataset = await loadVersion(datasetId, version, req.user!.id);
        if (!dataset) throw new NotFoundError('Dataset version');
        assertDatasetBusinessRules(dataset);
        const job = await enqueueApiJob(req.user!.id, 'quality-check', { datasetId, version },
          req.get('Idempotency-Key'));
        sendAcceptedJob(res, job, apiPrefix);
      } catch (error) { next(error); }
    });

  app.get(`${apiPrefix}/quality-checks/:id`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const job = await getApiJob(String(req.params.id), req.user!.id);
      if (!job || job.type !== 'quality-check') throw new NotFoundError('Quality check');
      sendSuccess(res, publicJob(job));
    } catch (error) { next(error); }
  });

  app.post(`${apiPrefix}/preprocessing-runs`, requireRole(['admin', 'researcher']), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!isRecord(req.body) || typeof req.body.datasetId !== 'string') throw new BadRequestError('datasetId is required.');
      const datasetId = req.body.datasetId;
      const version = req.body.version === undefined ? undefined : parseVersion(String(req.body.version));
      const normalization = req.body.normalization ?? 'z-score';
      if (normalization !== 'none' && normalization !== 'z-score' && normalization !== 'min-max') {
        throw new BadRequestError('Invalid normalization method.');
      }
      const versions = await listVersions(datasetId, req.user!.id);
      if (!versions?.length) throw new NotFoundError('Dataset');
      const sourceVersion = version ?? versions[0].version;
      const dataset = await loadVersion(datasetId, sourceVersion, req.user!.id);
      if (!dataset) throw new NotFoundError('Dataset version');
      const features = req.body.features ?? dataset.features;
      assertDatasetBusinessRules(dataset, features);
      const job = await enqueueApiJob(req.user!.id, 'preprocessing-run',
        { datasetId, sourceVersion, normalization, features }, req.get('Idempotency-Key'));
      sendAcceptedJob(res, job, apiPrefix);
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/preprocessing-runs/:id`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const job = await getApiJob(String(req.params.id), req.user!.id);
      if (!job || job.type !== 'preprocessing-run') throw new NotFoundError('Preprocessing run');
      sendSuccess(res, publicJob(job));
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/preprocessing-runs`, async (req: AuthenticatedRequest, res, next) => {
    try { sendSuccess(res, await listApiJobs(req.user!.id, 'preprocessing-run')); }
    catch (error) { next(error); }
  });

  app.post(`${apiPrefix}/analyses`, async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!isRecord(req.body) || typeof req.body.datasetId !== 'string') throw new BadRequestError('datasetId is required.');
      const datasetId = req.body.datasetId;
      const versions = await listVersions(datasetId, req.user!.id);
      if (!versions?.length) throw new NotFoundError('Dataset');
      const version = req.body.version === undefined ? versions[0].version : parseVersion(String(req.body.version));
      const dataset = await loadVersion(datasetId, version, req.user!.id);
      if (!dataset) throw new NotFoundError('Dataset version');
      const features = req.body.features ?? dataset.features;
      assertDatasetBusinessRules(dataset, features);
      const reduction = req.body.reduction ?? {};
      const clustering = req.body.clustering ?? {};
      const reductionConfig = {
        method: 'PCA',
        normalization: 'z-score',
        perplexity: 30,
        learningRate: 100,
        iterations: 250,
        nNeighbors: 15,
        minDist: 0.1,
        ...(isRecord(reduction) && reduction),
      };
      const clusteringConfig = {
        method: 'K-Means',
        k: 3,
        epsilon: 0.5,
        minPts: 5,
        ...(isRecord(clustering) && clustering),
      };
      if (!isReductionConfig(reductionConfig) || !isClusteringConfig(clusteringConfig)) {
        throw new BadRequestError('Invalid PCA or clustering configuration.');
      }
      const settingsError = projectionSettingsError(reductionConfig, dataset.rawRows.length)
        ?? clusterCountError(clusteringConfig.method, clusteringConfig.k, dataset.rawRows.length);
      if (settingsError) throw new BadRequestError(settingsError);
      if (clusteringConfig.method === 'DBSCAN' && (!Number.isFinite(clusteringConfig.epsilon) || clusteringConfig.epsilon <= 0
        || !Number.isInteger(clusteringConfig.minPts) || clusteringConfig.minPts < 1)) {
        throw new BadRequestError('Invalid DBSCAN radius or minimum point count.');
      }
      if (clusteringConfig.method === 'GMM' && (clusteringConfig.gmmIterations !== undefined
        && (clusteringConfig.gmmIterations < 1 || clusteringConfig.gmmIterations > 500)
        || clusteringConfig.gmmTolerance !== undefined && (clusteringConfig.gmmTolerance <= 0 || clusteringConfig.gmmTolerance > 1)
        || clusteringConfig.seed !== undefined && (clusteringConfig.seed < 0 || clusteringConfig.seed > 0xffffffff))) {
        throw new BadRequestError('Invalid GMM iterations, tolerance, or seed.');
      }
      const job = await enqueueApiJob(req.user!.id, 'analysis',
        { datasetId, version, features, reductionConfig, clusteringConfig, isV2 }, req.get('Idempotency-Key'));
      sendAcceptedJob(res, job, apiPrefix);
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/analyses`, async (req: AuthenticatedRequest, res, next) => {
    try { sendSuccess(res, await listApiJobs(req.user!.id, 'analysis')); }
    catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/analyses/:id`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const job = await getApiJob(String(req.params.id), req.user!.id);
      if (!job || job.type !== 'analysis') throw new NotFoundError('Analysis');
      sendSuccess(res, publicJob(job));
    } catch (error) { next(error); }
  });

  async function analysisResult(req: AuthenticatedRequest) {
    const job = await getCompletedJob(String(req.params.id), req.user!.id, 'analysis');
    if (!isRecord(job.result) || !isRecord(job.result.result)) throw new AppError('Analysis result is unavailable.', 500, 'RESULT_UNAVAILABLE');
    return job.result.result;
  }

  app.get(`${apiPrefix}/analyses/:id/results`, async (req: AuthenticatedRequest, res, next) => {
    try { sendSuccess(res, await analysisResult(req)); }
    catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/analyses/:id/visualization`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await analysisResult(req);
      if (!Array.isArray(result.coordinates) || !Array.isArray(result.clusterAssignments)) {
        throw new AppError('Analysis visualization is unavailable.', 500, 'RESULT_UNAVAILABLE');
      }
      const clusterAssignments = result.clusterAssignments as unknown[];
      sendSuccess(res, {
        type: 'scatter3d',
        points: result.coordinates.map((point, index) => ({
          rowIndex: index,
          x: point[0],
          y: point[1],
          z: point[2],
          cluster: clusterAssignments[index] ?? -1,
        })),
      });
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/analyses/:id/evaluation`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await analysisResult(req);
      sendSuccess(res, {
        silhouetteScore: result.silhouetteScore,
        adjustedRandIndex: result.adjustedRandIndex,
        explainedVariance: result.explainedVariance,
        totalExplainedVariance: result.totalExplainedVariance,
        clusterCounts: result.clusterCounts,
        noiseCount: result.noiseCount,
        computeTimeMs: result.computeTimeMs,
        ...(isV2 && isRecord(result.quality) && result.quality),
        ...(isV2 && isRecord(result.pointDiagnostics) && { outliers: result.pointDiagnostics.summary }),
      });
    } catch (error) { next(error); }
  });

  if (isV2) {
    app.get(`${apiPrefix}/analyses/:id/points`, async (req: AuthenticatedRequest, res, next) => {
      try {
        const job = await getCompletedJob(String(req.params.id), req.user!.id, 'analysis');
        if (!isRecord(job.result) || !isRecord(job.result.result) || !Array.isArray(job.result.features)
          || typeof job.result.datasetId !== 'string' || typeof job.result.version !== 'number') {
          throw new AppError('Analysis point data is unavailable.', 500, 'RESULT_UNAVAILABLE');
        }
        const result = job.result.result;
        if (!Array.isArray(result.coordinates) || !Array.isArray(result.clusterAssignments)) {
          throw new AppError('Analysis point data is unavailable.', 500, 'RESULT_UNAVAILABLE');
        }
        const coordinates: unknown[] = result.coordinates;
        const assignments: unknown[] = result.clusterAssignments;
        const dataset = await loadVersion(job.result.datasetId, job.result.version, req.user!.id);
        if (!dataset) throw new NotFoundError('Dataset version');
        const offset = Number(req.query.offset ?? 0), limit = Number(req.query.limit ?? 100);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > dataset.rawRows.length
          || !Number.isInteger(limit) || limit < 1 || limit > 500) {
          throw new BadRequestError('Invalid point page; offset must be nonnegative and limit must be from 1 to 500.');
        }
        const excluded = excludedAnalysisRows.get(`${req.user!.id}:${job.id}`) ?? new Set<number>();
        const diagnostics = isRecord(result.pointDiagnostics) ? result.pointDiagnostics : undefined;
        const points = dataset.rawRows.map((row, rowIndex) => {
          const coordinate = coordinates[rowIndex];
          const excludedPoint = excluded.has(rowIndex);
          return {
            rowIndex,
            id: dataset.idColumn ? row[dataset.idColumn] ?? rowIndex + 1 : rowIndex + 1,
            label: dataset.labelColumn ? row[dataset.labelColumn] ?? null : null,
            values: row,
            coordinates: coordinate,
            cluster: assignments[rowIndex] ?? -1,
            isNoise: assignments[rowIndex] === -1,
            ...(diagnostics && Array.isArray(diagnostics.robustOutlierScores) && {
              robustOutlierScore: diagnostics.robustOutlierScores[rowIndex],
              isOutlier: Array.isArray(diagnostics.outlierFlags) && diagnostics.outlierFlags[rowIndex] === true,
            }),
            excluded: excludedPoint,
          };
        }).filter(point => req.query.includeExcluded === 'true' || !point.excluded);
        const page = points.slice(offset, offset + limit);
        res.setHeader('X-Total-Count', String(points.length));
        if (offset + limit < points.length) res.setHeader('X-Next-Offset', String(offset + limit));
        sendSuccess(res, page);
      } catch (error) { next(error); }
    });

    app.delete(`${apiPrefix}/analyses/:id/points/:rowIndex`, async (req: AuthenticatedRequest, res, next) => {
      try {
        const job = await getCompletedJob(String(req.params.id), req.user!.id, 'analysis');
        const rowIndex = Number(req.params.rowIndex);
        const rowCount = isRecord(job.result) && isRecord(job.result.result) && Array.isArray(job.result.result.coordinates)
          ? job.result.result.coordinates.length : 0;
        if (!Number.isSafeInteger(rowIndex) || rowIndex < 0 || rowIndex >= rowCount) throw new NotFoundError('Analysis point');
        const key = `${req.user!.id}:${job.id}`;
        const excluded = excludedAnalysisRows.get(key) ?? new Set<number>();
        excluded.add(rowIndex);
        excludedAnalysisRows.set(key, excluded);
        sendSuccess(res, { analysisId: job.id, rowIndex, excluded: true });
      } catch (error) { next(error); }
    });

    app.post(`${apiPrefix}/analyses/:id/points/:rowIndex/restore`, async (req: AuthenticatedRequest, res, next) => {
      try {
        const job = await getCompletedJob(String(req.params.id), req.user!.id, 'analysis');
        const rowIndex = Number(req.params.rowIndex);
        const rowCount = isRecord(job.result) && isRecord(job.result.result) && Array.isArray(job.result.result.coordinates)
          ? job.result.result.coordinates.length : 0;
        if (!Number.isSafeInteger(rowIndex) || rowIndex < 0 || rowIndex >= rowCount) throw new NotFoundError('Analysis point');
        excludedAnalysisRows.get(`${req.user!.id}:${job.id}`)?.delete(rowIndex);
        sendSuccess(res, { analysisId: job.id, rowIndex, excluded: false });
      } catch (error) { next(error); }
    });

    app.post(`${apiPrefix}/analyses/:id/points/filter`, async (req: AuthenticatedRequest, res, next) => {
      try {
        const job = await getCompletedJob(String(req.params.id), req.user!.id, 'analysis');
        const result = await analysisResult(req);
        const action = isRecord(req.body) ? req.body.action : undefined;
        if (action !== 'exclude-outliers' && action !== 'exclude-noise'
          && action !== 'exclude-outliers-and-noise' && action !== 'restore-all') {
          throw new BadRequestError('Action must be exclude-outliers, exclude-noise, exclude-outliers-and-noise, or restore-all.');
        }
        const key = `${req.user!.id}:${job.id}`;
        const excluded = excludedAnalysisRows.get(key) ?? new Set<number>();
        if (action === 'restore-all') excluded.clear();
        else {
          const diagnostics = isRecord(result.pointDiagnostics) ? result.pointDiagnostics : undefined;
          const outlierFlags = Array.isArray(diagnostics?.outlierFlags) ? diagnostics.outlierFlags : [];
          const noiseFlags = Array.isArray(diagnostics?.noiseFlags) ? diagnostics.noiseFlags : [];
          outlierFlags.forEach((flag, index) => {
            if (flag === true && action !== 'exclude-noise') excluded.add(index);
          });
          noiseFlags.forEach((flag, index) => {
            if (flag === true && action !== 'exclude-outliers') excluded.add(index);
          });
        }
        excludedAnalysisRows.set(key, excluded);
        sendSuccess(res, { analysisId: job.id, action, excludedCount: excluded.size });
      } catch (error) { next(error); }
    });

    app.post(`${apiPrefix}/analyses/optimize`, async (req: AuthenticatedRequest, res, next) => {
      try {
        if (!isRecord(req.body) || typeof req.body.datasetId !== 'string') {
          throw new BadRequestError('datasetId is required.');
        }
        const datasetId = req.body.datasetId;
        const versions = await listVersions(datasetId, req.user!.id);
        if (!versions?.length) throw new NotFoundError('Dataset');
        const version = req.body.version === undefined ? versions[0].version : parseVersion(String(req.body.version));
        const dataset = await loadVersion(datasetId, version, req.user!.id);
        if (!dataset) throw new NotFoundError('Dataset version');
        const features = req.body.features ?? dataset.features;
        assertDatasetBusinessRules(dataset, features);
        const reduction = req.body.reduction;
        const clustering = req.body.clustering;
        if (!isReductionConfig(reduction) || !isClusteringConfig(clustering)) {
          throw new BadRequestError('Valid reduction and clustering configurations are required.');
        }
        if (dataset.rawRows.length > 200) {
          throw new BadRequestError('Automatic tuning supports at most 200 rows per run.');
        }
        const settingsError = projectionSettingsError(reduction, dataset.rawRows.length)
          ?? clusterCountError(clustering.method, clustering.k, dataset.rawRows.length);
        if (settingsError) throw new BadRequestError(settingsError);
        const job = await enqueueApiJob(req.user!.id, 'optimization',
          { datasetId, version, features, reductionConfig: reduction, clusteringConfig: clustering },
          req.get('Idempotency-Key'));
        sendAcceptedJob(res, job, apiPrefix);
      } catch (error) { next(error); }
    });
  }

  app.post(`${apiPrefix}/analyses/:id/reports`, requireRole(['admin', 'researcher']), async (req: AuthenticatedRequest, res, next) => {
    try {
      const analysis = await getCompletedJob(String(req.params.id), req.user!.id, 'analysis');
      if (!isRecord(analysis.result) || !isRecord(analysis.result.result)) throw new AppError('Analysis result is unavailable.', 500, 'RESULT_UNAVAILABLE');
      const format = isRecord(req.body) ? req.body.format ?? 'html' : 'html';
      if (format !== 'html' && format !== 'json') throw new BadRequestError('Report format must be html or json.');
      const job = await enqueueApiJob(req.user!.id, 'report', { analysisId: analysis.id, format },
        req.get('Idempotency-Key'));
      sendAcceptedJob(res, job, apiPrefix);
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/reports/:id`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const job = await getApiJob(String(req.params.id), req.user!.id);
      if (!job || job.type !== 'report') throw new NotFoundError('Report');
      const { result: _result, ...metadata } = publicJob(job);
      sendSuccess(res, metadata);
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/reports/:id/download`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const job = await getCompletedJob(String(req.params.id), req.user!.id, 'report');
      if (!isRecord(job.result) || typeof job.result.content !== 'string' || (job.result.format !== 'html' && job.result.format !== 'json')) {
        throw new AppError('Report content is unavailable.', 500, 'REPORT_UNAVAILABLE');
      }
      const isHtml = job.result.format === 'html';
      res.attachment(`dimension-lab-report-${job.id}.${isHtml ? 'html' : 'json'}`);
      res.type(isHtml ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8').send(job.result.content);
    } catch (error) { next(error); }
  });

  app.get(`${apiPrefix}/jobs/:id`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const job = await getApiJob(String(req.params.id), req.user!.id);
      if (!job) throw new NotFoundError('Job');
      sendSuccess(res, publicJob(job));
    } catch (error) { next(error); }
  });

  app.post(`${apiPrefix}/jobs/:id/cancel`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const cancelled = await cancelApiJob(String(req.params.id), req.user!.id);
      if (cancelled === null) throw new NotFoundError('Job');
      if (!cancelled) throw new AppError('Only queued jobs can be cancelled.', 409, 'JOB_NOT_CANCELLABLE');
      sendSuccess(res, { id: String(req.params.id), status: 'cancelled' });
    } catch (error) { next(error); }
  });
}

export function registerV1Routes(app: import('express').Express) {
  registerVersionedRoutes(app, 'v1');
}

export function registerV2Routes(app: import('express').Express) {
  registerVersionedRoutes(app, 'v2');
}
