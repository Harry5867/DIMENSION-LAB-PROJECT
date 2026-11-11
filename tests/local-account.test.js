import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAccount, normalizeLocalEmail, verifyLocalPassword } from '../server/local-account.js';

test('local account normalizes identity and stores a salted password hash without claiming email verification', async () => {
  const account = await createLocalAccount({
    email: '  Student@Example.test ',
    name: '  Nguyễn   Thị Minh Anh  ',
    password: 'Pineapple_Orbit_7',
  });

  assert.equal(account.email, 'student@example.test');
  assert.equal(account.name, 'Nguyễn Thị Minh Anh');
  assert.equal(account.status, 'active');
  assert.equal(account.authMode, 'local');
  assert.equal(account.emailVerified, false);
  assert.equal('emailVerifiedAt' in account, false);
  assert.notEqual(account.passwordHash, 'Pineapple_Orbit_7');
  assert.equal(await verifyLocalPassword(account, 'Pineapple_Orbit_7'), true);
  assert.equal(await verifyLocalPassword(account, 'Wrong_password_42!'), false);
});

test('local account rejects invalid email, incomplete name, and weak password', async () => {
  assert.throws(() => normalizeLocalEmail('not-an-email'), /valid email address/);
  await assert.rejects(
    createLocalAccount({ email: 'user@example.test', name: 'Madonna', password: 'Pineapple_Orbit_7' }),
    /at least two name parts/,
  );
  await assert.rejects(
    createLocalAccount({ email: 'user@example.test', name: 'Example User', password: 'short' }),
    /at least 14 characters/,
  );
});

test('password verification rejects incomplete or malformed user records', async () => {
  assert.equal(await verifyLocalPassword(null, 'Pineapple_Orbit_7'), false);
  assert.equal(await verifyLocalPassword({ passwordSalt: 'salt', passwordHash: 'bad' }, 'Pineapple_Orbit_7'), false);
});
