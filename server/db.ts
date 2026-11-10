import { ObjectId, type Document } from 'mongodb';
import { atlasDatabase, atlasMode, connectAtlas } from './atlas';
import { summarizeDataset } from './atlasDatasets';
import path from 'path';
import fs from 'fs';
import {
  ComputeResult,
  DatasetDocument,
  DatasetRow,
  ExperimentRecord,
  JsonValue,
  SystemHealth,
} from '../src/types';
import { parseCSVString } from '../src/utils/dataParser';

interface StoredExperiment extends Document {
  ownerId?: ObjectId;
  datasetId: string;
  datasetName: string;
  reductionMethod: string;
  clusteringMethod: string;
  k: number;
  silhouetteScore: number | null;
  ari: number | null;
  params: { [key: string]: JsonValue };
  createdAt: string;
}

export let isMongoConnected = false;
const memoryStore = {
  datasets: new Map<string, DatasetDocument>(),
  files: new Map<string, Buffer>(),
  experiments: [] as ExperimentRecord[],
  computeCache: new Map<string, { result: ComputeResult; createdAt: number }>(),
};

export async function initDatabase() {
  await seedInitialDatasetMemory();
  if (!atlasMode) return;
  await connectAtlas();
  try { atlasDatabase(); isMongoConnected = true; } catch { /* Health and private routes return 503. */ }
}

export function isSampleDataset(id: string) {
  return id === 'cancer_wdbc' || id === 'wholesale_customers';
}

export function listDemoDatasets() {
  return [...memoryStore.datasets.values()]
    .filter(dataset => !atlasMode || isSampleDataset(dataset.id))
    .map(dataset => summarizeDataset(dataset, isSampleDataset(dataset.id)))
    .sort((a, b) => Number(b.is_preloaded) - Number(a.is_preloaded)
      || (a.is_preloaded ? a.id.localeCompare(b.id) : b.created_at.localeCompare(a.created_at)));
}

export function getDemoDataset(id: string) {
  return memoryStore.datasets.get(id) ?? null;
}

export function getDemoFile(id: string) {
  const sample = isSampleDataset(id) && getDemoDataset(id);
  return sample ? fs.createReadStream(findDatasetFilePath(sample.filename)) : memoryStore.files.get(id);
}

export function saveDemoDataset(dataset: DatasetDocument, content: Buffer) {
  memoryStore.datasets.set(dataset.id, dataset);
  memoryStore.files.set(dataset.id, content);
}

export function renameDemoDataset(id: string, name: string) {
  const current = getDemoDataset(id);
  if (!current) return null;
  const updated = { ...current, name };
  memoryStore.datasets.set(id, updated);
  return updated;
}

export function deleteDemoDataset(id: string) {
  memoryStore.files.delete(id);
  return memoryStore.datasets.delete(id);
}

// 2. EXPERIMENT OPERATIONS
export async function getAllExperiments(ownerId: string): Promise<ExperimentRecord[]> {
  if (atlasMode) {
    const list = await atlasDatabase().collection<StoredExperiment>('experiments').find({ ownerId: new ObjectId(ownerId) }).sort({ createdAt: -1 }).limit(50).toArray();
    return list.map(item => ({
      id: item._id?.toString() || item.id,
      dataset_id: item.datasetId,
      dataset_name: item.datasetName,
      reduction_method: item.reductionMethod,
      clustering_method: item.clusteringMethod,
      k: item.k,
      silhouette_score: item.silhouetteScore,
      ari: item.ari,
      params: item.params,
      created_at: item.createdAt,
    }));
  }
  return memoryStore.experiments.slice(-50).reverse();
}

export interface NewExperiment {
  datasetId: string;
  datasetName: string;
  reductionMethod: string;
  clusteringMethod: string;
  k: number;
  silhouetteScore: number | null;
  ari: number | null;
  params: { [key: string]: JsonValue };
}

export async function saveExperiment(experiment: NewExperiment, ownerId: string): Promise<string> {
  const doc = {
    ...experiment,
    createdAt: new Date().toISOString(),
  };
  if (atlasMode) {
    const result = await atlasDatabase().collection<StoredExperiment>('experiments').insertOne({ ...doc, ownerId: new ObjectId(ownerId) });
    return result.insertedId.toString();
  }

  const localId = memoryStore.experiments.length + 1;
  memoryStore.experiments.push({
    id: localId,
    dataset_id: experiment.datasetId,
    dataset_name: experiment.datasetName,
    reduction_method: experiment.reductionMethod,
    clustering_method: experiment.clusteringMethod,
    k: experiment.k,
    silhouette_score: experiment.silhouetteScore,
    ari: experiment.ari,
    params: experiment.params,
    created_at: doc.createdAt,
  });

  return localId.toString();
}

