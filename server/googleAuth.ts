import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import * as oidc from 'openid-client';
import { atlasDatabase, atlasMode, type AtlasSession, type AtlasUser } from './atlas';
import { AppError, ForbiddenError } from './errors';

const callbackPath = '/api/auth/google/callback';
const sessionCookie = 'lab_session';
const attemptCookie = 'lab_google_attempt';
const sessionLifetime = 8 * 60 * 60 * 1000;
const attemptLifetime = 10 * 60 * 1000;
const token = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const readCookie = (req: Request, name: string) => req.headers.cookie?.split(';').map(part => part.trim())
  .find(part => part.startsWith(name + '='))?.slice(name.length + 1);

function redirectUri() {
  try {
    const uri = new URL(process.env.GOOGLE_REDIRECT_URI ?? '');
    if (uri.username || uri.password || uri.search || uri.hash || uri.pathname !== callbackPath) return;
    if (uri.protocol === 'https:' || (uri.protocol === 'http:' && uri.hostname === 'localhost'
      && process.env.NODE_ENV !== 'production')) return uri;
  } catch { /* Invalid configuration. */ }
}

export const googleEnabled = () => Boolean(atlasMode && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && redirectUri());
const cookieOptions = (path: string) => ({ path, httpOnly: true, secure: redirectUri()?.protocol === 'https:', sameSite: 'lax' as const });

export function protectCookieWrite(req: Request) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    && (!redirectUri() || req.headers.origin !== redirectUri()?.origin)) {
    throw new ForbiddenError('This request must come from the application origin.');
  }
}

interface Attempt {
  _id: string;
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: Date;
}

let configuration: Promise<oidc.Configuration> | undefined;
function googleConfiguration() {
  configuration ??= oidc.discovery(new URL('https://accounts.google.com'), process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!, undefined, { execute: [oidc.enableNonRepudiationChecks] })
    .catch(() => {
      configuration = undefined;
      throw new AppError('Google sign-in is temporarily unavailable.', 503, 'GOOGLE_UNAVAILABLE');
    });
  return configuration;
}

export async function beginGoogleSignIn(_req: Request, res: Response) {
  if (!googleEnabled()) throw new AppError('Google sign-in is not configured.', 503, 'GOOGLE_UNAVAILABLE');
  const db = atlasDatabase();
  const config = await googleConfiguration();
  const key = token(), state = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  await db.collection<Attempt>('oauth_attempts').insertOne({ _id: hash(key), state, nonce, verifier, expiresAt: new Date(Date.now() + attemptLifetime) });
  res.cookie(attemptCookie, key, { ...cookieOptions(callbackPath), maxAge: attemptLifetime });
  res.redirect(oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri()!.href, scope: 'openid email profile', state, nonce,
    code_challenge: challenge, code_challenge_method: 'S256',
  }).href);
}

export async function upsertGoogleUser(profile: { sub: string; email: string; displayName: string }) {
  const users = atlasDatabase().collection<AtlasUser>('users');
  const now = new Date();
  const filter = { googleSub: profile.sub };
  const update = { $set: { email: profile.email, displayName: profile.displayName, lastLoginAt: now },
    $setOnInsert: { role: 'researcher' as const, createdAt: now } };
  try {
    return await users.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' });
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    return users.findOneAndUpdate(filter, update, { returnDocument: 'after' });
  }
}

export async function finishGoogleSignIn(req: Request, res: Response) {
  if (!googleEnabled()) throw new AppError('Google sign-in is not configured.', 503, 'GOOGLE_UNAVAILABLE');
  const db = atlasDatabase(), uri = redirectUri()!;
  const key = readCookie(req, attemptCookie);
  const callback = new URL(uri);
  callback.search = req.originalUrl.split('?').slice(1).join('?');
  const state = callback.searchParams.get('state');
  res.clearCookie(attemptCookie, cookieOptions(callbackPath));
  const attempt = key && state && await db.collection<Attempt>('oauth_attempts').findOneAndDelete({
    _id: hash(key), state, expiresAt: { $gt: new Date() },
  });
  const failed = () => res.redirect(303, new URL('/?auth=google-error', uri).href);
  if (!attempt) return failed();
  const config = await googleConfiguration();
  const claims = await oidc.authorizationCodeGrant(config, callback, {
    pkceCodeVerifier: attempt.verifier, expectedState: attempt.state, expectedNonce: attempt.nonce,
  }).then(result => result.claims(), () => undefined);
  if (!claims?.sub || typeof claims.email !== 'string' || claims.email_verified !== true) return failed();
  const user = await upsertGoogleUser({ sub: claims.sub, email: claims.email,
    displayName: typeof claims.name === 'string' ? claims.name : claims.email });
  if (!user) throw new AppError('Could not save the user profile.', 503, 'STORAGE_UNAVAILABLE');
  await revokeGoogleSession(req, res);
  const secret = token();
  await db.collection<AtlasSession>('sessions').insertOne({
    tokenHash: hash(secret), userId: user._id, expiresAt: new Date(Date.now() + sessionLifetime),
  });
  res.cookie(sessionCookie, secret, { ...cookieOptions('/api'), maxAge: sessionLifetime });
  res.redirect(303, new URL('/#/overview', uri).href);
}

export async function googleSessionUser(req: Request) {
  const secret = readCookie(req, sessionCookie);
  if (!secret || !/^[\w-]{43}$/.test(secret)) return null;
  const db = atlasDatabase();
  const session = await db.collection<AtlasSession>('sessions').findOne({
    tokenHash: hash(secret), expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const user = await db.collection<AtlasUser>('users').findOne({ _id: session.userId });
  return user && { id: user._id.toHexString(), username: user.email, name: user.displayName, role: user.role };
}

export async function revokeGoogleSession(req: Request, res: Response) {
  const secret = readCookie(req, sessionCookie);
  if (secret && /^[\w-]{43}$/.test(secret)) {
    await atlasDatabase().collection<AtlasSession>('sessions').deleteOne({ tokenHash: hash(secret) });
  }
  res.clearCookie(sessionCookie, cookieOptions('/api'));
}
