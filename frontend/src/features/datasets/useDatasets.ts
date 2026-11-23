import { useCallback, useRef, useState } from 'react';
import { MAX_CSV_BYTES, parseCSVString } from '@dimension-lab/algorithms/dataParser';
import { getSampleDataset, sampleDatasets, type DatasetDocument, type DatasetSummary, type DatasetUsage, type ParsedDataset } from '@dimension-lab/contracts';
import { isServiceUnavailable } from '../../shared/api/network';
import { getErrorMessage } from '../../shared/api/typeGuards';
import * as api from './datasetsApi';

function fromDocument(data: DatasetDocument): ParsedDataset {
  return { id: data.id, name: data.name, totalRows: data.totalRows, headers: Object.keys(data.rawRows[0] ?? {}),
    idColumn: data.idColumn, labelColumn: data.labelColumn, featureColumns: data.features, rawRows: data.rawRows };
}

function summary(id: string, dataset: ParsedDataset, filename: string, createdAt: string): DatasetSummary {
  return { id, name: dataset.name, filename, total_rows: dataset.totalRows, features_count: dataset.featureColumns.length,
    id_column: dataset.idColumn, label_column: dataset.labelColumn, created_at: createdAt };
}

interface SessionDataset {
  dataset: ParsedDataset;
  summary: DatasetSummary;
}

export function useDatasets(persistent: boolean, onError: (message: string) => void) {
  const local = useRef(new Map<string, SessionDataset>());
  const revision = useRef(0);
  const usageRevision = useRef(0);
  const [datasetList, setDatasetList] = useState<DatasetSummary[]>([]);
  const [nextDatasetOffset, setNextDatasetOffset] = useState<number | null>(null);
  const [usage, setUsage] = useState<DatasetUsage | null>(null);

  const fetchDatasetList = useCallback(async (offset = 0) => {
    const request = ++revision.current;
    if (offset === 0 && persistent) {
      const usageRequest = ++usageRevision.current;
      void api.getDatasetUsage().then(value => {
        if (usageRequest === usageRevision.current) setUsage(value);
      }).catch(() => { if (usageRequest === usageRevision.current) setUsage(null); });
    }
    let page: Awaited<ReturnType<typeof api.listDatasets>> | undefined;
    try {
      page = await api.listDatasets(offset);
    } catch (error) {
      if (request !== revision.current) return;
      if (persistent) onError(getErrorMessage(error));
      if (offset > 0) return;
    }
    if (request !== revision.current) return;
    if (page) setNextDatasetOffset(page.nextOffset);
    const merged = new Map<string, DatasetSummary>(sampleDatasets.map(item => [item.id, item]));
    page?.items.forEach(item => merged.set(item.id, item));
    local.current.forEach(item => merged.set(item.summary.id, item.summary));
    setDatasetList(previous => offset || !page
      ? [...new Map([...previous.filter(item => !item.is_local), ...merged.values()].map(item => [item.id, item])).values()]
      : [...merged.values()]);
  }, [persistent, onError]);

  const openDataset = useCallback(async (id: string) => {
    const session = local.current.get(id);
    if (session) return session.dataset;
    try {
      return fromDocument(await api.getDataset(id));
    } catch (error) {
      const sample = getSampleDataset(id);
      if (!sample) throw error;
      return api.readSample(sample.assetPath, sample.name);
    }
  }, []);

  const importFile = async (file: File, isCurrent: () => boolean) => {
    if (file.size > MAX_CSV_BYTES) throw new Error('The CSV exceeds the 5 MiB file limit.');
    const parsed = parseCSVString(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()), file.name);
    if (!isCurrent()) return;

    let item: SessionDataset;
    try {
      const data = await api.uploadDataset(file);
      const dataset = { ...fromDocument(data), headers: parsed.headers };
      item = { dataset, summary: summary(data.id, dataset, data.filename, data.createdAt) };
    } catch (error) {
      if (persistent || !isServiceUnavailable(error)) throw error;
      if (!isCurrent()) return;
      const id = 'local_' + crypto.randomUUID();
      item = { dataset: { ...parsed, id }, summary: { ...summary(id, parsed, file.name, new Date().toISOString()), is_local: true } };
      local.current.set(id, item);
    }
    setDatasetList(previous => [
      ...previous.filter(dataset => dataset.is_preloaded),
      item.summary,
      ...previous.filter(dataset => !dataset.is_preloaded && dataset.id !== item.summary.id),
    ]);
    return item;
  };

  const renameDataset = async (id: string, name: string) => {
    const item = local.current.get(id);
    if (item) local.current.set(id, { dataset: { ...item.dataset, name }, summary: { ...item.summary, name } });
    else await api.renameDataset(id, name);
    await fetchDatasetList();
    return !item;
  };

  const removeDataset = async (id: string) => {
    const removedLocally = local.current.delete(id);
    if (!removedLocally) await api.deleteDataset(id);
    await fetchDatasetList();
    return !removedLocally;
  };

  return { datasetList, nextDatasetOffset, usage, fetchDatasetList, openDataset, importFile, renameDataset, removeDataset };
}
