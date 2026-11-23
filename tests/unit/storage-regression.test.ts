import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { GridFSBucket, MongoClient, MongoServerError, ObjectId } from 'mongodb';
import type { QuotaLedger, Reservation } from '../../backend/src/repositories/datasetQuota';

test('Atlas storage isolates owners, retains original bytes, and never acknowledges a failed publication', async t => {
  process.env.LAB_STORAGE_MODE = 'atlas';
  process.env.MONGODB_DB = 'dimension_lab_test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
  process.env.LAB_ALLOWED_EMAILS = '';
  process.env.LAB_DATASET_MAX_FILES = '2';
  const collections = new Map<string, any[]>();
  const blobs = new Map<string, Buffer>();
  const indexes: Array<[string, object, unknown]> = [];
  const quotas = new Map<string, QuotaLedger>();
  let failCollection = '';
  const documents = (name: string) => {
    if (!collections.has(name)) collections.set(name, []);
    return collections.get(name)!;
  };
  const matches = (doc: any, filter: any) => Object.entries(filter).every(([key, expected]: [string, any]) => {
    if (expected?.$exists !== undefined) return (doc[key] !== undefined) === expected.$exists;
    if (expected?.$type) return doc[key] instanceof ObjectId;
    if (expected?.$gt) return doc[key] > expected.$gt;
    if (expected?.$lt !== undefined) return doc[key] < expected.$lt;
    if (expected?.$ne !== undefined) return doc[key] !== expected.$ne;
    return String(doc[key]) === String(expected);
  });
  const database = { command: async () => ({ ok: 1 }), collection: (name: string) => ({
    createIndex: async (fields: object, options: unknown) => { indexes.push([name, fields, options]); },
    aggregate: ([{ $match }]: [{ $match: object }]) => ({
      toArray: async () => documents(name).filter(doc => matches(doc, $match)).map(doc => {
        const version = documents('dataset_versions').find(item => String(item._id) === String(doc.currentVersionId));
        return { id: doc.id, bytes: blobs.get(String(version?.fileId))?.length };
      }),
    }),
    find: (filter: object) => {
      let rows = documents(name).filter(doc => matches(doc, filter));
      const cursor = { sort: () => cursor, collation: () => cursor, skip: (offset: number) => { rows = rows.slice(offset); return cursor; },
        limit: (limit: number) => { rows = rows.slice(0, limit); return cursor; }, toArray: async () => rows };
      return cursor;
    },
    findOne: async (filter: { _id?: ObjectId }) => name === 'dataset_quotas'
      ? quotas.get(String(filter._id)) ?? null
      : documents(name).find(doc => matches(doc, filter)) ?? null,
    findOneAndUpdate: async (filter: object, update: any, options?: { upsert?: boolean }) => {
      let doc = documents(name).find(doc => matches(doc, filter));
      if (!doc && options?.upsert) {
        doc = { _id: new ObjectId(), ...filter, ...update.$setOnInsert };
        documents(name).push(doc);
      }
      if (doc && name === 'unsupervised_history') {
        const { $each, $position, $slice } = update.$push.runs as { $each: string[]; $position: number; $slice: number };
        const runs: string[] = doc.runs ?? [];
        runs.splice($position, 0, ...$each);
        doc.runs = runs.slice(0, $slice);
      }
      return doc ? Object.assign(doc, update.$set) : null;
    },
    findOneAndDelete: async (filter: object) => {
      const index = documents(name).findIndex(doc => matches(doc, filter));
      return index < 0 ? null : documents(name).splice(index, 1)[0];
    },
    updateOne: async (filter: { _id: ObjectId; 'items.id'?: string; $expr?: { $and: [{ $lt: [unknown, number] }, { $lte: [unknown, number] }] } }, update: {
      $inc?: { attempts: number }; $setOnInsert?: { items: Reservation[] }; $push?: { items: Reservation };
      $pull?: { items: { id: string } }; $unset?: object;
    }) => {
      if (name === 'dataset_quotas') {
        const key = String(filter._id);
        const doc = quotas.get(key);
        if (!doc && update.$setOnInsert) quotas.set(key, { _id: filter._id, items: update.$setOnInsert.items });
        if (!doc) return { modifiedCount: 0 };
        if (update.$push && filter.$expr) {
          const [files, bytes] = filter.$expr.$and;
          if (doc.items.length >= files.$lt[1] || doc.items.reduce((sum, item) => sum + item.bytes, 0) > bytes.$lte[1]) {
            return { modifiedCount: 0 };
          }
          doc.items.push(update.$push.items);
        }
        if (update.$pull) doc.items = doc.items.filter(item => item.id !== update.$pull?.items.id);
        const item = doc.items.find(entry => entry.id === filter['items.id']);
        if (item && update.$unset) {
          delete item.fileId;
          delete item.reservedAt;
        }
        return { modifiedCount: 1 };
      }
      const doc = documents(name).find(item => matches(item, filter));
      if (doc && update.$inc) doc.attempts += update.$inc.attempts;
    },
    insertOne: async (doc: any) => {
      if (failCollection === name) throw new MongoServerError({ message: 'simulated storage failure' });
      if (name === 'password_users' && documents(name).some(user => user.email === doc.email)) {
        throw new MongoServerError({ message: 'duplicate password account', code: 11000 });
      }
      documents(name).push(doc);
      return { insertedId: doc._id ?? new ObjectId() };
    },
    deleteOne: async (filter: object) => {
      const index = documents(name).findIndex(doc => matches(doc, filter));
      if (index >= 0) documents(name).splice(index, 1);
    },
  }) };
  t.mock.method(MongoClient.prototype, 'connect', async function (this: MongoClient) { return this; });
  t.mock.method(MongoClient.prototype, 'db', () => database);
  t.mock.method(GridFSBucket.prototype, 'openUploadStreamWithId', (id: ObjectId) => {
    const chunks: Buffer[] = [];
    return new Writable({ write(chunk, _encoding, done) { chunks.push(chunk); done(); },
      final(done) { blobs.set(String(id), Buffer.concat(chunks)); done(); } });
  });
  t.mock.method(GridFSBucket.prototype, 'delete', async (id: ObjectId) => { blobs.delete(String(id)); });
  t.mock.method(GridFSBucket.prototype, 'find', (filter: { _id: ObjectId }) => ({
    limit: () => ({ next: async () => blobs.has(String(filter._id)) ? {} : null }),
  }));
  t.mock.method(GridFSBucket.prototype, 'openDownloadStream', (id: ObjectId) => Readable.from([blobs.get(String(id))!]));

  const { connectAtlas } = await import('../../backend/src/database/atlas');
  const auth = await import('../../backend/src/auth/googleAuth');
  const datasets = await import('../../backend/src/repositories/atlasDatasets');
  const { saveExperiment, getAllExperiments } = await import('../../backend/src/repositories/db');
  await connectAtlas();
  assert.ok(indexes.some(([name, fields, options]) => name === 'users' && 'googleSub' in fields && (options as any).unique));
  assert.ok(indexes.some(([name, fields, options]) => name === 'password_users' && 'email' in fields && (options as { unique?: boolean }).unique));
  assert.ok(indexes.some(([name, fields, options]) => name === 'sessions' && 'expiresAt' in fields && (options as any).expireAfterSeconds === 0));

  await t.test('password accounts use Atlas sessions and can only access their own datasets', async accountTest => {
    const { createApp } = await import('../../backend/src/app');
    const server = createApp().listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const api = 'http://127.0.0.1:' + address.port + '/api';
      const origin = 'http://localhost:3000';
      const password = 'Research workspace test password';
      const first = { email: 'first@example.test', displayName: 'First', password };
      const second = { ...first, email: 'second@example.test', displayName: 'Second' };
      const post = (endpoint: string, body: object, cookie?: string, requestOrigin = origin) => fetch(api + endpoint, {
        method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
        body: JSON.stringify(body),
      });
      assert.equal((await post('/auth/register', first, undefined, 'https://elsewhere.test')).status, 403);
      assert.equal((await post('/auth/register', { ...first, role: 'admin' })).status, 201);
      assert.equal((await post('/auth/register', second)).status, 201);
      assert.equal((await post('/auth/register', { ...first, email: first.email.toUpperCase() })).status, 409);
      const stored = documents('password_users').find(user => user.email === first.email);
      assert.equal(stored.role, 'researcher');
      assert.match(stored.passwordHash, /^\$argon2id\$/);
      assert.equal(stored.password, undefined);
      assert.equal((await post('/auth/login', { ...first, password: 'Incorrect test password' })).status, 401);
      async function login(account: typeof first) {
        const result = await post('/auth/login', account);
        assert.equal(result.status, 200);
        const cookies = result.headers.getSetCookie();
        assert.equal(cookies.length, 1);
        assert.match(cookies[0], /HttpOnly/);
        return cookies[0].split(';')[0];
      }
      const firstCookie = await login(first);
      const secondCookie = await login(second);
      const me = async (cookie: string) => (await fetch(api + '/auth/me', { headers: { Cookie: cookie } })).json();
      assert.equal((await me(firstCookie)).data.user.name, first.displayName);
      assert.equal((await me(secondCookie)).data.user.name, second.displayName);
      await accountTest.test('email codes provision new accounts and preserve the owner of Google workspaces', async sub => {
        process.env.RESEND_API_KEY = 'test-mail-key';
        process.env.LAB_EMAIL_FROM = 'lab@example.test';
        const originalFetch = globalThis.fetch;
        let code = '';
        sub.mock.method(globalThis, 'fetch', (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          if (input !== 'https://api.resend.com/emails') return originalFetch(input, init);
          const mail = JSON.parse(String(init?.body)) as { text: string };
          code = /code is (\d{6})/.exec(mail.text)![1]!;
          return Promise.resolve(new Response('{}', { status: 200 }));
        });
        for (const google of [false, true]) {
          const email = google ? 'oauth@example.test' : 'manual@example.test';
          const owner = google ? await auth.upsertGoogleUser({ sub: 'enrollment-test', email, displayName: 'Google user' }) : null;
          const start = await post('/auth/login', { email, password, enroll: true });
          assert.equal(start.status, 202);
          assert.equal(start.headers.get('set-cookie'), null);
          const { challenge } = (await start.json()).data;
          const verify = (digits: string) => post('/auth/verify-email', { challenge, code: digits });
          assert.equal((await verify(code === '000000' ? '111111' : '000000')).status, 401);
          const verified = await verify(code);
          assert.equal(verified.status, 200);
          const verifiedCookie = verified.headers.getSetCookie()[0]!.split(';')[0]!;
          const account = (await me(verifiedCookie)).data.user;
          if (owner) assert.equal(account.id, String(owner._id));
          assert.equal((await verify(code)).status, 401);
          const subsequent = await login({ email, password, displayName: '' });
          assert.equal((await me(subsequent)).data.user.id, account.id);
          await post('/auth/logout', {}, verifiedCookie);
          await post('/auth/logout', {}, subsequent);
        }
        collections.set('users', documents('users').filter(user => user.googleSub !== 'enrollment-test'));
        delete process.env.RESEND_API_KEY;
        delete process.env.LAB_EMAIL_FROM;
      });
      const csv = 'a,b,c\r\n1,2,3\r\n4,5,6\r\n';
      const form = new FormData();
      form.append('file', new Blob([csv], { type: 'text/csv' }), 'password-auth-test.csv');
      const upload = await fetch(api + '/datasets/upload', { method: 'POST', body: form, headers: { Origin: origin, Cookie: firstCookie } });
      assert.equal(upload.status, 201);
      const dataset = '/datasets/' + encodeURIComponent((await upload.json()).data.id);
      const get = (path: string, cookie: string) => fetch(api + path, { headers: { Cookie: cookie } });
      assert.equal((await get(dataset + '/download', firstCookie)).status, 200);
      assert.equal((await get(dataset, secondCookie)).status, 404);
      assert.equal((await get(dataset + '/download', secondCookie)).status, 404);
      await accountTest.test('saved analysis history is private, bounded, and round-trips CSV keys', async () => {
        const path = '/unsupervised/history';
        const column = 'feature.with.dot';
        const rows = [{ [column]: 1 }, { [column]: 2 }];
        const run = {
          dataset: 'history-test',
          createdAt: new Date().toISOString(),
          task: { kind: 'anomaly', rows, features: [column], normalization: 'none',
            options: { trees: 100, sampleSize: 2, contamination: 0.05, seed: 42 } },
          result: { kind: 'anomaly', threshold: 0.5, scores: [0.4, 0.5], anomalies: [false, false] },
        };
        assert.equal((await post(path, {}, firstCookie)).status, 400);
        for (let i = 0; i < 6; i++) {
          assert.equal((await post(path, { ...run, dataset: run.dataset + '-' + i }, firstCookie)).status, 201);
        }
        const firstHistory = await get(path, firstCookie);
        assert.equal(firstHistory.status, 200);
        const saved = (await firstHistory.json()).data as typeof run[];
        assert.deepEqual(saved.map(item => item.dataset), [5, 4, 3, 2, 1].map(i => run.dataset + '-' + i));
        assert.deepEqual(saved[0]?.task.rows, rows);
        const secondHistory = await get(path, secondCookie);
        assert.equal(secondHistory.status, 200);
        assert.deepEqual((await secondHistory.json()).data, []);
      });
      assert.equal((await post('/auth/logout', {}, firstCookie)).status, 200);
      assert.equal((await me(firstCookie)).data.authenticated, false);
      assert.equal((await post('/auth/logout', {}, secondCookie)).status, 200);
    } finally {
      const closed = once(server, 'close');
      server.close();
      await closed;
      // Keep the original GridFS and session assertions independent of this flow.
      collections.delete('datasets');
      collections.delete('dataset_versions');
      blobs.clear();
    }
  });

  const profile = { sub: 'google-a', email: 'a@example.test', displayName: 'A' };
  const [user, again] = await Promise.all([auth.upsertGoogleUser(profile), auth.upsertGoogleUser(profile)]);
  const other = await auth.upsertGoogleUser({ sub: 'google-b', email: profile.email, displayName: 'B' });
  assert.equal(String(user!._id), String(again!._id));
  assert.notEqual(String(user!._id), String(other!._id));
  assert.equal(documents('users').length, 2);
  const secret = 'a'.repeat(43);
  const session = { tokenHash: createHash('sha256').update(secret).digest('hex'), userId: user!._id, expiresAt: new Date(Date.now() + 5000) };
  documents('sessions').push(session);
  const cookie = { headers: { cookie: 'lab_session=' + secret } } as any;
  assert.equal((await auth.atlasSessionUser(cookie))?.id, String(user!._id));
  session.expiresAt = new Date(0);
  assert.equal(await auth.atlasSessionUser(cookie), null);
  session.expiresAt = new Date(Date.now() + 5000);
  await auth.revokeAtlasSession(cookie, { clearCookie() {} } as any);
  assert.equal(await auth.atlasSessionUser(cookie), null);
  assert.throws(() => auth.protectCookieWrite({ method: 'POST', headers: { origin: 'https://elsewhere.test' } } as any), /application origin/);
  assert.doesNotThrow(() => auth.protectCookieWrite({ method: 'POST', headers: { origin: 'http://localhost:3000' } } as any));
  let rejectedCallback = '';
  await auth.finishGoogleSignIn({ originalUrl: '/api/auth/google/callback?code=fake&state=bad', headers: {} } as any,
    { clearCookie() {}, redirect(_status: number, url: string) { rejectedCallback = url; } } as any);
  assert.match(rejectedCallback, /auth=google-error/);
  assert.equal(documents('sessions').length, 0);

  const issuer = 'https://accounts.google.com';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let attemptNonce = '', pkceChallenge = '';
  const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url');
  t.mock.method(globalThis, 'fetch', async (input: URL | string, options?: RequestInit) => {
    switch (new URL(input).pathname) {
      case '/.well-known/openid-configuration': return Response.json({ issuer, authorization_endpoint: issuer + '/authorize',
        token_endpoint: issuer + '/token', jwks_uri: issuer + '/keys', response_types_supported: ['code'],
        token_endpoint_auth_methods_supported: ['client_secret_post'], code_challenge_methods_supported: ['S256'] });
      case '/keys': return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', use: 'sig', alg: 'RS256' }] });
      case '/token': {
        const params = new URLSearchParams(String(options?.body));
        assert.equal(params.get('redirect_uri'), process.env.GOOGLE_REDIRECT_URI);
        assert.equal(createHash('sha256').update(params.get('code_verifier')!).digest('base64url'), pkceChallenge);
        const now = Math.floor(Date.now() / 1000);
        const jwt = encode({ alg: 'RS256', kid: 'test' }) + '.' + encode({ iss: issuer, aud: 'test-client',
          sub: profile.sub, email: profile.email, email_verified: true, name: 'A', nonce: attemptNonce, iat: now, exp: now + 300 });
        return Response.json({ token_type: 'Bearer', access_token: 'fixture-token',
          id_token: jwt + '.' + sign('RSA-SHA256', Buffer.from(jwt), privateKey).toString('base64url') });
      }
      default: throw new Error('Unexpected OIDC request.');
    }
  });
  let authorizationUrl = '', attemptKey = '', sessionKey = '', completedRedirect = '';
  await auth.beginGoogleSignIn({} as any, {
    cookie(_name: string, key: string, options: { httpOnly: boolean }) { assert.equal(options.httpOnly, true); attemptKey = key; },
    redirect(url: string) { authorizationUrl = url; },
  } as any);
  const grant = new URL(authorizationUrl).searchParams;
  assert.equal(grant.get('scope'), 'openid email profile');
  assert.equal(grant.get('code_challenge_method'), 'S256');
  attemptNonce = grant.get('nonce')!;
  pkceChallenge = grant.get('code_challenge')!;
  const callback = { originalUrl: '/api/auth/google/callback?code=fixture&state=' + grant.get('state'),
    headers: { cookie: 'lab_google_attempt=' + attemptKey } };
  const reply = { clearCookie() {}, cookie(_name: string, key: string, options: { httpOnly: boolean; sameSite: string }) {
    assert.equal(options.httpOnly, true); assert.equal(options.sameSite, 'lax'); sessionKey = key;
  }, redirect(_status: number, url: string) { completedRedirect = url; } };
  await auth.finishGoogleSignIn(callback as any, reply as any);
  assert.match(completedRedirect, /#\/overview/);
  assert.equal((await auth.atlasSessionUser({ headers: { cookie: 'lab_session=' + sessionKey } } as any))?.id, String(user!._id));
  assert.equal(documents('users').length, 2);
  await auth.finishGoogleSignIn(callback as any, reply as any);
  assert.match(completedRedirect, /auth=google-error/);

  const a = String(user!._id), b = String(other!._id);
  const data = { id: 'test', name: 'CSV', filename: 'test.csv', features: ['a', 'b', 'c'],
    totalRows: 2, labelColumn: null, idColumn: null, rawRows: [{ a: 1, b: 2, c: 3 }, { a: 4, b: 5, c: 6 }],
    createdAt: new Date().toISOString() };
  const csv = Buffer.from('a,b,c\r\n1,2,3\r\n4,5,6\r\n');
  const publish = (id: string) => datasets.publishDataset({ ...data, id }, csv, a, data.features);
  failCollection = 'dataset_versions';
  await assert.rejects(publish('failed'), /simulated storage failure/);
  assert.equal(blobs.size, 0);
  assert.deepEqual(await datasets.listOwnedDatasets(a, 0, 50), []);
  failCollection = '';
  await publish(data.id);
  const { datasetUsage, reserveDataset } = await import('../../backend/src/repositories/datasetQuota');
  quotas.delete(a);
  assert.deepEqual(await datasetUsage(a), { fileCount: 1, usedBytes: csv.length, maxFiles: 2, maxBytes: 30 * 1024 * 1024 });
  await assert.rejects(reserveDataset(a, 'too-many-bytes', 30 * 1024 * 1024, new ObjectId()), { code: 'DATASET_QUOTA_EXCEEDED' });
  const concurrent = await Promise.allSettled([publish('quota-one'), publish('quota-two')]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  const denied = concurrent.find(result => result.status === 'rejected');
  assert.equal(denied?.reason?.code, 'DATASET_QUOTA_EXCEEDED');
  assert.equal((await datasetUsage(a)).fileCount, 2);
  assert.equal((await datasetUsage(b)).fileCount, 0);
  await connectAtlas();
  assert.ok((await datasets.listOwnedDatasets(a, 0, 50)).some(item => item.id === data.id));
  assert.deepEqual(await datasets.listOwnedDatasets(b, 0, 50), []);
  assert.equal(await datasets.loadOwnedDataset(data.id, b), null);
  assert.equal(await datasets.openOwnedFile(data.id, b), null);
  assert.equal(await datasets.renameOwnedDataset(data.id, b, 'denied'), null);
  assert.equal(await datasets.deleteOwnedDataset(data.id, b), false);
  assert.deepEqual((await datasets.loadOwnedDataset(data.id, a))?.rawRows, data.rawRows);
  const original = await datasets.openOwnedFile(data.id, a);
  const chunks: Buffer[] = [];
  for await (const chunk of original!.stream) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), csv);
  await saveExperiment({ datasetId: data.id, datasetName: data.name, reductionMethod: 'PCA', clusteringMethod: 'None',
    k: 2, silhouetteScore: null, ari: null, params: {} }, a);
  assert.equal((await getAllExperiments(a)).length, 1);
  assert.deepEqual(await getAllExperiments(b), []);
  assert.equal((await datasets.renameOwnedDataset(data.id, a, 'Renamed'))?.name, 'Renamed');
  assert.equal(await datasets.deleteOwnedDataset(data.id, a), true);
  assert.equal((await datasetUsage(a)).fileCount, 1);
  assert.equal(await datasets.openOwnedFile(data.id, a), null);
});
