import { BSON } from 'mongodb';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const collectionNames = {
  datasets: 'user_datasets',
  legacyRows: 'user_dataset_rows',
  rows: 'user_dataset_revision_rows',
  edits: 'user_dataset_row_edits',
  versions: 'dataset_versions',
  receipts: 'dataset_sync_receipts',
  conflicts: 'dataset_conflicts',
  conflictRows: 'dataset_conflict_rows',
};

const visibleDataset = { pendingOnly: { $ne: true }, syncStatus: { $nin: ['deleted', 'syncing'] } };
const datasetProjection = {
  _id: 0, activeSyncId: 0, syncBaseRevision: 0, pendingSync: 0, publishedSyncId: 0,
  lastSyncReceipt: 0, rowEditRevision: 0, pendingOnly: 0,
};

// This loopback API is the sole writer. Serialize mutations per dataset while Mongo's
// compare-and-set publication keeps a complete revision visible through interruptions.
const activeWrites = new Map();

async function serializeWrite(key, operation) {
  const previous = activeWrites.get(key) || Promise.resolve();
  const result = previous.catch(() => {}).then(operation);
  activeWrites.set(key, result);
  try {
    return await result;
  } finally {
    if (activeWrites.get(key) === result) activeWrites.delete(key);
  }
}

export async function ensureLocalDatasetIndexes(db) {
  await Promise.all([
    db.collection(collectionNames.rows).createIndex(
      { ownerId: 1, datasetId: 1, syncId: 1, recordId: 1 }, { unique: true },
    ),
    db.collection(collectionNames.rows).createIndex(
      { ownerId: 1, datasetId: 1, syncId: 1, rowIndex: 1 }, { unique: true },
    ),
    db.collection(collectionNames.edits).createIndex(
      { ownerId: 1, datasetId: 1, generation: 1, recordId: 1, editRevision: -1 }, { unique: true },
    ),
    db.collection(collectionNames.edits).createIndex({ ownerId: 1, datasetId: 1, generation: 1, editRevision: 1 }),
    db.collection(collectionNames.receipts).createIndex(
      { ownerId: 1, datasetId: 1, syncId: 1 }, { unique: true },
    ),
    db.collection(collectionNames.versions).createIndex(
      { ownerId: 1, datasetId: 1, publicationId: 1 },
      { unique: true, partialFilterExpression: { publicationId: { $type: 'string' } } },
    ),
    db.collection(collectionNames.versions).createIndex({ ownerId: 1, datasetId: 1, syncId: 1 }),
  ]);
}

