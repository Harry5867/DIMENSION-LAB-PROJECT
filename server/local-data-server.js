import express from 'express';
import { MongoClient } from 'mongodb';
import {
  createHash,
  randomBytes,
} from 'node:crypto';
import { createLocalAccount, verifyLocalPassword } from './local-account.js';
import { ensureLocalDatasetIndexes } from './local-dataset-repository.js';
import { installLocalDatasetRoutes } from './local-dataset-routes.js';
import { ensureLocalExperimentIndexes, installLocalExperimentRoutes } from './local-experiments.js';
import 'dotenv/config';

const app = express();
const PORT = Number(process.env.LOCAL_DATA_PORT || 5100);
const HOST = '127.0.0.1';
const DATABASE_NAME = process.env.MONGODB_DB_NAME || 'cancer_explorer';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cancer_explorer';
const SESSION_COOKIE = 'dimension_lab_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);
let mongoClient = null;
let db = null;
let mongoConnected = false;
let lastMongoConnectedAt = null;
let lastMongoWarningAt = 0;
let mongoReconnectTimer = null;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function success(res, data, status = 200) {
  res.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readCookie(req, cookieName) {
  const parts = String(req.headers.cookie || '').split(';');
  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === cookieName) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, field + ' is required and must be at most ' + maxLength + ' characters.');
  }
  return value.trim();
}

function requireSafeId(value, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) {
    throw new HttpError(400, field + ' is invalid.');
  }
  return value;
}

function setServerTiming(res, timings) {
  const labels = {
    mongoPingMs: 'mongo-ping',
    emailLookupMs: 'email-lookup',
    passwordHashMs: 'password-hash',
    userInsertMs: 'user-insert',
    userLookupMs: 'user-lookup',
    passwordCheckMs: 'password-check',
    sessionInsertMs: 'session-insert',
    registrationTotalMs: 'registration-total',
    loginTotalMs: 'login-total',
  };
  const value = Object.entries(timings)
    .filter(([, duration]) => Number.isFinite(duration))
    .map(([name, duration]) => (labels[name] || name) + ';dur=' + Math.max(0, duration).toFixed(2))
    .join(', ');
  if (value) res.setHeader('Server-Timing', value);
}

async function createSession(user, res, timings = null) {
  const token = randomBytes(32).toString('base64url');
  const sessionStarted = performance.now();
  await db.collection('sessions').insertOne({
    sessionHash: sha256(token),
    userId: user.id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
  });
  if (timings) timings.sessionInsertMs = performance.now() - sessionStarted;
  res.setHeader('Set-Cookie', cookieValue(token));
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status || 'active',
    authMode: user.authMode || 'verified-email',
    emailVerified: user.emailVerified === true,
  };
}

function cookieValue(token) {
  return SESSION_COOKIE + '=' + encodeURIComponent(token)
    + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + Math.floor(SESSION_MAX_AGE_MS / 1000);
}

function clearSessionCookie() {
  return SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    return next(new HttpError(403, 'This local API only accepts the project UI origin.'));
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Dimension-Lab-Client');
    res.setHeader('Access-Control-Expose-Headers', 'Server-Timing');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && req.get('x-dimension-lab-client') !== 'database-workbench') {
    return next(new HttpError(403, 'Missing local client request header.'));
  }
  next();
});
app.use(express.json({ limit: '4mb' }));

