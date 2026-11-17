import * as argon2 from 'argon2';
import { MongoServerError, ObjectId } from 'mongodb';
import type { UserRole } from '../auth/auth';
import { atlasDatabase, atlasMode } from '../database/atlas';
import { AppError, BadRequestError, NotFoundError } from '../http/errors';

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  provider: 'google' | 'password' | 'demo';
  createdAt: string;
}

function atlasRequired(): never {
  throw new AppError('Persistent user management requires Atlas storage mode.', 501, 'USER_MANAGEMENT_UNAVAILABLE');
}

export async function listManagedUsers(offset: number, limit: number): Promise<ManagedUser[]> {
  if (!atlasMode) return atlasRequired();
  const db = atlasDatabase();
  const [googleUsers, passwordUsers] = await Promise.all([
    db.collection('users').find({}, { projection: { email: 1, displayName: 1, role: 1, createdAt: 1 } })
      .sort({ createdAt: -1 }).limit(offset + limit).toArray(),
    db.collection('password_users').find({}, { projection: { email: 1, displayName: 1, role: 1, createdAt: 1 } })
      .sort({ createdAt: -1 }).limit(offset + limit).toArray(),
  ]);
  return [
    ...googleUsers.map(user => ({ id: user._id.toString(), email: String(user.email), name: String(user.displayName),
      role: user.role as UserRole, provider: 'google' as const, createdAt: new Date(user.createdAt as Date).toISOString() })),
    ...passwordUsers.map(user => ({ id: user._id.toString(), email: String(user.email), name: String(user.displayName),
      role: user.role as UserRole, provider: 'password' as const, createdAt: new Date(user.createdAt as Date).toISOString() })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(offset, offset + limit);
}

export async function getManagedUser(id: string): Promise<ManagedUser | null> {
  if (!atlasMode) return null;
  if (!ObjectId.isValid(id)) return null;
  const objectId = new ObjectId(id);
  const db = atlasDatabase();
  for (const [collection, provider] of [['password_users', 'password'], ['users', 'google']] as const) {
    const user = await db.collection(collection).findOne({ _id: objectId }, {
      projection: { email: 1, displayName: 1, role: 1, createdAt: 1 },
    });
    if (user) return { id, email: String(user.email), name: String(user.displayName), role: user.role as UserRole,
      provider, createdAt: new Date(user.createdAt as Date).toISOString() };
  }
  return null;
}

export async function createManagedUser(value: unknown): Promise<ManagedUser> {
  if (!atlasMode) return atlasRequired();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BadRequestError('Invalid user data.');
  const input = value as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const password = input.password;
  const role = input.role ?? 'researcher';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || !name || name.length > 80 || typeof password !== 'string'
    || [...password].length < 12 || Buffer.byteLength(password) > 512
    || (role !== 'admin' && role !== 'researcher' && role !== 'viewer')) {
    throw new BadRequestError('Provide a valid email, name, role, and password of 12–512 characters.');
  }
  const db = atlasDatabase();
  const emailExists = await Promise.all([
    db.collection('users').findOne({ email }, { projection: { _id: 1 } }),
    db.collection('password_users').findOne({ email }, { projection: { _id: 1 } }),
  ]);
  if (emailExists.some(Boolean)) throw new AppError('This email is already in use.', 409, 'EMAIL_UNAVAILABLE');
  const createdAt = new Date();
  let inserted;
  try {
    inserted = await db.collection('password_users').insertOne({
      email,
      displayName: name,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      role,
      createdAt,
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new AppError('This email is already in use.', 409, 'EMAIL_UNAVAILABLE');
    }
    throw error;
  }
  return { id: inserted.insertedId.toString(), email, name, role, provider: 'password', createdAt: createdAt.toISOString() };
}

export async function updateManagedUser(id: string, value: unknown): Promise<ManagedUser> {
  if (!atlasMode) return atlasRequired();
  if (!ObjectId.isValid(id)) throw new NotFoundError('User');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BadRequestError('Invalid user update.');
  const input = value as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) {
      throw new BadRequestError('User name must contain 1–80 characters.');
    }
    update.displayName = input.name.trim();
  }
  if (input.role !== undefined) {
    if (input.role !== 'admin' && input.role !== 'researcher' && input.role !== 'viewer') {
      throw new BadRequestError('Unknown user role.');
    }
    update.role = input.role;
  }
  if (!Object.keys(update).length) throw new BadRequestError('Provide a name or role to update.');

  const objectId = new ObjectId(id);
  const db = atlasDatabase();
  for (const [collection, provider] of [['password_users', 'password'], ['users', 'google']] as const) {
    if (update.role !== undefined && update.role !== 'admin') {
      const current = await db.collection(collection).findOne({ _id: objectId }, { projection: { role: 1 } });
      if (current?.role === 'admin') {
        const [googleAdmins, passwordAdmins] = await Promise.all([
          db.collection('users').countDocuments({ role: 'admin' }),
          db.collection('password_users').countDocuments({ role: 'admin' }),
        ]);
        if (googleAdmins + passwordAdmins <= 1) throw new AppError('The last administrator cannot be demoted.', 409, 'LAST_ADMIN');
      }
    }
    const result = await db.collection(collection).updateOne({ _id: objectId }, { $set: update });
    if (result.matchedCount) {
      const user = await db.collection(collection).findOne({ _id: objectId }, {
        projection: { email: 1, displayName: 1, role: 1, createdAt: 1 },
      });
      if (user) return { id, email: String(user.email), name: String(user.displayName), role: user.role as UserRole,
        provider, createdAt: new Date(user.createdAt as Date).toISOString() };
    }
  }
  throw new NotFoundError('User');
}

export async function deleteManagedUser(id: string, actorId: string) {
  if (!atlasMode) return atlasRequired();
  if (!ObjectId.isValid(id)) throw new NotFoundError('User');
  if (id === actorId) throw new AppError('You cannot delete your own account.', 409, 'SELF_DELETE_FORBIDDEN');
  const objectId = new ObjectId(id);
  const db = atlasDatabase();
  const user = await getManagedUser(id);
  if (!user) throw new NotFoundError('User');
  if (user.role === 'admin') {
    const [googleAdmins, passwordAdmins] = await Promise.all([
      db.collection('users').countDocuments({ role: 'admin' }),
      db.collection('password_users').countDocuments({ role: 'admin' }),
    ]);
    if (googleAdmins + passwordAdmins <= 1) throw new AppError('The last administrator cannot be deleted.', 409, 'LAST_ADMIN');
  }
  const results = await Promise.all([
    db.collection('users').deleteOne({ _id: objectId }),
    db.collection('password_users').deleteOne({ _id: objectId }),
  ]);
  if (!results.some(result => result.deletedCount)) throw new NotFoundError('User');
  await db.collection('sessions').deleteMany({ userId: objectId });
  return true;
}
