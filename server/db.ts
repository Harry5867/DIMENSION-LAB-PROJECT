import { MongoClient, Db, Document } from 'mongodb';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { DEMO_PASSWORD } from '../src/utils/demoSession';
import {
  ComputeResult,
  DatasetDocument,
  DatasetRow,
  DatasetSummary,
  ExperimentRecord,
  JsonValue,
  SystemHealth,
} from '../src/types';
import { parseCSVString } from '../src/utils/dataParser';

interface StoredDataset extends Document, DatasetDocument {}

interface StoredExperiment extends Document {
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

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cancer_explorer';
const DB_NAME = 'cancer_explorer';

let db: Db | null = null;
export let isMongoConnected = false;

// In-Memory fallback store if remote MongoDB is unreachable
const memoryStore = {
  datasets: new Map<string, DatasetDocument>(),
  experiments: [] as ExperimentRecord[],
  computeCache: new Map<string, { result: ComputeResult; createdAt: number }>(),
};

export async function initDatabase(): Promise<void> {
  // Public demo credentials must never grant access to persistent records.
  if (!process.env.LAB_AUTH_PASSWORD || process.env.LAB_AUTH_PASSWORD === DEMO_PASSWORD) {
    await seedInitialDatasetMemory();
    return;
  }
  let candidate: MongoClient | undefined;
  try {
    candidate = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 4000,
    });

    await candidate.connect();
    const database = candidate.db(DB_NAME);
    await database.collection('datasets').createIndex({ id: 1 }, { unique: true });
    await database.collection('experiments').createIndex({ createdAt: -1 });
    await database.collection('compute_cache').createIndex({ cacheKey: 1 }, { unique: true });
    await database.collection('compute_cache').createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 });
    await seedInitialDataset(database);
    db = database;
    isMongoConnected = true;
  } catch {
    await candidate?.close().catch(() => {});
    // Keep the same storage mode for the lifetime of this process.
    console.warn('MongoDB is unavailable. Using in-memory storage until restart.');
    await seedInitialDatasetMemory();
  }
}

