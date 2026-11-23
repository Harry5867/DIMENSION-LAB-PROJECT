import 'dotenv/config';
import { ForbiddenError } from '../http/errors';

const configured = process.env.LAB_ALLOWED_EMAILS?.trim();
const emails = configured ? new Set(configured.split(',').map(email => email.trim().toLowerCase())) : null;
if (emails && [...emails].some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
  throw new Error('LAB_ALLOWED_EMAILS must contain a comma-separated list of email addresses.');
}

export function mayAccessAccount(email: string) {
  return emails === null || emails.has(email.trim().toLowerCase());
}

export function requireAllowedAccount(email: string) {
  if (!mayAccessAccount(email)) throw new ForbiddenError('This account is not allowed to access the workspace.');
}
