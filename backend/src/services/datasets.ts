import { randomUUID } from 'node:crypto';
import { MAX_CSV_BYTES, parseCSVString } from '@dimension-lab/algorithms/dataParser';
import type { DatasetDocument } from '@dimension-lab/contracts';
import { atlasMode } from '../database/atlas';
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from '../http/errors';
import { isRecord } from '../http/validation';
import { deleteOwnedDataset, listOwnedDatasets, loadOwnedDataset, openOwnedFile, publishDataset, renameOwnedDataset, summarizeDataset } from '../repositories/atlasDatasets';
import { deleteDemoDataset, getDemoDataset, getDemoFile, isSampleDataset, listDemoDatasets, renameDemoDataset, saveDemoDataset } from '../repositories/db';

export async function listDatasets(ownerId: string, offset: number, limit: number) {
  const samples = listDemoDatasets();
  const items = samples.slice(offset, offset + limit + 1);
  if (atlasMode && items.length <= limit) {
    items.push(...await listOwnedDatasets(ownerId, Math.max(0, offset - samples.length), limit + 1 - items.length));
  }
  return { items: items.slice(0, limit), nextOffset: items.length > limit ? offset + limit : null };
}

export async function readDataset(id: string, ownerId: string) {
  const data = atlasMode && !isSampleDataset(id) ? await loadOwnedDataset(id, ownerId) : getDemoDataset(id);
  if (!data) throw new NotFoundError('Dataset');
  return data;
}

export async function downloadDataset(id: string, ownerId: string) {
  if (atlasMode && !isSampleDataset(id)) {
    const file = await openOwnedFile(id, ownerId);
    if (file) return { filename: file.record.filename, stream: file.stream };
  } else {
    const dataset = getDemoDataset(id);
    const stream = dataset && getDemoFile(id);
    if (dataset && stream) return { filename: dataset.filename, stream };
  }
  throw new NotFoundError('Dataset');
}

export async function importDataset(filename: string, content: Buffer, ownerId: string) {
  if (content.length > MAX_CSV_BYTES) throw new AppError('The CSV exceeds the 5 MiB file limit.', 413, 'PAYLOAD_TOO_LARGE');
  let parsed;
  try {
    parsed = parseCSVString(new TextDecoder('utf-8', { fatal: true }).decode(content), filename);
  } catch (error) {
    throw new BadRequestError(error instanceof TypeError ? 'The CSV must use UTF-8 encoding.'
      : error instanceof Error ? error.message : 'Invalid CSV file.');
  }
  const dataset: DatasetDocument = {
    id: 'dataset_' + randomUUID(),
    name: filename.replace(/\.csv$/i, ''),
    filename,
    totalRows: parsed.totalRows,
    features: parsed.featureColumns,
    labelColumn: parsed.labelColumn,
    idColumn: parsed.idColumn,
    rawRows: parsed.rawRows,
    createdAt: new Date().toISOString(),
  };
  if (atlasMode) await publishDataset(dataset, content, ownerId, parsed.headers);
  else saveDemoDataset(dataset, content);
  return dataset;
}

export async function renameDataset(id: string, ownerId: string, body: unknown) {
  const name = isRecord(body) && typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 200) throw new BadRequestError('Invalid dataset name.');
  if (isSampleDataset(id)) throw new ForbiddenError('Sample datasets are read-only.');
  if (atlasMode) {
    const updated = await renameOwnedDataset(id, ownerId, name);
    if (updated) return updated;
  } else {
    const updated = renameDemoDataset(id, name);
    if (updated) return summarizeDataset(updated);
  }
  throw new NotFoundError('Dataset');
}

export async function removeDataset(id: string, ownerId: string) {
  if (isSampleDataset(id)) throw new ForbiddenError('Sample datasets are read-only.');
  const removed = atlasMode ? await deleteOwnedDataset(id, ownerId) : deleteDemoDataset(id);
  if (!removed) throw new NotFoundError('Dataset');
}
