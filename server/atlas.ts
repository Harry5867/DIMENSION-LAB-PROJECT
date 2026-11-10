import 'dotenv/config';
import { MongoClient, type Db, type ObjectId } from 'mongodb';
import { AppError } from './errors';

export const atlasMode = process.env.LAB_STORAGE_MODE === 'atlas';
let database: Db | undefined;

export function storageUnavailable() {
  return new AppError('Persistent storage is unavailable. Please try again later.', 503, 'STORAGE_UNAVAILABLE');
}

export function atlasDatabase() {
  if (!database) throw storageUnavailable();
  return database;
}

export async function connectAtlas() {
  const uri = process.env.MONGODB_URI, name = process.env.MONGODB_DB;
  if (!uri || !name) return;
  let client: MongoClient | undefined;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000, timeoutMS: 12000, writeConcern: { w: 'majority' } });
    await client.connect();
    const db = client.db(name);
    await db.command({ ping: 1 });
    await Promise.all([
      db.collection('users').createIndex({ googleSub: 1 }, { unique: true }),
      db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection('oauth_attempts').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection('datasets').createIndex({ id: 1 }, { unique: true }),
      db.collection('datasets').createIndex({ ownerId: 1, createdAt: -1, id: 1 }),
      db.collection('dataset_versions').createIndex({ datasetId: 1, version: 1 }, { unique: true }),
      db.collection('experiments').createIndex({ ownerId: 1, createdAt: -1 }),
      db.collection('compute_cache').createIndex({ cacheKey: 1 }, { unique: true }),
      db.collection('compute_cache').createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 }),
    ]);
    database = db;
  } catch {
    await client?.close().catch(() => {});
    console.warn('Atlas initialization failed. Persistent operations will return 503 until a successful restart.');
  }
}

export interface AtlasUser {
  _id: ObjectId;
  googleSub: string;
  email: string;
  displayName: string;
  role: 'researcher';
  createdAt: Date;
  lastLoginAt: Date;
}

export interface AtlasSession {
  tokenHash: string;
  userId: ObjectId;
  expiresAt: Date;
}
