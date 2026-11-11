import { createLocalDatasetRepository } from './local-dataset-repository.js';

export function installLocalDatasetRoutes(app, {
  getDb, requireUser, asyncRoute, success, HttpError, isPlainObject, requireSafeId, requireText,
}) {
  let repositoryDb;
  let datasetRepository;
  function repository() {
    const db = getDb();
    if (!db) throw new HttpError(503, 'Local MongoDB is not connected.');
    if (repositoryDb !== db) {
      datasetRepository = createLocalDatasetRepository(db, HttpError);
      repositoryDb = db;
    }
    return datasetRepository;
  }

  function readInteger(value, fallback, minimum, name) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new HttpError(400, name + ' is invalid.');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new HttpError(400, name + ' is invalid.');
    return parsed;
  }

  function validateValues(values) {
    if (!isPlainObject(values)) throw new HttpError(400, 'Row values are required.');
    if (Buffer.byteLength(JSON.stringify(values), 'utf8') > 1024 * 1024) {
      throw new HttpError(413, 'A single row exceeds the 1 MiB limit.');
    }
  }

  app.get('/api/datasets', requireUser, asyncRoute(async (req, res) => {
    success(res, await repository().list(req.user.id));
  }));

  app.post('/api/datasets/sync/start', requireUser, asyncRoute(async (req, res) => {
    const input = req.body.dataset;
    if (!isPlainObject(input)) throw new HttpError(400, 'Dataset metadata is required.');
    const id = requireSafeId(input.id, 'Dataset ID');
    const syncId = requireSafeId(req.body.syncId, 'Sync ID');
    const name = requireText(input.name, 'Dataset name', 180);
    const filename = requireText(input.filename, 'Filename', 255);
    const { columns, rowCount } = input;
    if (!Array.isArray(columns) || columns.length < 1 || columns.length > 500
        || columns.some(column => typeof column !== 'string' || !column.trim() || column.length > 250)) {
      throw new HttpError(400, 'Dataset columns must contain 1 to 500 valid names.');
    }
    if (!Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > 100000000) {
      throw new HttpError(400, 'Dataset row count is invalid.');
    }
    const baseRevision = typeof req.body.baseRevision === 'string'
      ? readInteger(req.body.baseRevision, undefined, 0, 'Base revision') : req.body.baseRevision;
    if (baseRevision !== null && (!Number.isSafeInteger(baseRevision) || baseRevision < 0)) {
      throw new HttpError(400, 'Base revision is invalid.');
    }
    success(res, await repository().start(req.user.id, id, syncId, { name, filename, columns, rowCount }, baseRevision));
  }));

  app.post('/api/datasets/:id/rows/batch', requireUser, asyncRoute(async (req, res) => {
    const id = requireSafeId(req.params.id, 'Dataset ID');
    const syncId = requireSafeId(req.body.syncId, 'Sync ID');
    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
      throw new HttpError(400, 'A row batch must contain between 1 and 500 records.');
    }
    const batch = rows.map(row => {
      if (!isPlainObject(row)) throw new HttpError(400, 'Each row must be an object.');
      const recordId = requireSafeId(row.recordId, 'Record ID');
      if (!Number.isSafeInteger(row.rowIndex) || row.rowIndex < 0) throw new HttpError(400, 'Row index is invalid.');
      validateValues(row.values);
      return { recordId, rowIndex: row.rowIndex, values: row.values };
    });
    success(res, await repository().saveBatch(req.user.id, id, syncId, batch));
  }));

  app.post('/api/datasets/:id/sync/finish', requireUser, asyncRoute(async (req, res) => {
    const id = requireSafeId(req.params.id, 'Dataset ID');
    const syncId = requireSafeId(req.body.syncId, 'Sync ID');
    success(res, await repository().finish(req.user.id, id, syncId));
  }));

  app.get('/api/datasets/:id/rows', requireUser, asyncRoute(async (req, res) => {
    const id = requireSafeId(req.params.id, 'Dataset ID');
    const limit = Math.min(500, readInteger(req.query.limit, 100, 1, 'Page limit'));
    const after = readInteger(req.query.after, -1, -1, 'Row cursor');
    const expectedRevision = readInteger(req.query.expectedRevision, undefined, 0, 'Expected revision');
    success(res, await repository().readRows(req.user.id, id, after, limit, expectedRevision));
  }));

  app.get('/api/datasets/:id/conflicts', requireUser, asyncRoute(async (req, res) => {
    const id = requireSafeId(req.params.id, 'Dataset ID');
    success(res, await repository().listConflicts(req.user.id, id));
  }));

  app.get('/api/datasets/:id/conflicts/:conflictId/rows', requireUser, asyncRoute(async (req, res) => {
    const id = requireSafeId(req.params.id, 'Dataset ID');
    const conflictId = requireSafeId(req.params.conflictId, 'Conflict ID');
    const after = readInteger(req.query.after, -1, -1, 'Row cursor');
    success(res, await repository().readConflictRows(req.user.id, id, conflictId, after));
  }));

  app.patch('/api/datasets/:id', requireUser, asyncRoute(async (req, res) => {
    const id = requireSafeId(req.params.id, 'Dataset ID');
    const name = requireText(req.body.name, 'Dataset name', 180);
    success(res, await repository().rename(req.user.id, id, name));
  }));

  app.patch('/api/datasets/:id/rows/:recordId', requireUser, asyncRoute(async (req, res) => {
    const id = requireSafeId(req.params.id, 'Dataset ID');
    const recordId = requireSafeId(req.params.recordId, 'Record ID');
    validateValues(req.body.values);
    success(res, await repository().editRow(req.user.id, id, recordId, req.body.values));
  }));

  app.delete('/api/datasets/:id', requireUser, asyncRoute(async (req, res) => {
    const id = requireSafeId(req.params.id, 'Dataset ID');
    success(res, await repository().remove(req.user.id, id));
  }));
}