// 1. DATASET OPERATIONS
export async function getAllDatasets(): Promise<DatasetSummary[]> {
  let list: Array<{
    id: string;
    name: string;
    filename: string;
    totalRows: number;
    features?: string[];
    labelColumn: string | null;
    idColumn: string | null;
    createdAt: string;
  }> = [];

  if (db) {
    list = await db.collection<StoredDataset>('datasets').find({}, { projection: { rawRows: 0 } }).toArray();
  } else {
    list = Array.from(memoryStore.datasets.values()).map(item => ({
      id: item.id,
      name: item.name,
      filename: item.filename,
      totalRows: item.totalRows,
      features: item.features,
      labelColumn: item.labelColumn,
      idColumn: item.idColumn,
      createdAt: item.createdAt,
    }));
  }

  const summaries: DatasetSummary[] = list.map(item => {
    const isPreloaded = item.id === 'cancer_wdbc' || item.id === 'wholesale_customers';
    return {
      id: item.id,
      name: item.name,
      filename: item.filename,
      total_rows: item.totalRows,
      features_count: item.features?.length || 0,
      label_column: item.labelColumn,
      id_column: item.idColumn,
      created_at: item.createdAt,
      is_preloaded: isPreloaded,
    };
  });

  // Sort logically: Preloaded files first (Cancer, then Wholesale), then user uploaded newest first
  summaries.sort((a, b) => {
    if (a.is_preloaded && !b.is_preloaded) return -1;
    if (!a.is_preloaded && b.is_preloaded) return 1;
    if (a.is_preloaded && b.is_preloaded) {
      if (a.id === 'cancer_wdbc') return -1;
      return 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return summaries;
}

export async function getDatasetById(id: string): Promise<DatasetDocument | null> {
  if (!db) return memoryStore.datasets.get(id) ?? null;
  return db.collection<DatasetDocument>('datasets').findOne({ id }, { projection: { _id: 0 } });
}

export async function saveDataset(dataset: DatasetDocument): Promise<void> {
  const doc = {
    id: dataset.id,
    name: dataset.name,
    filename: dataset.filename,
    totalRows: dataset.totalRows,
    features: dataset.features,
    labelColumn: dataset.labelColumn,
    idColumn: dataset.idColumn,
    rawRows: dataset.rawRows,
    createdAt: dataset.createdAt || new Date().toISOString(),
  };

  if (db) await db.collection<StoredDataset>('datasets').insertOne(doc);
  else memoryStore.datasets.set(dataset.id, doc);
}

export async function updateDataset(id: string, name: string): Promise<DatasetDocument | null> {
  if (db) {
    return db.collection<DatasetDocument>('datasets').findOneAndUpdate(
      { id }, { $set: { name } }, { returnDocument: 'after', projection: { _id: 0 } },
    );
  }
  const current = memoryStore.datasets.get(id);
  if (!current) return null;
  const updated = { ...current, name };
  memoryStore.datasets.set(id, updated);
  return updated;
}

export async function deleteDataset(id: string): Promise<boolean> {
  if (db) {
    const result = await db.collection('datasets').deleteOne({ id });
    return result.deletedCount > 0;
  }
  return memoryStore.datasets.delete(id);
}

// 2. EXPERIMENT OPERATIONS
export async function getAllExperiments(): Promise<ExperimentRecord[]> {
  if (db) {
    const list = await db.collection<StoredExperiment>('experiments').find({}).sort({ createdAt: -1 }).limit(50).toArray();
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

export async function saveExperiment(experiment: NewExperiment): Promise<string> {
  const doc = {
    ...experiment,
    createdAt: new Date().toISOString(),
  };
  if (db) {
    const result = await db.collection<StoredExperiment>('experiments').insertOne(doc);
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

// 3. SEED INITIAL DATA
async function seedInitialDataset(database: Db) {
  const cancerCsvPath = findDatasetFilePath('data.csv');
  if (fs.existsSync(cancerCsvPath)) {
    const count = await database.collection('datasets').countDocuments({ id: 'cancer_wdbc' });
    if (count === 0) {
      const csvContent = fs.readFileSync(cancerCsvPath, 'utf-8');
      const parsed = parseCSVString(csvContent, 'Wisconsin Breast Cancer');
      const rows: DatasetRow[] = parsed.rawRows;

      const initialDataset: StoredDataset = {
        id: 'cancer_wdbc',
        name: 'Wisconsin Breast Cancer',
        filename: 'data.csv',
        totalRows: rows.length,
        features: parsed.featureColumns,
        labelColumn: parsed.labelColumn,
        idColumn: parsed.idColumn,
        rawRows: rows,
        createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      };

      await database.collection<StoredDataset>('datasets').insertOne(initialDataset);
    }
  }

  const wholesaleCsvPath = findDatasetFilePath('wholesale.csv');
  if (fs.existsSync(wholesaleCsvPath)) {
    const count = await database.collection('datasets').countDocuments({ id: 'wholesale_customers' });
    if (count === 0) {
      const csvContent = fs.readFileSync(wholesaleCsvPath, 'utf-8');
      const parsed = parseCSVString(csvContent, 'Wholesale Customers');
      const rows: DatasetRow[] = parsed.rawRows;

      const wholesaleDataset: StoredDataset = {
        id: 'wholesale_customers',
        name: 'Wholesale Customers',
        filename: 'wholesale.csv',
        totalRows: rows.length,
        features: parsed.featureColumns,
        labelColumn: parsed.labelColumn,
        idColumn: parsed.idColumn,
        rawRows: rows,
        createdAt: new Date('2024-01-02T00:00:00.000Z').toISOString(),
      };

      await database.collection<StoredDataset>('datasets').insertOne(wholesaleDataset);
    }
  }
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
  if (db) {
    try {
      await db.command({ ping: 1 });
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
    message: 'Using in-memory storage. Restart the server to reconnect to MongoDB.',
  };
}

// 3. HIGH-SPEED RESULT CACHING (LRU + MONGODB)
export async function getComputeCache(cacheKey: string): Promise<ComputeResult | null> {
  // 1. Check in-memory LRU store (sub-millisecond O(1) hit)
  if (memoryStore.computeCache.has(cacheKey)) {
    return memoryStore.computeCache.get(cacheKey)!.result;
  }

  // 2. Check MongoDB collection
  if (isMongoConnected && db) {
    try {
      const doc = await db.collection<{ cacheKey: string; result: ComputeResult }>('compute_cache').findOne({ cacheKey });
      if (doc?.result) {
        // Hydrate in-memory store for subsequent instant hits
        memoryStore.computeCache.set(cacheKey, { result: doc.result, createdAt: Date.now() });
        return doc.result;
      }
    } catch (e) {
      console.warn('Lỗi đọc cache MongoDB:', e);
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
  if (isMongoConnected && db) {
    try {
      await db.collection('compute_cache').updateOne(
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
    } catch (e) {
      console.warn('Lỗi lưu cache MongoDB:', e);
    }
  }
}

export async function clearComputeCache(): Promise<number> {
  const count = memoryStore.computeCache.size;
  memoryStore.computeCache.clear();
  let deletedMongo = 0;
  if (isMongoConnected && db) {
    try {
      const res = await db.collection('compute_cache').deleteMany({});
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

  if (isMongoConnected && db) {
    try {
      const start = Date.now();
      await db.command({ ping: 1 });
      mongoLatencyMs = Date.now() - start;
      const countDatasets = await db.collection('datasets').countDocuments();
      const countExperiments = await db.collection('experiments').countDocuments();
      const countCache = await db.collection('compute_cache').countDocuments();
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
      engine: isMongoConnected ? 'MongoDB Atlas (Cloud)' : 'In-Memory Store (Active)',
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
