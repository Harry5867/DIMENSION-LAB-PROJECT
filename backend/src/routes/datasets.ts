import multer from 'multer';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Express } from 'express';
import { MAX_CSV_BYTES } from '@dimension-lab/algorithms/dataParser';
import { requireRole, type AuthenticatedRequest } from '../auth/auth';
import { atlasMode } from '../database/atlas';
import { BadRequestError } from '../http/errors';
import { readRequestBody } from '../http/body';
import { sendSuccess } from '../http/response';
import { datasetUsage } from '../repositories/datasetQuota';
import { uploadWorkload } from '../middleware/workloadLimits';
import { downloadDataset, importDataset, listDatasets, readDataset, removeDataset, renameDataset } from '../services/datasets';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CSV_BYTES + 1, files: 1, fields: 0 } });
const parseUpload = upload.single('file');

export function registerDatasetRoutes(app: Express) {
  app.get('/api/datasets/usage', async (req: AuthenticatedRequest, res, next) => {
    try {
      sendSuccess(res, atlasMode ? await datasetUsage(req.user!.id) : null);
    } catch (error) { next(error); }
  });

  app.get('/api/datasets', async (req: AuthenticatedRequest, res, next) => {
    try {
      const offset = Number(req.query.offset ?? 0);
      const limit = Number(req.query.limit ?? 50);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000
        || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestError('Invalid dataset page.');
      const { items, nextOffset } = await listDatasets(req.user!.id, offset, limit);
      if (nextOffset !== null) res.setHeader('X-Next-Offset', String(nextOffset));
      sendSuccess(res, items);
    } catch (error) { next(error); }
  });

  app.get('/api/datasets/:id/preview', async (req: AuthenticatedRequest, res, next) => {
    try {
      const { rawRows, ...metadata } = await readDataset(String(req.params.id), req.user!.id);
      sendSuccess(res, { ...metadata, rows: rawRows.slice(0, 20) });
    } catch (error) { next(error); }
  });

  app.get('/api/datasets/:id/download', async (req: AuthenticatedRequest, res, next) => {
    try {
      const { filename, stream } = await downloadDataset(String(req.params.id), req.user!.id);
      res.attachment(filename);
      res.type('text/csv; charset=utf-8');
      await pipeline(Buffer.isBuffer(stream) ? Readable.from([stream]) : stream, res);
    } catch (error) { if (!res.destroyed) next(error); }
  });

  app.get('/api/datasets/:id', async (req: AuthenticatedRequest, res, next) => {
    try {
      sendSuccess(res, await readDataset(String(req.params.id), req.user!.id));
    } catch (error) { next(error); }
  });

  app.post('/api/datasets/upload', requireRole(['admin', 'researcher']),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const dataset = await uploadWorkload.run(async () => {
          await readRequestBody(parseUpload, req, res);
          if (!req.file) throw new BadRequestError('Attach a CSV file.');
          return importDataset(req.file.originalname, req.file.buffer, req.user!.id);
        });
        sendSuccess(res, dataset, 201);
      } catch (error) { if (!res.destroyed) next(error); }
    });

  app.patch('/api/datasets/:id', requireRole(['admin', 'researcher']), async (req: AuthenticatedRequest, res, next) => {
    try {
      sendSuccess(res, await renameDataset(String(req.params.id), req.user!.id, req.body));
    } catch (error) { next(error); }
  });

  app.delete('/api/datasets/:id', requireRole(atlasMode ? ['researcher', 'admin'] : ['admin']),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        await removeDataset(String(req.params.id), req.user!.id);
        sendSuccess(res, { message: 'Dataset deleted.' });
      } catch (error) { next(error); }
    });
}
