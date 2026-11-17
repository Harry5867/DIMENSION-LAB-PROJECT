import 'dotenv/config';
import { MongoClient, type Db, type ObjectId } from 'mongodb';
import { AppError } from '../http/errors';
import type { UserRole } from '../auth/auth';

export const atlasMode = process.env.LAB_STORAGE_MODE === 'atlas';
let database: Db | undefined;
let client: MongoClient | undefined;

export function storageUnavailable() {
  return new AppError('Persistent storage is unavailable. Please try again later.', 503, 'STORAGE_UNAVAILABLE');
}

export function atlasDatabase() {
  if (!database) throw storageUnavailable();
  return database;
}

export function isAtlasConnected() {
  return database !== undefined;
}

export async function connectAtlas() {
  const uri = process.env.MONGODB_URI, name = process.env.MONGODB_DB;
  if (!uri || !name) {
    console.warn(JSON.stringify({ event: 'atlas_configuration_missing', message: 'Persistent storage is not configured.' }));
    return;
  }
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000, timeoutMS: 12000, writeConcern: { w: 'majority' } });
    await client.connect();
    const db = client.db(name);
    await db.command({ ping: 1 });
    await Promise.all([
      db.collection('users').createIndex({ googleSub: 1 }, { unique: true }),
      db.collection('password_users').createIndex({ email: 1 }, { unique: true }),
      db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection('oauth_attempts').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection('datasets').createIndex({ id: 1 }, { unique: true }),
      db.collection('datasets').createIndex({ ownerId: 1, createdAt: -1, id: 1 }),
      db.collection('dataset_versions').createIndex({ datasetId: 1, version: 1 }, { unique: true }),
      db.collection('experiments').createIndex({ ownerId: 1, createdAt: -1 }),
      db.collection('compute_cache').createIndex({ cacheKey: 1 }, { unique: true }),
      db.collection('compute_cache').createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 }),
      db.collection('api_jobs').createIndex({ id: 1 }, { unique: true }),
      db.collection('api_jobs').createIndex({ ownerId: 1, type: 1, createdAtDate: -1 }),
      db.collection('api_jobs').createIndex({ ownerId: 1, status: 1 }),
      db.collection('api_jobs').createIndex({ status: 1, runAt: 1, createdAtDate: 1, attempts: 1 }),
      db.collection('api_jobs').createIndex({ status: 1, leaseUntil: 1, attempts: 1 }),
      db.collection('api_jobs').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection('api_jobs').createIndex(
        { ownerId: 1, idempotencyKey: 1 },
        { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
      ),
    ]);
    database = db;
  } catch (error) {
    database = undefined;
    const failedClient = client;
    client = undefined;
    try {
      await failedClient?.close();
    } catch (closeError) {
      console.error(JSON.stringify({ event: 'atlas_cleanup_failed', errorName: closeError instanceof Error ? closeError.name : 'UnknownError' }));
    }
    console.warn(JSON.stringify({
      event: 'atlas_initialization_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message: 'Persistent operations will return 503 until storage is available.',
    }));
  }
}

export async function closeAtlas() {
  database = undefined;
  const activeClient = client;
  client = undefined;
  await activeClient?.close();
}

export interface AtlasProfile {
  _id: ObjectId;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Date;
}

export interface AtlasUser extends AtlasProfile {
  googleSub: string;
  lastLoginAt: Date;
}

export interface AtlasSession {
  tokenHash: string;
  userId: ObjectId;
  expiresAt: Date;
  provider?: 'password';
}
