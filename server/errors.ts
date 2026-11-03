/**
 * Enterprise Custom Exception Hierarchy
 * Phân lớp ngoại lệ chuyên biệt cho hệ thống khoa học dữ liệu
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Dữ liệu yêu cầu không hợp lệ.', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Yêu cầu xác thực tài khoản để truy cập tài nguyên này.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Bạn không có quyền thực hiện thao tác này (403 Forbidden).') {
    super(message, 403, 'FORBIDDEN_ACCESS');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Tài nguyên') {
    super(`${resource} không tồn tại trên hệ thống.`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Xung đột dữ liệu trên máy chủ.') {
    super(message, 409, 'CONFLICT');
  }
}

