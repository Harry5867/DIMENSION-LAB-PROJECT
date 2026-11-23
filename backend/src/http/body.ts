import type { Request, RequestHandler, Response } from 'express';
import { BadRequestError } from './errors';

export function readRequestBody(parser: RequestHandler, req: Request, res: Response) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => reject(new BadRequestError('Request body was interrupted.'));
    if (req.destroyed && !req.complete) return abort();
    req.once('aborted', abort);
    parser(req, res, (error?: unknown) => {
      req.off('aborted', abort);
      if (error) reject(error);
      else resolve();
    });
  });
}
