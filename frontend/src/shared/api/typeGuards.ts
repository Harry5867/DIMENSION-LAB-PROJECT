import {
  ComputeResult,
  DataValue,
  DatasetDocument,
  DatasetSummary,
  ExperimentRecord,
  SystemHealth,
} from '@dimension-lab/contracts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDataValue(value: unknown): value is DataValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function isDatasetRow(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isDataValue);
}

export function isDatasetDocument(value: unknown): value is DatasetDocument {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.filename === 'string'
    && typeof value.totalRows === 'number'
    && Array.isArray(value.features)
    && value.features.every((feature) => typeof feature === 'string')
    && (typeof value.labelColumn === 'string' || value.labelColumn === null)
    && (typeof value.idColumn === 'string' || value.idColumn === null)
    && Array.isArray(value.rawRows)
    && value.rawRows.every(isDatasetRow)
    && typeof value.createdAt === 'string';
}

export function isDatasetSummary(value: unknown): value is DatasetSummary {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.filename === 'string'
    && typeof value.total_rows === 'number'
    && (typeof value.label_column === 'string' || value.label_column === null)
    && (typeof value.id_column === 'string' || value.id_column === null)
    && typeof value.created_at === 'string'
    && (value.features_count === undefined || typeof value.features_count === 'number')
    && (value.is_preloaded === undefined || typeof value.is_preloaded === 'boolean');
}

export function isComputeResult(value: unknown): value is ComputeResult {
  return isRecord(value)
    && Array.isArray(value.coordinates)
    && value.coordinates.every((point) => Array.isArray(point)
      && point.length === 3
      && point.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)))
    && Array.isArray(value.clusterAssignments)
    && value.clusterAssignments.every((cluster) => typeof cluster === 'number')
    && (typeof value.silhouetteScore === 'number' || value.silhouetteScore === null)
    && (typeof value.adjustedRandIndex === 'number' || value.adjustedRandIndex === null)
    && isRecord(value.clusterCounts)
    && typeof value.noiseCount === 'number'
    && (value.explainedVariance === undefined
      || (Array.isArray(value.explainedVariance)
        && value.explainedVariance.length === 3
        && value.explainedVariance.every((item) => typeof item === 'number')))
    && (value.totalExplainedVariance === undefined || typeof value.totalExplainedVariance === 'number')
    && (value.components === undefined
      || (Array.isArray(value.components)
        && value.components.every((component) => Array.isArray(component)
          && component.every((item) => typeof item === 'number'))));
}

export function isExperimentRecord(value: unknown): value is ExperimentRecord {
  return isRecord(value)
    && (typeof value.id === 'string' || typeof value.id === 'number')
    && typeof value.dataset_id === 'string'
    && typeof value.dataset_name === 'string'
    && typeof value.reduction_method === 'string'
    && typeof value.clustering_method === 'string'
    && typeof value.k === 'number'
    && (typeof value.silhouette_score === 'number' || value.silhouette_score === null)
    && (typeof value.ari === 'number' || value.ari === null)
    && isRecord(value.params)
    && typeof value.created_at === 'string';
}

export function isSystemHealth(value: unknown): value is SystemHealth {
  if (!isRecord(value) || !isRecord(value.memory) || !isRecord(value.database) || !isRecord(value.cache)) {
    return false;
  }

  return typeof value.uptime === 'string'
    && typeof value.memory.rssMb === 'string'
    && typeof value.memory.heapUsedMb === 'string'
    && typeof value.memory.heapTotalMb === 'string'
    && typeof value.database.engine === 'string'
    && typeof value.database.connected === 'boolean'
    && typeof value.database.latency === 'string'
    && typeof value.database.totalDocuments === 'number'
    && typeof value.cache.memoryEntries === 'number'
    && typeof value.cache.status === 'string';
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