export function createLocalDatasetRepository(db, HttpError) {
  const { datasets, legacyRows, rows, edits, versions, receipts, conflicts, conflictRows } = Object.fromEntries(
    Object.entries(collectionNames).map(([key, name]) => [key, db.collection(name)]),
  );

  function isVisible(dataset) {
    return Boolean(dataset && !dataset.pendingOnly && !['deleted', 'syncing'].includes(dataset.syncStatus));
  }

  function rowSource(dataset) {
    const scope = { ownerId: dataset.ownerId, datasetId: dataset.id };
    if (dataset.publishedSyncId) {
      return { collection: rows, filter: { ...scope, syncId: dataset.publishedSyncId }, generation: 'sync:' + dataset.publishedSyncId };
    }
    return { collection: legacyRows, filter: scope, generation: 'legacy' };
  }

  async function applyRowEdits(dataset, page) {
    if (!dataset.rowEditRevision || !page.length) return page;
    const { generation } = rowSource(dataset);
    const applied = await edits.aggregate([
      { $match: {
        ownerId: dataset.ownerId,
        datasetId: dataset.id,
        generation,
        recordId: { $in: page.map(row => row.recordId) },
        editRevision: { $lte: dataset.rowEditRevision },
      } },
      { $sort: { recordId: 1, editRevision: -1 } },
      { $group: { _id: '$recordId', values: { $first: '$values' }, updatedAt: { $first: '$updatedAt' } } },
    ], { allowDiskUse: true }).toArray();
    const replacements = new Map(applied.map(edit => [edit._id, edit]));
    return page.map(row => {
      const edit = replacements.get(row.recordId);
      return edit ? { ...row, values: edit.values, updatedAt: edit.updatedAt } : row;
    });
  }

  async function persistReceipt(scope, receipt) {
    if (!receipt) return;
    const key = { ...scope, syncId: receipt.syncId };
    await Promise.all([
      receipts.updateOne(key, { $setOnInsert: { ...key, ...receipt } }, { upsert: true }),
      versions.updateOne({ ...scope, publicationId: receipt.syncId, revision: receipt.revision }, { $set: { status: 'committed' } }),
    ]);
  }

  async function findReceipt(scope, dataset, syncId) {
    if (!dataset || dataset.syncStatus === 'deleted') return null;
    if (dataset.lastSyncReceipt?.syncId === syncId) {
      await persistReceipt(scope, dataset.lastSyncReceipt);
      return dataset.lastSyncReceipt;
    }
    const saved = await receipts.findOne({ ...scope, syncId });
    if (saved || !isVisible(dataset)) return saved;
    // The previous server wrote its manifest after making the dataset ready.
    const legacy = await versions.findOne({
      ...scope, syncId, publicationId: { $exists: false }, revision: { $lte: dataset.revision },
    });
    if (!legacy) return null;
    const conflict = await conflicts.findOne({ ...scope, syncId, status: 'archived' });
    return {
      syncId, revision: legacy.revision, rowCount: legacy.rowCount, syncedAt: legacy.createdAt,
      conflict: Boolean(conflict), archivedRows: conflict?.archivedRows || 0,
      serverRevision: conflict?.serverRevision ?? legacy.revision - 1,
    };
  }

  function finishResponse(datasetId, receipt) {
    return {
      datasetId, rowCount: receipt.rowCount, revision: receipt.revision,
      syncedAt: new Date(receipt.syncedAt).toISOString(),
    };
  }

  function startResponse(datasetId, upload, completed = false) {
    return {
      datasetId, syncId: upload.syncId, conflict: upload.conflict, archivedRows: upload.archivedRows,
      serverRevision: upload.serverRevision, completed,
      ...(completed ? { revision: upload.revision } : {}),
      policy: 'offline-wins; server version archived before replacement',
    };
  }

  function uploadHash(manifest, baseRevision) {
    return createHash('sha256').update(JSON.stringify({ manifest, baseRevision })).digest('hex');
  }

  async function missingBatchRows(generation, batch) {
    const byId = new Map(batch.map(row => [row.recordId, row]));
    const byIndex = new Map(batch.map(row => [row.rowIndex, row]));
    const matched = new Set();
    const saved = rows.find({ ...generation, $or: [
      { recordId: { $in: [...byId.keys()] } },
      { rowIndex: { $in: [...byIndex.keys()] } },
    ] }, { projection: { _id: 0, recordId: 1, rowIndex: 1, values: 1 } }).batchSize(16);
    for await (const existing of saved) {
      const incoming = byId.get(existing.recordId) || byIndex.get(existing.rowIndex);
      if (existing.recordId !== incoming.recordId || existing.rowIndex !== incoming.rowIndex
          || !isDeepStrictEqual(existing.values, incoming.values)) {
        throw new HttpError(409, 'An uploaded row already contains different data for this sync ID.');
      }
      matched.add(existing.recordId);
    }
    return batch.filter(row => !matched.has(row.recordId));
  }

  async function archiveCommittedDataset(scope, dataset, syncId) {
    const key = { ...scope, syncId };
    const known = await conflicts.findOne(key);
    if (known?.status === 'archived' && known.serverRevision === dataset.revision) return known.archivedRows;

    const conflictId = known?.conflictId || syncId;
    const createdAt = new Date();
    await conflicts.updateOne(key, { $set: {
      conflictId, status: 'archiving', archivedRows: 0, serverRevision: dataset.revision,
      serverName: dataset.name, serverFilename: dataset.filename, serverColumns: dataset.columns,
      rowCount: dataset.rowCount, createdAt,
    } }, { upsert: true });
    await conflictRows.deleteMany({ ...scope, conflictId });

    const source = rowSource(dataset);
    const cursor = source.collection.find(source.filter, { projection: { _id: 0 } })
      .sort({ rowIndex: 1 }).batchSize(500);
    let archivedRows = 0;
    let batch = [];
    let batchBytes = 0;
    async function archiveBatch() {
      const current = await applyRowEdits(dataset, batch);
      await conflictRows.insertMany(current.map(row => ({
        ...row, conflictId, serverRevision: dataset.revision, archivedAt: createdAt,
      })));
      archivedRows += current.length;
      batch = [];
      batchBytes = 0;
    }
    for await (const row of cursor) {
      batch.push(row);
      batchBytes += BSON.calculateObjectSize(row);
      if (batch.length === 500 || batchBytes >= 4 * 1024 * 1024) await archiveBatch();
    }
    if (batch.length) await archiveBatch();
    if (archivedRows !== dataset.rowCount) {
      throw new HttpError(409, 'The current MongoDB revision is incomplete and could not be safely archived. The browser copy is retained.');
    }
    await conflicts.updateOne(key, { $set: { status: 'archived', archivedRows, archivedAt: new Date() } });
    return archivedRows;
  }

  function write(ownerId, id, operation) {
    const scope = { ownerId, datasetId: id };
    const key = { ownerId, id };
    return serializeWrite(JSON.stringify([ownerId, id]), async () => {
      const dataset = await datasets.findOne(key);
      return operation(scope, key, dataset);
    });
  }

  return {
    list(ownerId) {
      return datasets.find({ ownerId, ...visibleDataset }).project(datasetProjection)
        .sort({ updatedAt: -1 }).limit(500).toArray();
    },

    start(ownerId, id, syncId, manifest, baseRevision) {
      return write(ownerId, id, async (scope, key, existing) => {
        if (existing?.syncStatus === 'deleted') {
          throw new HttpError(409, 'This dataset was deleted from MongoDB. Import a new copy to sync it again.');
        }
        const serverRevision = existing?.revision ?? 0;
        if (baseRevision !== null && baseRevision > serverRevision) {
          throw new HttpError(409, 'Base revision is ahead of the current MongoDB revision. The browser copy is retained.');
        }
        const completed = await findReceipt(scope, existing, syncId);
        if (completed) {
          if (completed.uploadHash && completed.uploadHash !== uploadHash(manifest, baseRevision)) {
            throw new HttpError(409, 'The sync ID already identifies a completed dataset upload.');
          }
          return startResponse(id, completed, true);
        }
        const previous = existing?.pendingSync;
        if (previous?.syncId === syncId && (previous.baseRevision !== baseRevision
            || !isDeepStrictEqual(previous.manifest, manifest))) {
          throw new HttpError(409, 'The sync ID already identifies a different dataset upload.');
        }
        if (previous?.syncId === syncId && previous.serverRevision === serverRevision && previous.baseRevision === baseRevision) {
          return startResponse(id, previous);
        }

        const conflict = isVisible(existing) && baseRevision !== serverRevision;
        const archivedRows = conflict ? await archiveCommittedDataset(scope, existing, syncId) : 0;
        if (previous && previous.syncId !== syncId) {
          await Promise.all([
            rows.deleteMany({ ...scope, syncId: previous.syncId }),
            versions.deleteOne({ ...scope, publicationId: previous.syncId }),
          ]);
        }
        const pendingSync = { syncId, manifest, baseRevision, serverRevision, conflict, archivedRows };
        const now = new Date();
        await datasets.updateOne(key, {
          $set: { pendingSync },
          $setOnInsert: { ...key, revision: 0, pendingOnly: true, syncStatus: 'syncing', createdAt: now, updatedAt: now },
        }, { upsert: true });
        return startResponse(id, pendingSync);
      });
    },

    saveBatch(ownerId, id, syncId, batch) {
      return write(ownerId, id, async (scope, _key, dataset) => {
        if (new Set(batch.map(row => row.recordId)).size !== batch.length
            || new Set(batch.map(row => row.rowIndex)).size !== batch.length) {
          throw new HttpError(400, 'Each batch must have unique record IDs and row indexes.');
        }
        const generation = { ...scope, syncId };
        const completed = await findReceipt(scope, dataset, syncId);
        if (completed) {
          if (completed.uploadHash && (await missingBatchRows(generation, batch)).length) {
            throw new HttpError(409, 'This completed sync does not contain the supplied records.');
          }
          return { receivedRows: batch.length, matchedRows: batch.length, upsertedRows: 0 };
        }
        const upload = dataset?.pendingSync;
        if (upload?.syncId !== syncId) throw new HttpError(409, 'This sync is no longer active; keep the browser copy and retry.');
        if (batch.some(row => row.rowIndex >= upload.manifest.rowCount)) {
          throw new HttpError(400, 'Row indexes must be within the declared dataset.');
        }

        const inserts = await missingBatchRows(generation, batch);
        if (inserts.length) {
          const updatedAt = new Date();
          await rows.insertMany(inserts.map(row => ({ ...generation, ...row, updatedAt })));
        }
        return { receivedRows: batch.length, matchedRows: batch.length - inserts.length, upsertedRows: inserts.length };
      });
    },

    finish(ownerId, id, syncId) {
      return write(ownerId, id, async (scope, key, dataset) => {
        const completed = await findReceipt(scope, dataset, syncId);
        if (completed) return finishResponse(id, completed);

        const upload = dataset?.pendingSync;
        if (upload?.syncId !== syncId || dataset.revision !== upload.serverRevision) {
          throw new HttpError(409, 'This sync is no longer active for the current revision. Keep the browser copy and retry.');
        }
        const rowCount = await rows.countDocuments({ ...scope, syncId });
        if (rowCount !== upload.manifest.rowCount) {
          throw new HttpError(409, 'Uploaded row count does not match the declared dataset count. The local copy is retained.');
        }

        await persistReceipt(scope, dataset.lastSyncReceipt);
        const revision = upload.serverRevision + 1;
        const now = new Date();
        const receipt = {
          syncId, revision, rowCount, syncedAt: now, conflict: upload.conflict,
          archivedRows: upload.archivedRows, serverRevision: upload.serverRevision,
          uploadHash: uploadHash(upload.manifest, upload.baseRevision),
        };
        await versions.updateOne({ ...scope, publicationId: syncId }, { $set: {
          ...scope, ...upload.manifest, revision, syncId, createdAt: now, status: 'prepared',
        } }, { upsert: true });
        const result = await datasets.updateOne({ ...key, revision: upload.serverRevision, 'pendingSync.syncId': syncId }, {
          $set: {
            ...upload.manifest, revision, syncStatus: 'ready', publishedSyncId: syncId,
            rowEditRevision: 0, lastSyncReceipt: receipt, syncedAt: now, updatedAt: now,
          },
          $unset: { pendingOnly: '', pendingSync: '', activeSyncId: '', syncBaseRevision: '' },
        });
        if (!result.matchedCount) throw new HttpError(409, 'The MongoDB revision changed before this sync could finish.');
        await persistReceipt(scope, receipt);
        return finishResponse(id, receipt);
      });
    },

    async readRows(ownerId, id, after, limit, expectedRevision) {
      const dataset = await datasets.findOne({ ownerId, id, ...visibleDataset });
      if (!dataset) throw new HttpError(404, 'Dataset not found.');
      if (expectedRevision !== undefined && dataset.revision !== expectedRevision) {
        throw new HttpError(409, 'The MongoDB dataset revision changed. Reload the dataset and try again.');
      }
      const source = rowSource(dataset);
      const page = await source.collection.find({ ...source.filter, rowIndex: { $gt: after } }, { projection: { _id: 0, syncId: 0 } })
        .sort({ rowIndex: 1 }).limit(limit).toArray();
      const records = await applyRowEdits(dataset, page);
      const stillExists = await datasets.findOne({ _id: dataset._id, ...visibleDataset }, { projection: { _id: 1 } });
      if (!stillExists) throw new HttpError(404, 'Dataset not found.');
      return {
        dataset: { id, ownerId, name: dataset.name, columns: dataset.columns, revision: dataset.revision },
        rows: records,
        nextAfter: records.length ? records[records.length - 1].rowIndex : null,
      };
    },

    listConflicts(ownerId, id) {
      return conflicts.find({ ownerId, datasetId: id, status: 'archived' }).project({ _id: 0 })
        .sort({ createdAt: -1 }).limit(50).toArray();
    },

    async readConflictRows(ownerId, id, conflictId, after) {
      const scope = { ownerId, datasetId: id, conflictId };
      const conflict = await conflicts.findOne({ ...scope, status: 'archived' });
      if (!conflict) throw new HttpError(404, 'Conflict snapshot not found.');
      const page = await conflictRows.find({ ...scope, rowIndex: { $gt: after } }, { projection: { _id: 0 } })
        .sort({ rowIndex: 1 }).limit(500).toArray();
      const current = await conflicts.findOne({
        _id: conflict._id, status: 'archived', createdAt: conflict.createdAt, serverRevision: conflict.serverRevision,
      }, { projection: { _id: 1 } });
      if (!current) throw new HttpError(409, 'The conflict snapshot changed. Reload the conflict and try again.');
      return {
        conflict, rows: page, nextAfter: page.length ? page[page.length - 1].rowIndex : null,
        note: 'Use rowIndex paging to retrieve additional rows.',
      };
    },

    rename(ownerId, id, name) {
      return write(ownerId, id, async (_scope, key, dataset) => {
        if (!isVisible(dataset)) throw new HttpError(404, 'Dataset not found.');
        const changed = await datasets.findOneAndUpdate({ ...key, revision: dataset.revision }, {
          $set: { name, updatedAt: new Date() }, $inc: { revision: 1 },
        }, { returnDocument: 'after', projection: datasetProjection });
        if (!changed) throw new HttpError(409, 'The MongoDB dataset revision changed.');
        return changed;
      });
    },

    editRow(ownerId, id, recordId, values) {
      return write(ownerId, id, async (scope, key, dataset) => {
        if (!isVisible(dataset)) throw new HttpError(404, 'Dataset not found.');
        const source = rowSource(dataset);
        const row = await source.collection.findOne({ ...source.filter, recordId }, { projection: { _id: 1 } });
        if (!row) throw new HttpError(404, 'Dataset row not found.');
        const editRevision = (dataset.rowEditRevision || 0) + 1;
        const previousDraft = { ...scope, generation: source.generation, editRevision };
        const updatedAt = new Date();
        // If a previous request stopped before publication, its unpublished edit is safe to discard.
        await edits.deleteMany(previousDraft);
        await edits.insertOne({ ...previousDraft, recordId, values, updatedAt });
        const result = await datasets.updateOne({ ...key, revision: dataset.revision }, {
          $set: { rowEditRevision: editRevision, updatedAt }, $inc: { revision: 1 },
        });
        if (!result.matchedCount) throw new HttpError(409, 'The MongoDB dataset revision changed.');
        return { recordId, updatedAt: updatedAt.toISOString(), updated: true };
      });
    },

    remove(ownerId, id) {
      return write(ownerId, id, async (scope, key, dataset) => {
        if (!dataset) throw new HttpError(404, 'Dataset not found.');
        if (dataset.syncStatus !== 'deleted') {
          const { _id, revision, createdAt } = dataset;
          const deletedAt = new Date();
          await persistReceipt(scope, dataset.lastSyncReceipt);
          await datasets.replaceOne({ _id }, { ...key, revision, createdAt, updatedAt: deletedAt, deletedAt, syncStatus: 'deleted' });
        }
        await Promise.all([
          legacyRows.deleteMany(scope), rows.deleteMany(scope), edits.deleteMany(scope), receipts.deleteMany(scope),
          conflicts.deleteMany(scope), conflictRows.deleteMany(scope),
          versions.deleteMany({ ...scope, status: 'prepared', publicationId: { $exists: true } }),
        ]);
        return { deleted: true, datasetId: id };
      });
    },
  };
}
