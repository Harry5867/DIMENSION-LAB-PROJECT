import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { validateFullName, validateStrongPassword } from './auth-policy.js';

const scrypt = promisify(scryptCallback);

function policyError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function normalizeLocalEmail(email) {
  if (typeof email !== 'string' || email.trim().length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw policyError('Enter a valid email address.');
  }
  return email.trim().toLowerCase();
}

export async function createLocalAccount({ email, name, password }, timings = null) {
  const normalizedEmail = normalizeLocalEmail(email);
  const fullName = validateFullName(name);
  validateStrongPassword(password);
  const passwordSalt = randomBytes(16).toString('hex');
  const hashStarted = performance.now();
  const passwordHash = (await scrypt(password, passwordSalt, 64)).toString('hex');
  if (timings) timings.passwordHashMs = performance.now() - hashStarted;
  return {
    id: randomUUID(),
    email: normalizedEmail,
    name: fullName,
    role: 'owner',
    status: 'active',
    authMode: 'local',
    emailVerified: false,
    passwordSalt,
    passwordHash,
    createdAt: new Date(),
  };
}

export async function verifyLocalPassword(user, password) {
  if (!user || typeof password !== 'string' || password.length > 256
      || typeof user.passwordSalt !== 'string'
      || typeof user.passwordHash !== 'string'
      || !/^[\da-f]{128}$/i.test(user.passwordHash)) return false;
  const candidate = await scrypt(password, user.passwordSalt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
