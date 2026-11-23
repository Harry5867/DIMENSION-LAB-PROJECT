import type { ObjectId } from 'mongodb';
import { atlasDatabase, type AtlasProfile, type AtlasSession, type AtlasUser } from '../database/atlas';

export interface PasswordUser extends AtlasProfile {
  passwordHash: string;
  verifiedEmail?: boolean;
  linkedGoogle?: boolean;
}

export interface EmailEnrollment {
  _id: string;
  digest: string;
  email: string;
  passwordHash: string;
  expiresAt: Date;
  attempts: number;
}

export interface GoogleAttempt {
  _id: string;
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: Date;
}

const googleUsers = () => atlasDatabase().collection<AtlasUser>('users');
const passwordUsers = () => atlasDatabase().collection<PasswordUser>('password_users');
const enrollments = () => atlasDatabase().collection<EmailEnrollment>('email_enrollments');
const googleAttempts = () => atlasDatabase().collection<GoogleAttempt>('oauth_attempts');
const sessions = () => atlasDatabase().collection<AtlasSession>('sessions');

export function findPasswordUser(email: string, verifiedOnly = false) {
  return passwordUsers().findOne({ email, ...(verifiedOnly && { verifiedEmail: true }) });
}

export function insertPasswordUser(user: PasswordUser) {
  return passwordUsers().insertOne(user);
}

export function findGoogleUser(id: ObjectId) {
  return googleUsers().findOne({ _id: id });
}

export function findGoogleUsersByEmail(email: string) {
  return googleUsers().find({ email }).collation({ locale: 'en', strength: 2 }).limit(2).toArray();
}

export function updateGoogleProfile(sub: string, fields: Pick<AtlasUser, 'email' | 'displayName' | 'lastLoginAt'>,
  onInsert?: Pick<AtlasUser, 'role' | 'createdAt'> & { _id?: ObjectId }) {
  return googleUsers().findOneAndUpdate({ googleSub: sub },
    { $set: fields, ...(onInsert && { $setOnInsert: onInsert }) },
    { returnDocument: 'after', ...(onInsert && { upsert: true }) });
}

export function insertEnrollment(attempt: EmailEnrollment) { return enrollments().insertOne(attempt); }
export function deleteEnrollment(id: string) { return enrollments().deleteOne({ _id: id }); }
export function consumeEnrollment(id: string, digest: string, now: Date) {
  return enrollments().findOneAndDelete({ _id: id, expiresAt: { $gt: now }, attempts: { $lt: 5 }, digest });
}
export function recordEnrollmentFailure(id: string, digest: string, now: Date) {
  return enrollments().updateOne({ _id: id, expiresAt: { $gt: now }, attempts: { $lt: 5 }, digest: { $ne: digest } },
    { $inc: { attempts: 1 } });
}

export function insertGoogleAttempt(attempt: GoogleAttempt) { return googleAttempts().insertOne(attempt); }
export function consumeGoogleAttempt(id: string, state: string, now: Date) {
  return googleAttempts().findOneAndDelete({ _id: id, state, expiresAt: { $gt: now } });
}

export function insertSession(session: AtlasSession) { return sessions().insertOne(session); }
export function findActiveSession(tokenHash: string, now: Date) {
  return sessions().findOne({ tokenHash, expiresAt: { $gt: now } });
}
export function deleteSession(tokenHash: string) { return sessions().deleteOne({ tokenHash }); }
export function findSessionProfile(session: AtlasSession) {
  const collection = session.provider === 'password' ? passwordUsers() : googleUsers();
  return collection.findOne({ _id: session.userId }, { projection: { email: 1, displayName: 1, role: 1 } });
}
