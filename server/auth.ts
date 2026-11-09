import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from './errors';

export type UserRole = 'admin' | 'researcher' | 'viewer';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

// Tài khoản giả lập cho môi trường nghiên cứu & kiểm thử
export const DEMO_USERS: Record<string, AuthUser> = {
  admin_token: {
    id: 'user_01',
    username: 'admin',
    name: 'System Administrator',
    role: 'admin',
  },
  researcher_token: {
    id: 'user_02',
    username: 'researcher',
    name: 'Researcher',
    role: 'researcher',
  },
  viewer_token: {
    id: 'user_03',
    username: 'viewer',
    name: 'Viewer',
    role: 'viewer',
  },
};

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * Middleware trích xuất Token từ Authorization Header (Bearer Token)
 */
export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // Nếu không truyền token, mặc định cấp quyền viewer công khai
    req.user = DEMO_USERS['admin_token']; // Mặc định chế độ dev cho phép trải nghiệm
    return next();
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  const user = DEMO_USERS[token];

  if (!user) {
    return next(new UnauthorizedError('Invalid or expired access token.'));
  }

  req.user = user;
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

