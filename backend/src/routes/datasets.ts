import multer from 'multer';
import crypto from 'crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { atlasMode } from '../database/atlas';
import { deleteOwnedDataset, listOwnedDatasets, loadOwnedDataset, openOwnedFile, publishDataset, renameOwnedDataset, summarizeDataset } from '../repositories/atlasDatasets';
import { MAX_CSV_BYTES, parseCSVString } from '@dimension-lab/algorithms/dataParser';
import { DatasetDocument } from '@dimension-lab/contracts';
import { listDemoDatasets, getDemoDataset, getDemoFile, saveDemoDataset, renameDemoDataset, deleteDemoDataset, isSampleDataset } from '../repositories/db';
import { sendSuccess } from '../http/response';
import { AppError, BadRequestError, NotFoundError, ForbiddenError } from '../http/errors';
import { requireRole, AuthenticatedRequest } from '../auth/auth';
import type { Express } from 'express';

export function registerDatasetRoutes(app: Express, basePath = '/api') {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_CSV_BYTES + 1, files: 1, fields: 0 },
  });

  function parseUploadedCSV(content: Buffer, name: string) {
    if (content.length > MAX_CSV_BYTES) throw new AppError('The CSV exceeds the 5 MiB file limit.', 413, 'PAYLOAD_TOO_LARGE');
    try {
      return parseCSVString(new TextDecoder('utf-8', { fatal: true }).decode(content), name);
    } catch (error) {
      throw new BadRequestError(error instanceof TypeError ? 'The CSV must use UTF-8 encoding.'
        : error instanceof Error ? error.message : 'Invalid CSV file.');
    }
  }

  // 7. Get list of datasets
  app.get(`${basePath}/datasets`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const offset = Number(req.query.offset ?? 0), limit = Number(req.query.limit ?? 50);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000
        || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestError('Invalid dataset page.');
      const samples = listDemoDatasets();
      const items = samples.slice(offset, offset + limit + 1);
      if (atlasMode && items.length <= limit) {
        items.push(...await listOwnedDatasets(req.user!.id, Math.max(0, offset - samples.length), limit + 1 - items.length));
      }
      if (items.length > limit) res.setHeader('X-Next-Offset', String(offset + limit));
      sendSuccess(res, items.slice(0, limit));
    } catch (err) {
      next(err);
    }
  });

  // 8. Get single dataset detail
  const readDataset = (id: string, ownerId: string) => atlasMode && !isSampleDataset(id)
    ? loadOwnedDataset(id, ownerId) : getDemoDataset(id);

  app.get(`${basePath}/datasets/:id/preview`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await readDataset(String(req.params.id), req.user!.id);
      if (!data) throw new NotFoundError('Dataset');
      const { rawRows, ...metadata } = data;
      sendSuccess(res, { ...metadata, rows: rawRows.slice(0, 20) });
    } catch (error) { next(error); }
  });

  app.get(`${basePath}/datasets/:id/download`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = String(req.params.id);
      const file = atlasMode && !isSampleDataset(id) ? await openOwnedFile(id, req.user!.id) : null;
      const demo = !atlasMode || isSampleDataset(id) ? getDemoDataset(id) : null;
      const stream = file?.stream ?? (demo ? getDemoFile(id) : undefined);
      if (!stream) throw new NotFoundError('Dataset');
      res.attachment(file?.record.filename ?? demo!.filename);
      res.type('text/csv; charset=utf-8');
      await pipeline(Buffer.isBuffer(stream) ? Readable.from([stream]) : stream, res);
    } catch (error) { if (!res.destroyed) next(error); }
  });

  // Explore needs every row for preprocessing and local analysis.
  app.get(`${basePath}/datasets/:id`, async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = String(req.params.id);
      const data = await readDataset(id, req.user!.id);
      if (!data) {
        throw new NotFoundError(`Dataset [${id}]`);
      }
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  });

  // 9. Upload and parse new dataset to MongoDB (Yêu cầu quyền Admin hoặc Researcher)
  app.post(
    [`${basePath}/datasets/upload`, `${basePath}/datasets`],
    requireRole(['admin', 'researcher']),
    upload.single('file'),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        if (!req.file) {
          throw new BadRequestError('Attach a CSV file.');
        }

        const parsed = parseUploadedCSV(req.file.buffer, req.file.originalname);
        const newDataset: DatasetDocument = {
          id: `dataset_${crypto.randomUUID()}`,
          name: req.file.originalname.replace(/\.csv$/i, ''),
          filename: req.file.originalname,
          totalRows: parsed.totalRows,
          features: parsed.featureColumns,
          labelColumn: parsed.labelColumn,
          idColumn: parsed.idColumn,
          rawRows: parsed.rawRows,
          createdAt: new Date().toISOString(),
        };

        if (atlasMode) await publishDataset(newDataset, req.file.buffer, req.user!.id, parsed.headers);
        else saveDemoDataset(newDataset, req.file.buffer);
        sendSuccess(res, newDataset, 201);
      } catch (err) {
        next(err);
      }
    }
  );

  // 10. Update dataset name / metadata (Yêu cầu quyền Admin hoặc Researcher)
  app.patch(`${basePath}/datasets/:id`, requireRole(['admin', 'researcher']), async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = String(req.params.id);
      const { name } = req.body as { name?: string };
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
        throw new BadRequestError('Invalid dataset name.');
      }
      if (id === 'cancer_wdbc' || id === 'wholesale_customers') throw new ForbiddenError('Sample datasets are read-only.');
      const demo = atlasMode ? null : renameDemoDataset(id, name.trim());
      const updated = atlasMode ? await renameOwnedDataset(id, req.user!.id, name.trim()) : demo && summarizeDataset(demo);
      if (!updated) {
        throw new NotFoundError(`Dataset [${id}]`);
      }
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  });

  // 11. Delete dataset (Yêu cầu quyền Admin)
  app.delete(`${basePath}/datasets/:id`, requireRole(atlasMode ? ['researcher', 'admin'] : ['admin']), async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = String(req.params.id);
      if (id === 'cancer_wdbc' || id === 'wholesale_customers') throw new ForbiddenError('Sample datasets are read-only.');
      const success = atlasMode ? await deleteOwnedDataset(id, req.user!.id) : deleteDemoDataset(id);
      if (!success) {
        throw new NotFoundError(`Dataset [${id}]`);
      }
      sendSuccess(res, { message: 'Dataset deleted.' });
    } catch (err) {
      next(err);
    }
  });
}
