import express from 'express';
import multer from 'multer';
import { MongoError } from 'mongodb';
import { storageUnavailable } from '../database/atlas';
import { sendError } from '../http/response';
import { AppError } from '../http/errors';
import { isRecord } from '../http/validation';

export function handleError(err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) {
  if (res.headersSent) return next(err);
  if (err instanceof MongoError) return sendError(res, 503, 'STORAGE_UNAVAILABLE', storageUnavailable().message);

  // Bắt lỗi Custom AppError (400, 401, 403, 404, ...)
  if (err instanceof AppError) {
    if (err.code === 'WORKLOAD_BUSY' && !res.hasHeader('Retry-After')) res.setHeader('Retry-After', '2');
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return sendError(res, tooLarge ? 413 : 400, tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      tooLarge ? 'The CSV exceeds the 5 MiB file limit.' : 'Send exactly one CSV file in the file field.');
  }
  if (isRecord(err) && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    return sendError(res, err.type === 'entity.too.large' ? 413 : 400, 'INVALID_REQUEST_BODY', 'Invalid or oversized JSON request.');
  }

  // Bắt lỗi không xác định (Unhandled 500)
  console.error(JSON.stringify({ event: 'api.error', requestId: res.getHeader('X-Request-Id') }));
  sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error.');
}
