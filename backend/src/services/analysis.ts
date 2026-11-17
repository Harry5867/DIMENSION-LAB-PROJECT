import { computeGMM } from '@dimension-lab/algorithms/gmm';
import { parseAnalysisTask, runAnalysisTask, AnalysisTaskResult } from '@dimension-lab/algorithms/analysisTasks';
import crypto from 'crypto';
import { MAX_CSV_COLUMNS, MAX_CSV_ROWS } from '@dimension-lab/algorithms/dataParser';
import { getComputeCache, saveComputeCache } from '../repositories/db';
import { projectionSettingsError, reduceMatrix } from '@dimension-lab/algorithms/projection';
import { computeKMeans } from '@dimension-lab/algorithms/kmeans';
import { computeDBSCAN } from '@dimension-lab/algorithms/dbscan';
import { summarizeClustering } from '@dimension-lab/algorithms/metrics';
import { clusterCountError } from '@dimension-lab/algorithms/unsupervised';
import { isNumberMatrix } from '../http/computeValidation';
import { BadRequestError } from '../http/errors';
import { isClusteringConfig, isRecord, isReductionConfig } from '../http/validation';

// Separate task result schema; never store rule sets as cluster assignments.
const taskCache = new Map<string, AnalysisTaskResult>();

export function analyzeUnsupervised(body: unknown) {
  const task = parseAnalysisTask(body);
  const key = crypto.createHash('sha256').update(JSON.stringify(task)).digest('hex');
  const cached = taskCache.get(key);
  if (cached) return { ...cached, fromCache: true };
  const result = runAnalysisTask(task);
  if (taskCache.size >= 3) taskCache.delete(taskCache.keys().next().value!);
  taskCache.set(key, result);
  return { ...result, fromCache: false };
}

export async function computeAnalysis(body: unknown, ownerId?: string) {
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
        ...(ownerId !== undefined && { ownerId }),
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
    return { cache: 'HIT', cacheKey, result: {
      ...cachedResult,
      fromCache: true,
      computeTimeMs: 0,
    } };
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
  saveComputeCache(cacheKey, resultPayload).catch(() => console.warn('Compute cache write failed.'));

  return { cache: 'MISS', cacheKey, result: {
    ...resultPayload,
    fromCache: false,
    computeTimeMs,
  } };
}
