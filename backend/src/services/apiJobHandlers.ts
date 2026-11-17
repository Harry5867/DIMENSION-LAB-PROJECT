import { extractFeatureMatrix, parseCSVString } from '@dimension-lab/algorithms/dataParser';
import type { DatasetDocument, NormalizationMethod } from '@dimension-lab/contracts';
import { atlasMode } from '../database/atlas';
import { isClusteringConfig, isRecord, isReductionConfig } from '../http/validation';
import { AppError, NotFoundError } from '../http/errors';
import {
  createDemoDatasetVersion,
  getDemoDatasetVersion,
  isSampleDataset,
  listDemoDatasetVersions,
} from '../repositories/db';
import {
  loadOwnedDatasetVersion,
  listOwnedDatasetVersions,
  publishOwnedDatasetVersion,
} from '../repositories/atlasDatasets';
import { computeAnalysis } from './analysis';
import { assertDatasetBusinessRules, inspectDatasetQuality } from './dataQuality';
import { evaluateAnalysisQuality, optimizeAnalysisParameters, pointDiagnostics } from './analysisInsights';
import { getApiJob, registerApiJobHandler } from './apiJobs';

async function loadVersion(id: string, version: number, ownerId: string) {
  if (atlasMode && !isSampleDataset(id)) return loadOwnedDatasetVersion(id, version, ownerId);
  return getDemoDatasetVersion(id, version)?.dataset ?? null;
}

async function listVersions(id: string, ownerId: string) {
  if (atlasMode && !isSampleDataset(id)) return listOwnedDatasetVersions(id, ownerId);
  return getDemoDatasetVersion(id, 1) ? listDemoDatasetVersions(id) : null;
}

function assertPayload(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new AppError('Job payload is invalid.', 400, 'INVALID_JOB_PAYLOAD');
}

function toCsv(headers: string[], rows: DatasetDocument['rawRows']) {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(cell).join(','), ...rows.map(row => headers.map(header => cell(row[header])).join(','))].join('\r\n');
}

function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

registerApiJobHandler('quality-check', async (payload, context) => {
  assertPayload(payload);
  const { datasetId, version } = payload;
  if (typeof datasetId !== 'string' || typeof version !== 'number') {
    throw new AppError('Quality-check job payload is invalid.', 400, 'INVALID_JOB_PAYLOAD');
  }
  const dataset = await loadVersion(datasetId, version, context.ownerId);
  if (!dataset) throw new NotFoundError('Dataset version');
  context.reportProgress(30);
  return { datasetId, version, ...inspectDatasetQuality(dataset) };
});

registerApiJobHandler('preprocessing-run', async (payload, context) => {
  assertPayload(payload);
  const { datasetId, sourceVersion, normalization, features } = payload;
  if (typeof datasetId !== 'string' || typeof sourceVersion !== 'number'
    || !Array.isArray(features) || !features.every(feature => typeof feature === 'string')
    || (normalization !== 'none' && normalization !== 'z-score' && normalization !== 'min-max')) {
    throw new AppError('Preprocessing job payload is invalid.', 400, 'INVALID_JOB_PAYLOAD');
  }
  const dataset = await loadVersion(datasetId, sourceVersion, context.ownerId);
  if (!dataset) throw new NotFoundError('Dataset version');
  const versions = await listVersions(datasetId, context.ownerId);
  const existing = versions?.find(item => isRecord(item.transformations) && item.transformations.jobId === context.id);
  if (existing) {
    return {
      datasetId,
      sourceVersion,
      outputVersion: {
        version: existing.version,
        parentVersion: existing.parentVersion ?? sourceVersion,
        createdAt: existing.createdAt,
      },
      normalization,
      imputation: 'mean',
      features,
    };
  }
  assertDatasetBusinessRules(dataset, features);
  context.reportProgress(20);
  const matrix = extractFeatureMatrix(dataset.rawRows, features, normalization as NormalizationMethod);
  const transformedRows = dataset.rawRows.map((row, index) => ({
    ...row,
    ...Object.fromEntries(features.map((feature, column) => [feature, matrix[index][column]])),
  }));
  const headers = [...new Set(transformedRows.flatMap(row => Object.keys(row)))];
  const content = Buffer.from(toCsv(headers, transformedRows), 'utf8');
  const parsed = parseCSVString(content.toString('utf8'), dataset.filename);
  const output: DatasetDocument = {
    ...dataset,
    rawRows: parsed.rawRows,
    totalRows: parsed.totalRows,
    features: parsed.featureColumns,
    createdAt: new Date().toISOString(),
  };
  context.reportProgress(70);
  const transformations = { operation: 'preprocessing', normalization, imputation: 'mean', features, jobId: context.id };
  let created: { version: number; parentVersion: number; createdAt: string };
  if (atlasMode && !isSampleDataset(datasetId)) {
    const published = await publishOwnedDatasetVersion(
      datasetId, output, content, context.ownerId, parsed.headers, transformations, sourceVersion,
    );
    if (!published) throw new NotFoundError('Dataset');
    created = published;
  } else {
    const versioned = createDemoDatasetVersion(output, content, sourceVersion, transformations);
    created = { version: versioned.version, parentVersion: versioned.parentVersion!, createdAt: versioned.createdAt };
  }
  context.reportProgress(95);
  return { datasetId, sourceVersion, outputVersion: created, normalization, imputation: 'mean', features };
});

