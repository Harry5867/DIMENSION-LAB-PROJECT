import type { DatasetRow, DatasetSummary, DataValue, ExperimentRecord, ParsedDataset } from '../types';
import { describeDatasetRows, isDatasetIdColumn } from './dataParser';
import { fetchWithTimeout } from './network';
import { isExperimentRecord, isRecord } from './typeGuards';

export const WORKBENCH_DATASETS_CHANGED = 'dimension-lab:workbench-datasets-changed';
export const WORKBENCH_SESSION_ENDED = 'dimension-lab:workbench-session-ended';
const PAGE_SIZE = 500;

export interface WorkbenchDataset {
  id: string;
  ownerId: string;
  name: string;
  filename: string;
  columns: string[];
  rowCount: number;
  revision: number;
  updatedAt: string;
  syncStatus: 'ready';
}

function isWorkbenchDataset(value: unknown): value is WorkbenchDataset {
  return isRecord(value) && typeof value.id === 'string' && typeof value.ownerId === 'string'
    && typeof value.name === 'string' && typeof value.filename === 'string'
    && Array.isArray(value.columns) && value.columns.every(column => typeof column === 'string')
    && typeof value.rowCount === 'number' && Number.isSafeInteger(value.rowCount) && value.rowCount >= 0
    && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0
    && typeof value.updatedAt === 'string' && value.syncStatus === 'ready';
}

function workbenchApi(path: string, options: RequestInit = {}) {
  const origin = `${window.location.protocol}//${window.location.hostname || '127.0.0.1'}:5100`;
  const headers = new Headers(options.headers);
  headers.set('X-Dimension-Lab-Client', 'database-workbench');
  return fetchWithTimeout(origin + path, { ...options, headers, credentials: 'include', cache: 'no-store' }, 5000);
}

async function workbenchData(path: string, options?: RequestInit): Promise<unknown> {
  const response = await workbenchApi(path, options);
  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 401) throw new Error('Sign in to the local account to access workbench datasets and experiments.');
  if (response.status === 409) throw new Error('The workbench account or dataset revision changed. Refresh and try again.');
  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'The local workbench is unavailable.');
  }
  return payload.data;
}

export async function getWorkbenchOwner(): Promise<string | null> {
  const response = await workbenchApi('/api/auth/me');
  if (response.status === 401) return null;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || payload.success !== true || !isRecord(payload.data)
    || !isRecord(payload.data.user) || typeof payload.data.user.id !== 'string') {
    throw new Error('The local workbench session could not be confirmed.');
  }
  return payload.data.user.id;
}

export async function listWorkbenchDatasets(ownerId: string): Promise<WorkbenchDataset[]> {
  const data = await workbenchData('/api/datasets?' + new URLSearchParams({ expectedOwnerId: ownerId }));
  if (!Array.isArray(data)) throw new Error('The local workbench returned an invalid dataset list.');
  return data.filter(isWorkbenchDataset).filter(dataset => dataset.ownerId === ownerId);
}

export function workbenchSummary(dataset: WorkbenchDataset): DatasetSummary {
  return {
    id: 'workbench:' + dataset.id, name: dataset.name, filename: dataset.filename, total_rows: dataset.rowCount,
    label_column: null, id_column: null, created_at: dataset.updatedAt, is_workbench: true,
  };
}

function analysisCell(column: string, value: unknown): DataValue {
  if (value == null) return null;
  if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') throw new Error('The workbench contains a value that the analysis cannot read.');
  if (isDatasetIdColumn(column)) return value;
  const text = value.trim();
  if (!/^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return value;
  const number = Number(text);
  return Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number)) ? number : value;
}

export function parseWorkbenchRows(dataset: WorkbenchDataset, rows: { recordId: string; values: Record<string, unknown> }[]): ParsedDataset {
  if (rows.length < 2) throw new Error('The workbench dataset needs at least two rows for analysis.');
  if (new Set(dataset.columns).size !== dataset.columns.length || dataset.columns.some(column => !column.trim())) {
    throw new Error('The workbench dataset needs unique non-empty column names for analysis.');
  }
  const rawRows: DatasetRow[] = rows.map(row => Object.fromEntries(dataset.columns.map(column => [
    column, analysisCell(column, Object.hasOwn(row.values, column) ? row.values[column] : null),
  ])));
  return {
    ...describeDatasetRows(rawRows, dataset.columns, dataset.name), id: workbenchSummary(dataset).id,
    workbench: { ownerId: dataset.ownerId, datasetId: dataset.id, revision: dataset.revision, recordIds: rows.map(row => row.recordId) },
  };
}

export async function loadWorkbenchDataset(dataset: WorkbenchDataset): Promise<ParsedDataset> {
  if (await getWorkbenchOwner() !== dataset.ownerId) throw new Error('Sign in to the local account that owns this dataset.');
  const rows: { recordId: string; values: Record<string, unknown> }[] = [];
  const recordIds = new Set<string>();
  while (rows.length < dataset.rowCount) {
    const query = new URLSearchParams({
      expectedOwnerId: dataset.ownerId, expectedRevision: String(dataset.revision), limit: String(PAGE_SIZE), after: String(rows.length - 1),
    });
    const page = await workbenchData('/api/datasets/' + encodeURIComponent(dataset.id) + '/rows?' + query);
    if (!isRecord(page) || !isRecord(page.dataset) || page.dataset.id !== dataset.id
      || page.dataset.ownerId !== dataset.ownerId || page.dataset.revision !== dataset.revision
      || !Array.isArray(page.rows) || page.rows.length === 0 || page.rows.length > dataset.rowCount - rows.length) {
      throw new Error('The workbench returned an incomplete or changed dataset. Refresh and try again.');
    }
    for (const row of page.rows) {
      if (!isRecord(row) || typeof row.recordId !== 'string' || row.rowIndex !== rows.length
        || !isRecord(row.values) || recordIds.has(row.recordId)) {
        throw new Error('The workbench returned inconsistent source row identities.');
      }
      recordIds.add(row.recordId);
      rows.push({ recordId: row.recordId, values: row.values });
    }
  }
  if (await getWorkbenchOwner() !== dataset.ownerId) throw new Error('The local workbench account changed. Select the dataset again.');
  return parseWorkbenchRows(dataset, rows);
}

export async function listWorkbenchExperiments(ownerId: string): Promise<ExperimentRecord[]> {
  const data = await workbenchData('/api/experiments?' + new URLSearchParams({ expectedOwnerId: ownerId }));
  if (!Array.isArray(data) || !data.every(record => isExperimentRecord(record) && Number.isSafeInteger(record.dataset_revision))) {
    throw new Error('The local workbench returned invalid experiment history.');
  }
  return data.map(record => ({ ...record, id: 'workbench:' + record.id, dataset_id: 'workbench:' + record.dataset_id }));
}

export async function saveWorkbenchExperiment(ownerId: string, body: object): Promise<void> {
  await workbenchData('/api/experiments?' + new URLSearchParams({ expectedOwnerId: ownerId }), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
