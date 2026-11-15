import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { MongoServerError, ObjectId } from 'mongodb';
import * as argon2 from 'argon2';
import { atlasDatabase, atlasMode, type AtlasProfile } from '../database/atlas';
import { AppError, BadRequestError, UnauthorizedError } from '../http/errors';

interface PasswordUser extends AtlasProfile {
  passwordHash: string;
}

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

function credentials(req: Request, action: 'login' | 'register') {
  // Limit expensive password operations across keys as well as per client.
  limit(action + ':global', 60);
  limit(action + ':ip:' + req.ip, action === 'register' ? 5 : 20);
  const { email, password } = req.body ?? {};
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    || typeof password !== 'string' || [...password].length < 12 || Buffer.byteLength(password) > 512) {
    if (action === 'login') throw new UnauthorizedError('Invalid email or password.');
    throw new BadRequestError('Enter a valid email and a password of at least 12 characters and at most 512 bytes.');
  }
  if (action === 'login') limit('login:email:' + normalized, 10);
  return { email: normalized, password };
}

export async function registerPasswordUser(req: Request) {
  if (!passwordRegistrationEnabled()) throw new AppError('Registration is unavailable.', 403, 'REGISTRATION_DISABLED');
  const { email, password } = credentials(req, 'register');
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
  if (!displayName || displayName.length > 80) throw new BadRequestError('Enter a display name of up to 80 characters.');

  const users = atlasDatabase().collection<PasswordUser>('password_users');
  const passwordHash = await argon2.hash(password, hashOptions);
  try {
    await users.insertOne({ _id: new ObjectId(), email, displayName, passwordHash, role: 'researcher', createdAt: new Date() });
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    throw new AppError('This email cannot be registered.', 409, 'EMAIL_UNAVAILABLE');
  }
}

export async function verifyPasswordUser(req: Request) {
  const { email, password } = credentials(req, 'login');
  const user = await atlasDatabase().collection<PasswordUser>('password_users').findOne({ email });
  if (!user) {
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
