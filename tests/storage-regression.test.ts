import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { GridFSBucket, MongoClient, MongoServerError, ObjectId } from 'mongodb';

test('Atlas storage isolates owners, retains original bytes, and never acknowledges a failed publication', async t => {
  process.env.LAB_STORAGE_MODE = 'atlas';
  process.env.MONGODB_DB = 'dimension_lab_test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
  const collections = new Map<string, any[]>();
  const blobs = new Map<string, Buffer>();
  const indexes: Array<[string, object, unknown]> = [];
  let failCollection = '';
  const documents = (name: string) => {
    if (!collections.has(name)) collections.set(name, []);
    return collections.get(name)!;
  };
  const matches = (doc: any, filter: any) => Object.entries(filter).every(([key, expected]: [string, any]) => {
    if (expected?.$exists !== undefined) return (doc[key] !== undefined) === expected.$exists;
    if (expected?.$type) return doc[key] instanceof ObjectId;
    if (expected?.$gt) return doc[key] > expected.$gt;
    return String(doc[key]) === String(expected);
  });
  const database = { command: async () => ({ ok: 1 }), collection: (name: string) => ({
    createIndex: async (fields: object, options: unknown) => { indexes.push([name, fields, options]); },
    find: (filter: object) => {
      let rows = documents(name).filter(doc => matches(doc, filter));
      const cursor = { sort: () => cursor, skip: (offset: number) => { rows = rows.slice(offset); return cursor; },
        limit: (limit: number) => { rows = rows.slice(0, limit); return cursor; }, toArray: async () => rows };
      return cursor;
    },
    findOne: async (filter: object) => documents(name).find(doc => matches(doc, filter)) ?? null,
    findOneAndUpdate: async (filter: object, update: any, options?: { upsert?: boolean }) => {
      let doc = documents(name).find(doc => matches(doc, filter));
      if (!doc && options?.upsert) {
        doc = { _id: new ObjectId(), ...filter, ...update.$setOnInsert };
        documents(name).push(doc);
      }
      return doc ? Object.assign(doc, update.$set) : null;
    },
    findOneAndDelete: async (filter: object) => {
      const index = documents(name).findIndex(doc => matches(doc, filter));
      return index < 0 ? null : documents(name).splice(index, 1)[0];
    },
    insertOne: async (doc: any) => {
      if (failCollection === name) throw new MongoServerError({ message: 'simulated storage failure' });
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

  const { connectAtlas } = await import('../server/atlas');
  const auth = await import('../server/googleAuth');
  const datasets = await import('../server/atlasDatasets');
  const { saveExperiment, getAllExperiments } = await import('../server/db');
  await connectAtlas();
  assert.ok(indexes.some(([name, fields, options]) => name === 'users' && 'googleSub' in fields && (options as any).unique));
  assert.ok(indexes.some(([name, fields, options]) => name === 'sessions' && 'expiresAt' in fields && (options as any).expireAfterSeconds === 0));
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
  assert.equal((await auth.googleSessionUser(cookie))?.id, String(user!._id));
  session.expiresAt = new Date(0);
  assert.equal(await auth.googleSessionUser(cookie), null);
  session.expiresAt = new Date(Date.now() + 5000);
  await auth.revokeGoogleSession(cookie, { clearCookie() {} } as any);
  assert.equal(await auth.googleSessionUser(cookie), null);
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
  assert.equal((await auth.googleSessionUser({ headers: { cookie: 'lab_session=' + sessionKey } } as any))?.id, String(user!._id));
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
