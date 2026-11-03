import { Response } from 'express';

/**
 * Standardized API Response Contract
 * Chuẩn hóa toàn bộ cấu trúc phản hồi HTTP RESTful
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

/**
 * Gửi phản hồi thành công chuẩn RESTful
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  extra: Record<string, unknown> = {}
): void {
  const isPlainObj = typeof data === 'object' && data !== null && !Array.isArray(data);
  const body = isPlainObj
    ? { success: true, data, ...data, ...extra, timestamp: new Date().toISOString() }
    : { success: true, data, ...extra, timestamp: new Date().toISOString() };

  res.status(statusCode).json(body);
}

/**
 * Gửi phản hồi lỗi có cấu trúc chuẩn RESTful
 */
export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): void {
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    message, // Cho client legacy tương thích
    timestamp: new Date().toISOString(),
  });
}

