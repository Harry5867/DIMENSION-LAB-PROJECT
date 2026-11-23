import { Response } from 'express';
import type { ApiResponse } from '@dimension-lab/contracts';

/**
 * Gửi phản hồi thành công chuẩn RESTful
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
): void {
  const body: ApiResponse<T> = { success: true, data, timestamp: new Date().toISOString() };
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
  const body: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    timestamp: new Date().toISOString(),
  };
  res.status(statusCode).json(body);
}

