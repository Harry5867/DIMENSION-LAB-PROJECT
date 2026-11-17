import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { GridFSBucket, MongoClient, MongoServerError, ObjectId } from 'mongodb';
import { isRecord } from '../../backend/src/http/validation';

type MockDocument = Record<string, unknown>;

test('Atlas storage isolates owners, retains original bytes, and never acknowledges a failed publication', async t => {
  process.env.LAB_STORAGE_MODE = 'atlas';
  process.env.MONGODB_DB = 'dimension_lab_test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
  const collections = new Map<string, MockDocument[]>();
  const blobs = new Map<string, Buffer>();
  const indexes: Array<[string, object, unknown]> = [];
  let failCollection = '';
  const documents = (name: string): MockDocument[] => {
    if (!collections.has(name)) collections.set(name, []);
    return collections.get(name)!;
  };
  const matches = (doc: MockDocument, filter: Record<string, unknown>) => Object.entries(filter).every(([key, expected]) => {
    if (isRecord(expected) && expected.$exists !== undefined) return (doc[key] !== undefined) === expected.$exists;
    if (isRecord(expected) && expected.$type) return doc[key] instanceof ObjectId;
    if (isRecord(expected) && expected.$gt) return Number(doc[key]) > Number(expected.$gt);
    return String(doc[key]) === String(expected);
  });
  const database = { command: async () => ({ ok: 1 }), collection: (name: string) => ({
    createIndex: async (fields: object, options: unknown) => { indexes.push([name, fields, options]); },
    find: (filter: Record<string, unknown>) => {
      let rows = documents(name).filter(doc => matches(doc, filter));
      const cursor = { sort: () => cursor, skip: (offset: number) => { rows = rows.slice(offset); return cursor; },
        limit: (limit: number) => { rows = rows.slice(0, limit); return cursor; }, toArray: async () => rows };
      return cursor;
    },
    findOne: async (filter: Record<string, unknown>) => documents(name).find(doc => matches(doc, filter)) ?? null,
    findOneAndUpdate: async (filter: Record<string, unknown>, update: Record<string, unknown>, options?: { upsert?: boolean }) => {
      const setOnInsert = isRecord(update.$setOnInsert) ? update.$setOnInsert : {};
      const set = isRecord(update.$set) ? update.$set : {};
      let doc = documents(name).find(doc => matches(doc, filter));
      if (!doc && options?.upsert) {
        doc = { _id: new ObjectId(), ...filter, ...setOnInsert };
        documents(name).push(doc);
      }
      return doc ? Object.assign(doc, set) : null;
    },
    findOneAndDelete: async (filter: Record<string, unknown>) => {
      const index = documents(name).findIndex(doc => matches(doc, filter));
      return index < 0 ? null : documents(name).splice(index, 1)[0];
    },
    insertOne: async (doc: MockDocument) => {
      if (failCollection === name) throw new MongoServerError({ message: 'simulated storage failure' });
      if (name === 'password_users' && documents(name).some(user => user.email === doc.email)) {
        throw new MongoServerError({ message: 'duplicate password account', code: 11000 });
      }
      documents(name).push(doc);
      return { insertedId: doc._id instanceof ObjectId ? doc._id : new ObjectId() };
    },
    deleteOne: async (filter: Record<string, unknown>) => {
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
  assert.ok(indexes.some(([name, fields, options]) => name === 'users' && 'googleSub' in fields
    && (isRecord(options) ? options.unique : false)));
  assert.ok(indexes.some(([name, fields, options]) => name === 'password_users' && 'email' in fields && (options as { unique?: boolean }).unique));
  assert.ok(indexes.some(([name, fields, options]) => name === 'sessions' && 'expiresAt' in fields
    && (isRecord(options) ? options.expireAfterSeconds : undefined) === 0));

  await t.test('password accounts use Atlas sessions and can only access their own datasets', async () => {
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
  const cookie = { headers: { cookie: 'lab_session=' + secret } } as Parameters<typeof auth.atlasSessionUser>[0];
  assert.equal((await auth.atlasSessionUser(cookie))?.id, String(user!._id));
  session.expiresAt = new Date(0);
  assert.equal(await auth.atlasSessionUser(cookie), null);
  session.expiresAt = new Date(Date.now() + 5000);
  await auth.revokeAtlasSession(cookie, { clearCookie() {} } as Parameters<typeof auth.revokeAtlasSession>[1]);
  assert.equal(await auth.atlasSessionUser(cookie), null);
  assert.throws(() => auth.protectCookieWrite({ method: 'POST', headers: { origin: 'https://elsewhere.test' } } as Parameters<typeof auth.protectCookieWrite>[0]), /application origin/);
  assert.doesNotThrow(() => auth.protectCookieWrite({ method: 'POST', headers: { origin: 'http://localhost:3000' } } as Parameters<typeof auth.protectCookieWrite>[0]));
  let rejectedCallback = '';
  await auth.finishGoogleSignIn({ originalUrl: '/api/auth/google/callback?code=fake&state=bad', headers: {} } as Parameters<typeof auth.finishGoogleSignIn>[0],
    { clearCookie() {}, redirect(_status: number, url: string) { rejectedCallback = url; } } as Parameters<typeof auth.finishGoogleSignIn>[1]);
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
  await auth.beginGoogleSignIn({} as Parameters<typeof auth.beginGoogleSignIn>[0], {
    cookie(_name: string, key: string, options: { httpOnly: boolean }) { assert.equal(options.httpOnly, true); attemptKey = key; },
    redirect(url: string) { authorizationUrl = url; },
  } as Parameters<typeof auth.beginGoogleSignIn>[1]);
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
  await auth.finishGoogleSignIn(callback as Parameters<typeof auth.finishGoogleSignIn>[0], reply as Parameters<typeof auth.finishGoogleSignIn>[1]);
  assert.match(completedRedirect, /#\/overview/);
  assert.equal((await auth.atlasSessionUser({ headers: { cookie: 'lab_session=' + sessionKey } } as Parameters<typeof auth.atlasSessionUser>[0]))?.id, String(user!._id));
  assert.equal(documents('users').length, 2);
  await auth.finishGoogleSignIn(callback as Parameters<typeof auth.finishGoogleSignIn>[0], reply as Parameters<typeof auth.finishGoogleSignIn>[1]);
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
  await connectAtlas();
  assert.equal((await datasets.listOwnedDatasets(a, 0, 50))[0].id, data.id);
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
  assert.equal(await datasets.openOwnedFile(data.id, a), null);
});
