import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import * as oidc from 'openid-client';
import { atlasDatabase, atlasMode, type AtlasProfile } from '../database/atlas';
import { consumeGoogleAttempt, deleteSession, findActiveSession, findGoogleUser, findPasswordUser, findSessionProfile, insertGoogleAttempt, insertSession, updateGoogleProfile } from '../repositories/auth';
import { AppError, ForbiddenError } from '../http/errors';
import { mayAccessAccount } from './accountAccess';

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
    if (uri.username || uri.password || uri.search || uri.hash || uri.pathname !== callbackPath) return undefined;
    if (uri.protocol === 'https:' || (uri.protocol === 'http:' && uri.hostname === 'localhost'
      && process.env.NODE_ENV !== 'production')) return uri;
  } catch { /* Invalid configuration. */ }
  return undefined;
}

export const googleEnabled = () => Boolean(atlasMode && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && redirectUri());
function applicationOrigin() {
  const configured = process.env.LAB_ALLOWED_ORIGIN;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.origin === configured && (url.protocol === 'https:'
        || (url.protocol === 'http:' && process.env.NODE_ENV !== 'production'))) return url.origin;
    } catch { /* Ignore invalid origins. */ }
  }
  return redirectUri()?.origin ?? (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000');
}

const cookieOptions = (path: string) => ({ path, httpOnly: true, secure: applicationOrigin()?.startsWith('https:') ?? false, sameSite: 'lax' as const });

export function protectCookieWrite(req: Request) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    && (!applicationOrigin() || req.headers.origin !== applicationOrigin())) {
    throw new ForbiddenError('This request must come from the application origin.');
  }
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
  atlasDatabase();
  const config = await googleConfiguration();
  const key = token(), state = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  await insertGoogleAttempt({ _id: hash(key), state, nonce, verifier, expiresAt: new Date(Date.now() + attemptLifetime) });
  res.cookie(attemptCookie, key, { ...cookieOptions(callbackPath), maxAge: attemptLifetime });
  res.redirect(oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri()!.href, scope: 'openid email profile', state, nonce,
    code_challenge: challenge, code_challenge_method: 'S256',
  }).href);
}

export async function upsertGoogleUser(profile: { sub: string; email: string; displayName: string; authoritativeEmail?: boolean }) {
  const now = new Date();
  const fields = { email: profile.email, displayName: profile.displayName, lastLoginAt: now };
  const previous = await updateGoogleProfile(profile.sub, fields);
  if (previous) return previous;
  const verified = profile.authoritativeEmail && await findPasswordUser(profile.email.trim().toLowerCase(), true);
  const owner = verified && !await findGoogleUser(verified._id) ? verified : undefined;
  const onInsert = { ...(owner && { _id: owner._id }), role: 'researcher' as const, createdAt: now };
  try {
    return await updateGoogleProfile(profile.sub, fields, onInsert);
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    return updateGoogleProfile(profile.sub, fields);
  }
}

export async function finishGoogleSignIn(req: Request, res: Response) {
  if (!googleEnabled()) throw new AppError('Google sign-in is not configured.', 503, 'GOOGLE_UNAVAILABLE');
  atlasDatabase();
  const uri = redirectUri()!;
  const key = readCookie(req, attemptCookie);
  const callback = new URL(uri);
  callback.search = req.originalUrl.split('?').slice(1).join('?');
  const state = callback.searchParams.get('state');
  res.clearCookie(attemptCookie, cookieOptions(callbackPath));
  const attempt = key && state && await consumeGoogleAttempt(hash(key), state, new Date());
  const failed = () => res.redirect(303, new URL('/?auth=google-error', uri).href);
  if (!attempt) return failed();
  const config = await googleConfiguration();
  const claims = await oidc.authorizationCodeGrant(config, callback, {
    pkceCodeVerifier: attempt.verifier, expectedState: attempt.state, expectedNonce: attempt.nonce,
  }).then(result => result.claims(), () => undefined);
  if (!claims?.sub || typeof claims.email !== 'string' || claims.email_verified !== true || !mayAccessAccount(claims.email)) return failed();
  const user = await upsertGoogleUser({ sub: claims.sub, email: claims.email,
    authoritativeEmail: claims.email.toLowerCase().endsWith('@gmail.com') || typeof claims.hd === 'string',
    displayName: typeof claims.name === 'string' ? claims.name : claims.email });
  if (!user) throw new AppError('Could not save the user profile.', 503, 'STORAGE_UNAVAILABLE');
  await issueAtlasSession(req, res, user);
  res.redirect(303, new URL('/?auth=google-success#/overview', uri).href);
}

export async function issueAtlasSession(req: Request, res: Response, user: AtlasProfile, provider?: 'password') {
  const secret = token();
  await insertSession({
    tokenHash: hash(secret), userId: user._id, expiresAt: new Date(Date.now() + sessionLifetime), ...(provider && { provider }),
  });
  await deleteAtlasSession(req);
  res.cookie(sessionCookie, secret, { ...cookieOptions('/api'), maxAge: sessionLifetime });
}

export async function atlasSessionUser(req: Request) {
  const secret = readCookie(req, sessionCookie);
  if (!secret || !/^[\w-]{43}$/.test(secret)) return null;
  const session = await findActiveSession(hash(secret), new Date());
  if (!session) return null;
  const user = await findSessionProfile(session);
  return user && mayAccessAccount(user.email)
    ? { id: user._id.toHexString(), username: user.email, name: user.displayName, role: user.role }
    : null;
}

async function deleteAtlasSession(req: Request) {
  const secret = readCookie(req, sessionCookie);
  if (secret && /^[\w-]{43}$/.test(secret)) {
    await deleteSession(hash(secret));
  }
}

export async function revokeAtlasSession(req: Request, res: Response) {
  await deleteAtlasSession(req);
  res.clearCookie(sessionCookie, cookieOptions('/api'));
}
