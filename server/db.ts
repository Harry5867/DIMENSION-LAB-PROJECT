import { MongoClient, Db, Document } from 'mongodb';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import dns from 'dns';
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

// Fix querySrv on Windows by using Google Public DNS
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore if not supported in environment
}

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cancer_explorer';
const DB_NAME = 'cancer_explorer';

let client: MongoClient | null = null;
let db: Db | null = null;
export let isMongoConnected = false;

// In-Memory fallback store if remote MongoDB is unreachable
const memoryStore = {
  datasets: new Map<string, DatasetDocument>(),
  experiments: [] as ExperimentRecord[],
  computeCache: new Map<string, { result: ComputeResult; createdAt: number }>(),
};

export async function initDatabase(): Promise<void> {
  await tryConnectMongo();

  // Background auto-reconnect polling every 12 seconds
  setInterval(async () => {
    if (!isMongoConnected) {
      await tryConnectMongo(true);
    }
  }, 12000);
}

async function tryConnectMongo(isBackgroundRetry: boolean = false): Promise<void> {
  try {
    const maskedUri = MONGODB_URI.replace(/:([^:@]+)@/, ':****@');
    if (!isBackgroundRetry) {
      console.log(`🔌 [MongoDB] Đang kết nối tới: ${maskedUri}...`);
    }

    const testClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 4000,
    });

    await testClient.connect();
    client = testClient;
    db = client.db(DB_NAME);
    isMongoConnected = true;
    console.log(`✅ [MongoDB Atlas] Kết nối THÀNH CÔNG tới Database Cloud: ${DB_NAME}!`);

    // Create Indexes
    await db.collection('datasets').createIndex({ id: 1 }, { unique: true });
    await db.collection('experiments').createIndex({ createdAt: -1 });
    await db.collection('compute_cache').createIndex({ cacheKey: 1 }, { unique: true });
    await db.collection('compute_cache').createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 });

    // Seed initial dataset data.csv
    await seedInitialDataset(db);
  } catch (error: unknown) {
    if (!isBackgroundRetry) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️ [MongoDB] Chưa kết nối được (${message}).`);
      console.warn(`💡 [Chế độ tự hành]: Kích hoạt In-Memory Store để hệ thống chạy 100% trơn tru.`);
      await seedInitialDatasetMemory();
    }
    isMongoConnected = false;
  }
}

export function getDb(): Db | null {
  return db;
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

  if (isMongoConnected && db) {
    try {
      const mongoDocs = await db.collection<StoredDataset>('datasets').find({}, { projection: { rawRows: 0 } }).toArray();
      list = mongoDocs.map(item => ({
        id: item.id,
        name: item.name,
        filename: item.filename,
        totalRows: item.totalRows,
        features: item.features,
        labelColumn: item.labelColumn,
        idColumn: item.idColumn,
        createdAt: item.createdAt,
      }));
    } catch (e) {
      console.error(e);
    }
  }

  if (list.length === 0) {
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
  if (isMongoConnected && db) {
    try {
      const doc = await db.collection<StoredDataset>('datasets').findOne({ id });
      if (doc) {
        return {
          id: doc.id,
          name: doc.name,
          filename: doc.filename,
          totalRows: doc.totalRows,
          features: doc.features,
          labelColumn: doc.labelColumn,
          idColumn: doc.idColumn,
          rawRows: doc.rawRows,
          createdAt: doc.createdAt,
        };
      }
    } catch (e) {
      console.error(e);
    }
  }
  return memoryStore.datasets.get(id) || null;
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

  memoryStore.datasets.set(dataset.id, doc);

  if (isMongoConnected && db) {
    try {
      await db.collection<StoredDataset>('datasets').replaceOne({ id: dataset.id }, doc, { upsert: true });
    } catch (e) {
      console.error(e);
    }
  }
}

export async function updateDataset(id: string, updates: { name?: string }): Promise<DatasetDocument | null> {
  let doc = memoryStore.datasets.get(id);
  if (doc) {
    if (updates.name && updates.name.trim()) {
      doc = { ...doc, name: updates.name.trim() };
      memoryStore.datasets.set(id, doc);
    }
  }

  if (isMongoConnected && db) {
    try {
      const updateFields: Record<string, unknown> = {};
      if (updates.name && updates.name.trim()) {
        updateFields.name = updates.name.trim();
      }
      if (Object.keys(updateFields).length > 0) {
        await db.collection<StoredDataset>('datasets').updateOne({ id }, { $set: updateFields });
        const updated = await db.collection<StoredDataset>('datasets').findOne({ id });
        if (updated) {
          doc = {
            id: updated.id,
            name: updated.name,
            filename: updated.filename,
            totalRows: updated.totalRows,
            features: updated.features,
            labelColumn: updated.labelColumn,
            idColumn: updated.idColumn,
            rawRows: updated.rawRows,
            createdAt: updated.createdAt,
          };
          memoryStore.datasets.set(id, doc);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  return doc || null;
}

export async function deleteDataset(id: string): Promise<boolean> {
  const existedInMemory = memoryStore.datasets.delete(id);
  let existedInMongo = false;
  if (isMongoConnected && db) {
    try {
      const res = await db.collection('datasets').deleteOne({ id });
      existedInMongo = res.deletedCount > 0;
    } catch (e) {
      console.error(e);
    }
  }
  return existedInMemory || existedInMongo;
}

// 2. EXPERIMENT OPERATIONS
export async function getAllExperiments(): Promise<ExperimentRecord[]> {
  if (isMongoConnected && db) {
    try {
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
    } catch (e) {
      console.error(e);
    }
  }
  return [...memoryStore.experiments].reverse();
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

  if (isMongoConnected && db) {
    try {
      const res = await db.collection<StoredExperiment>('experiments').insertOne(doc);
      return res.insertedId.toString();
    } catch (e) {
      console.error(e);
    }
  }

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
  if (isMongoConnected && db) {
    return {
      connected: true,
      message: 'MongoDB Atlas is connected.',
    };
  }
  await tryConnectMongo(false);
  return {
    connected: isMongoConnected,
    message: isMongoConnected
      ? 'Reconnected to MongoDB Atlas.'
      : 'MongoDB Atlas is unavailable. Using in-memory storage.',
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
