import { parseCSVString } from '@dimension-lab/algorithms/dataParser';
import type { DatasetDocument, DatasetRow, DatasetUsage } from '@dimension-lab/contracts';
import { fetchWithTimeout, jsonRequest, readApiData, requestApi } from '../../shared/api/network';
import { isDatasetDocument, isDatasetRow, isDatasetSummary, isRecord } from '../../shared/api/typeGuards';

const datasetPath = (id: string) => '/api/datasets/' + encodeURIComponent(id);

export async function getDatasetUsage(): Promise<DatasetUsage> {
  const data = await requestApi('/api/datasets/usage');
  if (!isRecord(data)) throw new Error('The server returned invalid storage usage.');
  const { fileCount, usedBytes, maxFiles, maxBytes } = data;
  if (typeof fileCount !== 'number' || typeof usedBytes !== 'number' || typeof maxFiles !== 'number' || typeof maxBytes !== 'number'
    || ![fileCount, usedBytes, maxFiles, maxBytes].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('The server returned invalid storage usage.');
  }
  return { fileCount, usedBytes, maxFiles, maxBytes };
}

export async function listDatasets(offset: number) {
  const response = await fetchWithTimeout('/api/datasets?offset=' + offset);
  const data = await readApiData(response, 'Could not load the dataset list');
  if (!Array.isArray(data) || !data.every(isDatasetSummary)) throw new Error('The server returned an invalid dataset list.');
  const next = Number(response.headers.get('X-Next-Offset'));
  return { items: data, nextOffset: Number.isSafeInteger(next) && next > offset ? next : null };
}

function datasetDocument(data: unknown): DatasetDocument {
  if (!isDatasetDocument(data)) throw new Error('The server returned an invalid dataset.');
  return data;
}

export async function getDataset(id: string) {
  return datasetDocument(await requestApi(datasetPath(id)));
}

export async function uploadDataset(file: File) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetchWithTimeout('/api/datasets/upload', { method: 'POST', body: form });
  return datasetDocument(await readApiData(response, 'The server rejected the CSV'));
}

export async function renameDataset(id: string, name: string) {
  return requestApi(datasetPath(id), jsonRequest('PATCH', { name }));
}

export async function deleteDataset(id: string) {
  return requestApi(datasetPath(id), { method: 'DELETE' });
}

export async function readSample(assetPath: string, name: string) {
  const response = await fetchWithTimeout(import.meta.env.BASE_URL + assetPath);
  if (!response.ok) throw new Error('Could not load the sample dataset.');
  return parseCSVString(await response.text(), name);
}

export async function previewDataset(id: string): Promise<DatasetRow[]> {
  const data = await requestApi(datasetPath(id) + '/preview');
  const rows = isRecord(data) ? data.rows : undefined;
  if (!Array.isArray(rows) || !rows.every(isDatasetRow)) throw new Error('The server returned an invalid dataset preview.');
  return rows;
}

export async function downloadDataset(id: string, sampleAsset?: string) {
  const url = sampleAsset ? import.meta.env.BASE_URL + sampleAsset : datasetPath(id) + '/download';
  const response = await fetchWithTimeout(url);
  if (!response.ok) await readApiData(response, 'Could not download the dataset');
  return response.blob();
}