async function connectMongo() {
  try {
    if (!mongoConnected) {
      if (!mongoClient) {
        mongoClient = new MongoClient(MONGODB_URI, {
          appName: 'DimensionLabLocalData',
          serverSelectionTimeoutMS: 2500,
          connectTimeoutMS: 2500,
        });
      }
      await mongoClient.connect();
      db = mongoClient.db(DATABASE_NAME);
      await db.command({ ping: 1 });
      await Promise.all([
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('users').createIndex({ id: 1 }),
        db.collection('sessions').createIndex({ sessionHash: 1 }, { unique: true }),
        db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('user_datasets').createIndex({ ownerId: 1, id: 1 }, { unique: true }),
        db.collection('user_datasets').createIndex({ ownerId: 1, updatedAt: -1 }),
        db.collection('user_dataset_rows').createIndex({ ownerId: 1, datasetId: 1, recordId: 1 }, { unique: true }),
        db.collection('user_dataset_rows').createIndex({ ownerId: 1, datasetId: 1, rowIndex: 1 }),
        db.collection('dataset_conflicts').createIndex({ ownerId: 1, datasetId: 1, createdAt: -1 }),
        db.collection('dataset_conflicts').createIndex({ ownerId: 1, datasetId: 1, syncId: 1 }, { unique: true }),
        db.collection('dataset_conflict_rows').createIndex({ ownerId: 1, conflictId: 1, rowIndex: 1 }),
        ensureLocalDatasetIndexes(db),
        ensureLocalExperimentIndexes(db),
      ]);
      mongoConnected = true;
      lastMongoConnectedAt = new Date().toISOString();
      console.log('[local-data] Connected to local MongoDB database: ' + DATABASE_NAME);
    }
    return true;
  } catch (error) {
    mongoConnected = false;
    db = null;
    try { await mongoClient?.close(); } catch { /* Client may not have connected. */ }
    mongoClient = null;
    if (Date.now() - lastMongoWarningAt >= 60000) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[local-data] MongoDB unavailable; writes are paused: ' + message);
      lastMongoWarningAt = Date.now();
    }
    return false;
  }
}

function scheduleMongoReconnect() {
  if (mongoReconnectTimer) return;
  mongoReconnectTimer = setInterval(async () => {
    if (mongoConnected && db) {
      try {
        await db.command({ ping: 1 });
        return;
      } catch {
        mongoConnected = false;
        db = null;
        try { await mongoClient.close(); } catch { /* Reconnect below. */ }
      mongoClient = null;
      }
    }
    await connectMongo();
  }, 8000);
  mongoReconnectTimer.unref?.();
}

async function requireDatabase(req, _res, next) {
  if (!mongoConnected || !db) {
    return next(new HttpError(503, 'Local MongoDB is not connected. Data changes remain in this browser until it is available.'));
  }
  try {
    const started = performance.now();
    await db.command({ ping: 1 });
    req.localMongoPingMs = performance.now() - started;
    next();
  } catch {
    mongoConnected = false;
    db = null;
    next(new HttpError(503, 'Local MongoDB is not responding. Data changes remain in this browser until it is available.'));
  }
}

async function requireUser(req, res, next) {
  try {
    if (!db) throw new HttpError(503, 'Local MongoDB is not connected.');
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) throw new HttpError(401, 'Sign in before accessing synced data.');
    const session = await db.collection('sessions').findOne({
      sessionHash: sha256(token),
      expiresAt: { $gt: new Date() },
    });
    if (!session) throw new HttpError(401, 'Session expired. Sign in again; browser changes are still queued locally.');
    const user = await db.collection('users').findOne(
      { id: session.userId },
      { projection: { passwordHash: 0, passwordSalt: 0 } },
    );
    if (!user) throw new HttpError(401, 'Account no longer exists.');
    if (user.status && user.status !== 'active') throw new HttpError(403, 'Account is not active.');
    if (req.query.expectedOwnerId !== undefined && req.query.expectedOwnerId !== user.id) {
      throw new HttpError(409, 'The current account changed. Sign in again before using this dataset or experiment.');
    }
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status || 'active',
      authMode: user.authMode || 'verified-email',
      emailVerified: user.emailVerified === true,
    };
    next();
  } catch (error) {
    next(error);
  }
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  let connected = false;
  let latencyMs = null;
  if (mongoConnected && db) {
    const started = Date.now();
    try {
      await db.command({ ping: 1 });
      connected = true;
      latencyMs = Date.now() - started;
    } catch {
      mongoConnected = false;
      db = null;
    }
  }
  success(res, {
    service: 'dimension-lab-local-data',
    host: HOST,
    database: DATABASE_NAME,
    mongoConnected: connected,
    latencyMs,
    lastConnectedAt: lastMongoConnectedAt,
    writesAvailable: connected,
    registrationMode: 'local-account-no-email-verification',
  });
}));