registerApiJobHandler('analysis', async (payload, context) => {
  assertPayload(payload);
  const { datasetId, version, features, reductionConfig, clusteringConfig, isV2 } = payload;
  if (typeof datasetId !== 'string' || typeof version !== 'number'
    || !Array.isArray(features) || !features.every(feature => typeof feature === 'string')
    || !isRecord(reductionConfig) || !isRecord(clusteringConfig) || typeof isV2 !== 'boolean') {
    throw new AppError('Analysis job payload is invalid.', 400, 'INVALID_JOB_PAYLOAD');
  }
  const dataset = await loadVersion(datasetId, version, context.ownerId);
  if (!dataset) throw new NotFoundError('Dataset version');
  assertDatasetBusinessRules(dataset, features);
  const matrix = extractFeatureMatrix(dataset.rawRows, features, reductionConfig.normalization as NormalizationMethod);
  const groundTruth = dataset.labelColumn ? dataset.rawRows.map(row => row[dataset.labelColumn!]) : [];
  context.reportProgress(15);
  const computed = await computeAnalysis({ matrix, groundTruth, reductionConfig, clusteringConfig }, context.ownerId);
  context.reportProgress(90);
  const diagnostics = isV2 ? pointDiagnostics(matrix, computed.result.clusterAssignments) : undefined;
  const quality = isV2 ? evaluateAnalysisQuality(matrix, computed.result.coordinates, computed.result.clusterAssignments) : undefined;
  return {
    id: context.id,
    datasetId,
    version,
    features,
    reductionMethod: reductionConfig.method,
    clusteringMethod: clusteringConfig.method,
    result: {
      ...computed.result,
      ...(diagnostics && { pointDiagnostics: diagnostics }),
      ...(quality && { quality }),
    },
  };
});

registerApiJobHandler('optimization', async (payload, context) => {
  assertPayload(payload);
  const { datasetId, version, features, reductionConfig, clusteringConfig } = payload;
  if (typeof datasetId !== 'string' || typeof version !== 'number'
    || !Array.isArray(features) || !features.every(feature => typeof feature === 'string')
    || !isReductionConfig(reductionConfig) || !isClusteringConfig(clusteringConfig)) {
    throw new AppError('Optimization job payload is invalid.', 400, 'INVALID_JOB_PAYLOAD');
  }
  const dataset = await loadVersion(datasetId, version, context.ownerId);
  if (!dataset) throw new NotFoundError('Dataset version');
  assertDatasetBusinessRules(dataset, features);
  const matrix = extractFeatureMatrix(dataset.rawRows, features, reductionConfig.normalization as NormalizationMethod);
  return optimizeAnalysisParameters(matrix, reductionConfig, clusteringConfig, context.reportProgress);
});

registerApiJobHandler('report', async (payload, context) => {
  assertPayload(payload);
  const { analysisId, format } = payload;
  if (typeof analysisId !== 'string' || (format !== 'html' && format !== 'json')) {
    throw new AppError('Report job payload is invalid.', 400, 'INVALID_JOB_PAYLOAD');
  }
  const analysis = await getApiJob(analysisId, context.ownerId);
  if (!analysis || analysis.type !== 'analysis' || analysis.status !== 'succeeded' || !isRecord(analysis.result)) {
    throw new NotFoundError('Analysis result');
  }
  context.reportProgress(20);
  const reportData = { analysisId: analysis.id, ...analysis.result };
  const content = format === 'json' ? JSON.stringify(reportData, null, 2)
    : `<!doctype html><html lang="en"><meta charset="utf-8"><title>Dimension Lab Analysis Report</title><body><h1>Analysis report</h1><pre>${escapeHtml(JSON.stringify(reportData, null, 2))}</pre></body></html>`;
  context.reportProgress(90);
  return { format, content, createdAt: new Date().toISOString() };
});
