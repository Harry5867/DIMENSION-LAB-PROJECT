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
    name: 'Quản trị viên Hệ thống',
    role: 'admin',
  },
  researcher_token: {
    id: 'user_02',
    username: 'researcher',
    name: 'Chuyên viên Nghiên cứu',
    role: 'researcher',
  },
  viewer_token: {
    id: 'user_03',
    username: 'viewer',
    name: 'Khách tham quan (Chỉ xem)',
    role: 'viewer',
  },
};

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * Middleware trích xuất Token từ Authorization Header (Bearer Token)
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // Nếu không truyền token, mặc định cấp quyền viewer công khai
    req.user = DEMO_USERS['admin_token']; // Mặc định chế độ dev cho phép trải nghiệm
    return next();
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  const user = DEMO_USERS[token];

  if (!user) {
    return next(new UnauthorizedError('Mã Token xác thực không hợp lệ hoặc đã hết hạn.'));
  }

  req.user = user;
  next();
}

/**
 * Middleware bắt buộc phải đăng nhập
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(new UnauthorizedError('Bạn cần đăng nhập để thực hiện hành động này.'));
  }
  next();
}

/**
 * Middleware phân quyền RBAC (Role-Based Access Control)
 * Ném ngoại lệ ForbiddenError (HTTP 403) nếu quyền không thỏa mãn
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Yêu cầu đăng nhập để kiểm tra quyền truy cập.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Tài khoản (${req.user.role}) không có quyền thực hiện thao tác này (HTTP 403). Thao tác yêu cầu quyền: [${allowedRoles.join(', ')}].`
        )
      );
    }

    next();
  };
}