app.use('/api', requireDatabase);

const registerLocalAccount = asyncRoute(async (req, res) => {
  const requestStarted = performance.now();
  const timings = { mongoPingMs: req.localMongoPingMs };
  const body = isPlainObject(req.body) ? req.body : {};
  const email = requireText(body.email, 'Email', 254).toLowerCase();
  const name = body.name;
  const password = body.password;
  const lookupStarted = performance.now();
  if (await db.collection('users').findOne({ email }, { projection: { _id: 1 } })) {
    throw new HttpError(409, 'An account with this email already exists.');
  }
  timings.emailLookupMs = performance.now() - lookupStarted;
  const user = await createLocalAccount({ email, name, password }, timings);
  try {
    const insertStarted = performance.now();
    await db.collection('users').insertOne(user);
    timings.userInsertMs = performance.now() - insertStarted;
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, 'An account with this email already exists.');
    throw error;
  }
  const publicUser = await createSession(user, res, timings);
  timings.registrationTotalMs = performance.now() - requestStarted;
  setServerTiming(res, timings);
  success(res, { user: publicUser }, 201);
});

app.post('/api/auth/register', registerLocalAccount);
app.post('/api/auth/register/start', registerLocalAccount);

app.post('/api/auth/register/resend', (_req, _res, next) => {
  next(new HttpError(410, 'Email verification codes are no longer used for local accounts.'));
});

app.post('/api/auth/register/verify', (_req, _res, next) => {
  next(new HttpError(410, 'Email verification codes are no longer used for local accounts.'));
});

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const requestStarted = performance.now();
  const timings = { mongoPingMs: req.localMongoPingMs };
  const body = isPlainObject(req.body) ? req.body : {};
  const email = requireText(body.email, 'Email', 254).toLowerCase();
  const password = body.password;
  if (typeof password !== 'string' || password.length > 256) throw new HttpError(401, 'Email or password is incorrect.');
  const lookupStarted = performance.now();
  const user = await db.collection('users').findOne({ email });
  timings.userLookupMs = performance.now() - lookupStarted;
  if (!user || (user.status && user.status !== 'active')
      || !(user.authMode === 'local' || user.emailVerified === true)) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  const passwordStarted = performance.now();
  if (!await verifyLocalPassword(user, password)) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  timings.passwordCheckMs = performance.now() - passwordStarted;
  const publicUser = await createSession(user, res, timings);
  timings.loginTotalMs = performance.now() - requestStarted;
  setServerTiming(res, timings);
  success(res, { user: publicUser });
}));

app.post('/api/auth/logout', requireUser, asyncRoute(async (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await db.collection('sessions').deleteOne({ sessionHash: sha256(token), userId: req.user.id });
  res.setHeader('Set-Cookie', clearSessionCookie());
  success(res, { signedOut: true });
}));

app.get('/api/auth/me', requireUser, (req, res) => success(res, { user: req.user }));

installLocalDatasetRoutes(app, {
  getDb: () => db, requireUser, asyncRoute, success, HttpError, isPlainObject, requireSafeId, requireText,
});
installLocalExperimentRoutes(app, {
  getDb: () => db, requireUser, requireSafeId, asyncRoute, success, HttpError,
});
app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const message = status === 500 ? 'Local data service failed. Check the server log.' : error.message;
  if (status === 500) console.error('[local-data] Request failed:', error);
  res.status(status).json({ success: false, error: message, timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, HOST, async () => {
  console.log('[local-data] Listening only on http://' + HOST + ':' + PORT);
  await connectMongo();
  scheduleMongoReconnect();
});

async function shutdown() {
  if (mongoReconnectTimer) clearInterval(mongoReconnectTimer);
  server.close();
  try { await mongoClient.close(); } catch { /* Ignore close errors during shutdown. */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

