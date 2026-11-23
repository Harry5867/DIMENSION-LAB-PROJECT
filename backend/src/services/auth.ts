import { DEMO_EMAIL, DEMO_PASSWORD } from '@dimension-lab/contracts/demo';
import { issueSession } from '../auth/auth';
import { verifyPasswordUser } from '../auth/passwordAuth';
import { atlasMode } from '../database/atlas';
import { BadRequestError, UnauthorizedError } from '../http/errors';
import { isRecord } from '../http/validation';

export async function signInWithPassword(body: unknown, ip: string | undefined) {
  if (atlasMode) {
    const user = await verifyPasswordUser(body, ip, isRecord(body) && body.enroll === true);
    if ('challenge' in user) return { kind: 'challenge' as const, challenge: user.challenge };
    return { kind: 'atlas' as const, user };
  }

  const { email, password, role = 'admin' } = isRecord(body) ? body : {};
  const expectedEmail = process.env.LAB_AUTH_EMAIL || DEMO_EMAIL;
  const expectedPassword = process.env.LAB_AUTH_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : DEMO_PASSWORD);
  if (!expectedPassword || typeof email !== 'string' || email.trim().toLowerCase() !== expectedEmail.toLowerCase()
    || password !== expectedPassword) throw new UnauthorizedError('Invalid email or password.');
  if (role !== 'admin' && role !== 'researcher' && role !== 'viewer') throw new BadRequestError('Unknown workspace role.');
  return { kind: 'demo' as const, ...issueSession(role) };
}