// 3. SEED INITIAL DATA
function findDatasetFilePath(filename: string): string {
  const candidates = [
    path.resolve(process.cwd(), 'public', filename),
    path.resolve(process.cwd(), 'data', 'raw', filename),
    path.resolve(process.cwd(), 'data', filename),
    path.resolve(process.cwd(), filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

async function seedInitialDatasetMemory() {
  const cancerCsvPath = findDatasetFilePath('data.csv');
  if (fs.existsSync(cancerCsvPath)) {
    const csvContent = fs.readFileSync(cancerCsvPath, 'utf-8');
    const parsed = parseCSVString(csvContent, 'Wisconsin Breast Cancer');

    memoryStore.datasets.set('cancer_wdbc', {
      id: 'cancer_wdbc',
      name: 'Wisconsin Breast Cancer',
      filename: 'data.csv',
      totalRows: parsed.totalRows,
      features: parsed.featureColumns,
      labelColumn: parsed.labelColumn,
      idColumn: parsed.idColumn,
      rawRows: parsed.rawRows,
      createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    });
  }

  const wholesaleCsvPath = findDatasetFilePath('wholesale.csv');
  if (fs.existsSync(wholesaleCsvPath)) {
    const csvContent = fs.readFileSync(wholesaleCsvPath, 'utf-8');
    const parsed = parseCSVString(csvContent, 'Wholesale Customers');

    memoryStore.datasets.set('wholesale_customers', {
      id: 'wholesale_customers',
      name: 'Wholesale Customers',
      filename: 'wholesale.csv',
      totalRows: parsed.totalRows,
      features: parsed.featureColumns,
      labelColumn: parsed.labelColumn,
      idColumn: parsed.idColumn,
      rawRows: parsed.rawRows,
      createdAt: new Date('2024-01-02T00:00:00.000Z').toISOString(),
    });
  }
}

export async function testDbConnection(): Promise<{ connected: boolean; message: string }> {
  if (atlasMode) {
    try {
      await atlasDatabase().command({ ping: 1 });
    } catch {
      return { connected: false, message: 'MongoDB did not respond. Persistent writes may fail.' };
    }
    return {
      connected: true,
      message: 'MongoDB Atlas is connected.',
    };
  }
  return {
    connected: false,
    message: 'Demo mode uses in-memory storage.',
  };
}

// 3. HIGH-SPEED RESULT CACHING (LRU + MONGODB)
export async function getComputeCache(cacheKey: string): Promise<ComputeResult | null> {
  // 1. Check in-memory LRU store (sub-millisecond O(1) hit)
  if (memoryStore.computeCache.has(cacheKey)) {
    return memoryStore.computeCache.get(cacheKey)!.result;
  }

  // 2. Check MongoDB collection
  if (isMongoConnected) {
    try {
      const doc = await atlasDatabase().collection<{ cacheKey: string; result: ComputeResult }>('compute_cache').findOne({ cacheKey });
      if (doc?.result) {
        // Hydrate in-memory store for subsequent instant hits
        memoryStore.computeCache.set(cacheKey, { result: doc.result, createdAt: Date.now() });
        return doc.result;
      }
    } catch {
      console.warn('MongoDB cache read failed.');
    }
  }
  return null;
}

export async function saveComputeCache(cacheKey: string, result: ComputeResult): Promise<void> {
  // Cap in-memory cache to 120 entries to protect process heap
  if (memoryStore.computeCache.size > 120) {
    const oldestKey = memoryStore.computeCache.keys().next().value;
    if (oldestKey) memoryStore.computeCache.delete(oldestKey);
  }
  memoryStore.computeCache.set(cacheKey, { result, createdAt: Date.now() });

  // Persist to MongoDB for cross-session caching
  if (isMongoConnected) {
    try {
      await atlasDatabase().collection('compute_cache').updateOne(
        { cacheKey },
        {
          $set: {
            cacheKey,
            result,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch {
      console.warn('MongoDB cache write failed.');
    }
  }
}

export async function clearComputeCache(): Promise<number> {
  const count = memoryStore.computeCache.size;
  memoryStore.computeCache.clear();
  let deletedMongo = 0;
  if (isMongoConnected) {
    try {
      const res = await atlasDatabase().collection('compute_cache').deleteMany({});
      deletedMongo = res.deletedCount;
    } catch (e) {
      console.error(e);
    }
  }
  return count + deletedMongo;
}

// 4. ENTERPRISE SYSTEM HEALTH & PERFORMANCE METRICS
export async function getSystemHealth(): Promise<SystemHealth> {
  const uptimeSeconds = Math.floor(process.uptime());
  const memUsage = process.memoryUsage();

  let mongoLatencyMs: number | null = null;
  let mongoDocs = 0;

  if (isMongoConnected) {
    try {
      const start = Date.now();
      await atlasDatabase().command({ ping: 1 });
      mongoLatencyMs = Date.now() - start;
      const countDatasets = await atlasDatabase().collection('datasets').countDocuments();
      const countExperiments = await atlasDatabase().collection('experiments').countDocuments();
      const countCache = await atlasDatabase().collection('compute_cache').countDocuments();
      mongoDocs = countDatasets + countExperiments + countCache;
    } catch (e) {
      mongoLatencyMs = -1;
    }
  }

  return {
    uptime: `${Math.floor(uptimeSeconds / 60)} min ${uptimeSeconds % 60} sec`,
    memory: {
      rssMb: (memUsage.rss / 1024 / 1024).toFixed(1) + ' MB',
      heapUsedMb: (memUsage.heapUsed / 1024 / 1024).toFixed(1) + ' MB',
      heapTotalMb: (memUsage.heapTotal / 1024 / 1024).toFixed(1) + ' MB',
    },
    database: {
      engine: atlasMode ? 'MongoDB Atlas (Cloud)' : 'In-Memory Store (Active)',
      connected: isMongoConnected,
      latency: mongoLatencyMs !== null ? `${mongoLatencyMs}ms` : 'N/A',
      totalDocuments: mongoDocs,
    },
    cache: {
      memoryEntries: memoryStore.computeCache.size,
      status: 'Active (Sub-millisecond LRU)',
    },
  };
}
