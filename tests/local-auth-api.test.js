import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const clientHeader = { 'content-type': 'application/json', 'x-dimension-lab-client': 'database-workbench' };

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function waitForHealth(url, child, getLogs) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Local API exited during startup: ' + getLogs());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const health = await response.json();
        if (health.data?.mongoConnected === true) return health;
      }
    } catch { /* API may still be connecting to MongoDB. */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error('Local API did not become healthy: ' + getLogs());
}

test('local account API registers and authenticates an unverified email without SMTP', { timeout: 45000 }, async (t) => {
  const mongoUri = process.env.LOCAL_SYNC_TEST_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cancer_explorer';
  const mongoHost = new URL(mongoUri).hostname.replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(mongoHost)) {
    return t.skip('Integration test only writes to a loopback MongoDB instance.');
  }

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2500, connectTimeoutMS: 2500 });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
  } catch {
    await client.close().catch(() => {});
    return t.skip('Loopback MongoDB is unavailable; local account API integration was not run.');
  }

  const databaseName = 'dimension_lab_auth_test_' + randomUUID().replaceAll('-', '');
  const port = await availablePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  let logs = '';
  const child = spawn(process.execPath, [resolve(projectRoot, 'server/local-data-server.js')], {
    cwd: projectRoot,
    env: { ...process.env, LOCAL_DATA_PORT: String(port), MONGODB_DB_NAME: databaseName, MONGODB_URI: mongoUri },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  try {
    const health = await waitForHealth(baseUrl + '/api/health', child, () => logs);
    assert.equal(health.data.mongoConnected, true);
    assert.equal(health.data.registrationMode, 'local-account-no-email-verification');

    const email = 'auth-test-' + randomUUID() + '@example.test';
    const password = 'Pineapple_Orbit_7';
    const registrationStarted = performance.now();
    const register = await fetch(baseUrl + '/api/auth/register', {
      method: 'POST', headers: clientHeader,
      body: JSON.stringify({ name: 'Local Test User', email, password }),
    });
    const registered = await register.json();
    assert.equal(register.status, 201);
    assert.equal(registered.data.user.authMode, 'local');
    assert.equal(registered.data.user.status, 'active');
    assert.equal(registered.data.user.emailVerified, false);
    assert.ok(register.headers.get('set-cookie'));
    const storedUser = await client.db(databaseName).collection('users').findOne({ email });
    assert.equal(storedUser.status, 'active');
    assert.equal(storedUser.emailVerified, false);
    assert.notEqual(storedUser.passwordHash, password);
    assert.equal(await client.db(databaseName).collection('sessions').countDocuments({ userId: storedUser.id }), 1);
    const sessionCookie = register.headers.get('set-cookie').split(';', 1)[0];
    const activeProfile = await fetch(baseUrl + '/api/auth/me', { headers: { cookie: sessionCookie } });
    assert.equal(activeProfile.status, 200);
    assert.equal((await activeProfile.json()).data.user.status, 'active');
    await client.db(databaseName).collection('users').updateOne({ id: storedUser.id }, { $set: { status: 'suspended' } });
    const suspendedProfile = await fetch(baseUrl + '/api/auth/me', { headers: { cookie: sessionCookie } });
    assert.equal(suspendedProfile.status, 403);
    await client.db(databaseName).collection('users').updateOne({ id: storedUser.id }, { $set: { status: 'active' } });
    const timing = register.headers.get('server-timing') || '';
    assert.match(timing, /password-hash;dur=/);
    assert.match(timing, /user-insert;dur=/);
    assert.match(timing, /session-insert;dur=/);
    assert.match(timing, /registration-total;dur=/);
    const parts = Object.fromEntries([...timing.matchAll(/([a-z-]+);dur=([\d.]+)/g)]
      .map((match) => [match[1], Number(match[2])]));
    t.diagnostic('Registration timing: round-trip=' + (performance.now() - registrationStarted).toFixed(2)
      + 'ms; API=' + parts['registration-total'] + 'ms; scrypt=' + parts['password-hash']
      + 'ms; Mongo user insert=' + parts['user-insert'] + 'ms; session insert=' + parts['session-insert'] + 'ms.');

    const duplicate = await fetch(baseUrl + '/api/auth/register', {
      method: 'POST', headers: clientHeader,
      body: JSON.stringify({ name: 'Local Test User', email: email.toUpperCase(), password }),
    });
    assert.equal(duplicate.status, 409);

    const login = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST', headers: clientHeader,
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).data.user.emailVerified, false);

    const wrongPassword = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST', headers: clientHeader,
      body: JSON.stringify({ email, password: 'Wrong_password_42!' }),
    });
    assert.equal(wrongPassword.status, 401);

    const noOtpRoute = await fetch(baseUrl + '/api/auth/register/verify', {
      method: 'POST', headers: clientHeader,
      body: JSON.stringify({ email, code: '123456' }),
    });
    assert.equal(noOtpRoute.status, 410);
  } finally {
    child.kill();
    await Promise.race([once(child, 'exit'), new Promise((resolveDelay) => setTimeout(resolveDelay, 3000))]);
    await client.db(databaseName).dropDatabase();
    await client.close();
  }
});
