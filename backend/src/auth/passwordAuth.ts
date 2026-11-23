import { createHash, randomBytes, randomInt } from 'node:crypto';
import { MongoServerError, ObjectId } from 'mongodb';
import * as argon2 from 'argon2';
import { atlasMode } from '../database/atlas';
import { consumeEnrollment, deleteEnrollment, findGoogleUsersByEmail, findPasswordUser, insertEnrollment, insertPasswordUser, recordEnrollmentFailure, type PasswordUser } from '../repositories/auth';
import { AppError, BadRequestError, UnauthorizedError } from '../http/errors';
import { isRecord } from '../http/validation';
import { requireAllowedAccount } from './accountAccess';

export const passwordRegistrationEnabled = () => atlasMode && process.env.NODE_ENV !== 'production';
const hashOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
let dummyHash: Promise<string> | undefined;
const windowMs = 60_000;
const attempts = new Map<string, { count: number; expiresAt: number }>();

function limit(key: string, max: number) {
  const now = Date.now();
  for (const [id, entry] of attempts) {
    if (entry.expiresAt <= now) attempts.delete(id);
  }
  const current = attempts.get(key);
  if ((current && current.count >= max) || (!current && attempts.size >= 2048)) {
    throw new AppError('Too many requests. Try again shortly.', 429, 'RATE_LIMITED');
  }
  if (current) current.count++;
  else attempts.set(key, { count: 1, expiresAt: now + windowMs });
}

function credentials(body: unknown, ip: string | undefined, action: 'login' | 'register') {
  // Limit expensive password operations across keys as well as per client.
  limit(action + ':global', 60);
  limit(action + ':ip:' + ip, action === 'register' ? 5 : 20);
  const { email, password } = isRecord(body) ? body : {};
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    || typeof password !== 'string' || [...password].length < 12 || Buffer.byteLength(password) > 512) {
    if (action === 'login') throw new UnauthorizedError('Invalid email or password.');
    throw new BadRequestError('Enter a valid email and a password of at least 12 characters and at most 512 bytes.');
  }
  if (action === 'login') limit('login:email:' + normalized, 10);
  requireAllowedAccount(normalized);
  return { email: normalized, password };
}

export async function registerPasswordUser(body: unknown, ip: string | undefined) {
  if (!passwordRegistrationEnabled()) throw new AppError('Registration is unavailable.', 403, 'REGISTRATION_DISABLED');
  const { email, password } = credentials(body, ip, 'register');
  const name = isRecord(body) ? body.displayName : undefined;
  const displayName = typeof name === 'string' ? name.trim() : '';
  if (!displayName || displayName.length > 80) throw new BadRequestError('Enter a display name of up to 80 characters.');

  const passwordHash = await argon2.hash(password, hashOptions);
  try {
    await insertPasswordUser({ _id: new ObjectId(), email, displayName, passwordHash, role: 'researcher', createdAt: new Date() });
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    throw new AppError('This email cannot be registered.', 409, 'EMAIL_UNAVAILABLE');
  }
}

export async function verifyPasswordUser(body: unknown, ip: string | undefined, allowEnrollment = false) {
  const { email, password } = credentials(body, ip, 'login');
  const user = await findPasswordUser(email);
  if (!user) {
    if (allowEnrollment) return beginEnrollment(email, password);
    dummyHash ??= argon2.hash(randomBytes(32), hashOptions).catch(error => {
      dummyHash = undefined;
      throw error;
    });
    await argon2.verify(await dummyHash, password);
    throw new UnauthorizedError('Invalid email or password.');
  }
  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) throw new UnauthorizedError('Invalid email or password.');
  return user;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
async function beginEnrollment(email: string, password: string) {
  if (!process.env.RESEND_API_KEY || !process.env.LAB_EMAIL_FROM) {
    throw new AppError('Email verification is unavailable.', 503, 'EMAIL_UNAVAILABLE');
  }
  limit('mail:' + email, 1);
  limit('mail:global', 30);
  const challenge = randomBytes(32).toString('base64url');
  const code = randomInt(1_000_000).toString().padStart(6, '0');
  const _id = digest(challenge);
  await insertEnrollment({ _id, digest: digest(challenge + code), email,
    passwordHash: await argon2.hash(password, hashOptions), expiresAt: new Date(Date.now() + 600_000), attempts: 0 });
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.LAB_EMAIL_FROM, to: [email], subject: 'Verify your Dimension Lab email',
        text: `Your Dimension Lab verification code is ${code}. It expires in 10 minutes. Enter it only in the sign-in you started. If you did not request it, ignore this email.` }),
    });
    if (!response.ok) throw new Error('Delivery failed');
  } catch {
    await deleteEnrollment(_id);
    throw new AppError('Email verification is unavailable.', 503, 'EMAIL_UNAVAILABLE');
  }
  return { challenge };
}

export async function finishEnrollment(body: unknown, ip: string | undefined): Promise<PasswordUser> {
  const { challenge, code } = isRecord(body) ? body : {};
  if (!atlasMode || typeof challenge !== 'string' || !/^[\w-]{43}$/.test(challenge)
    || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new BadRequestError('Invalid verification request.');
  limit('verify:ip:' + ip, 25);
  const _id = digest(challenge);
  const now = new Date();
  const hash = digest(challenge + code);
  const attempt = await consumeEnrollment(_id, hash, now);
  if (!attempt) {
    await recordEnrollmentFailure(_id, hash, now);
    throw new UnauthorizedError('Invalid or expired verification code.');
  }
  requireAllowedAccount(attempt.email);
  const matches = await findGoogleUsersByEmail(attempt.email);
  if (matches.length > 1) throw new AppError('Use Google to sign in to this account.', 409, 'AMBIGUOUS_ACCOUNT');
  const existing = matches[0];
  const user: PasswordUser = { _id: existing?._id ?? new ObjectId(), displayName: existing?.displayName ?? attempt.email,
    email: attempt.email, role: 'researcher', createdAt: new Date(), passwordHash: attempt.passwordHash,
    verifiedEmail: true, linkedGoogle: Boolean(existing) };
  try {
    await insertPasswordUser(user);
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    throw new AppError('Sign in again with your password.', 409, 'ALREADY_ENROLLED');
  }
  return user;
}
