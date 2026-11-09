import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { UnauthorizedError, ForbiddenError } from './errors';

export type UserRole = 'admin' | 'researcher' | 'viewer';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

// Tài khoản giả lập cho môi trường nghiên cứu & kiểm thử
const DEMO_USERS: Record<UserRole, AuthUser> = {
  admin: {
    id: 'user_01',
    username: 'admin',
    name: 'System Administrator',
    role: 'admin',
  },
  researcher: {
    id: 'user_02',
    username: 'researcher',
    name: 'Researcher',
    role: 'researcher',
  },
  viewer: {
    id: 'user_03',
    username: 'viewer',
    name: 'Viewer',
    role: 'viewer',
  },
};

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const sessions = new Map<string, { user: AuthUser; expires: number }>();

export function issueSession(role: UserRole, now = Date.now()) {
  const user = DEMO_USERS[role];
  const token = randomBytes(32).toString('base64url');
  for (const [key, session] of sessions) {
    if (session.expires <= now) sessions.delete(key);
  }
  if (sessions.size >= 1024) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
  sessions.set(token, { user, expires: now + SESSION_DURATION_MS });
  return { user, token };
}

function bearerToken(req: Request) {
  return /^Bearer ([A-Za-z0-9_-]+)$/i.exec(req.headers.authorization ?? '')?.[1];
}

export function revokeSession(req: Request) {
  const token = bearerToken(req);
  if (token) sessions.delete(token);
}

/**
 * Middleware trích xuất Token từ Authorization Header (Bearer Token)
 */
export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  if (req.headers.authorization === undefined) return next();

  const token = bearerToken(req);
  const session = token ? sessions.get(token) : undefined;
  if (!session || session.expires <= Date.now()) {
    if (token) sessions.delete(token);
    return next(new UnauthorizedError('Invalid or expired access token.'));
  }

  req.user = session.user;
  next();
}

/**
 * Middleware bắt buộc phải đăng nhập
 */
export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(new UnauthorizedError('Sign in to do this.'));
  }
  next();
}

/**
 * Middleware phân quyền RBAC (Role-Based Access Control)
 * Ném ngoại lệ ForbiddenError (HTTP 403) nếu quyền không thỏa mãn
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Sign in to verify access.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `The ${req.user.role} role cannot do this. Required roles: [${allowedRoles.join(', ')}].`
        )
      );
    }

    next();
  };
}

