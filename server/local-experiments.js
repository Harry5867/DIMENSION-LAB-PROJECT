const COLLECTION = 'user_experiments';
const HISTORY_LIMIT = 50;
const MAX_PARAMS_BYTES = 32 * 1024;

export function ensureLocalExperimentIndexes(db) {
  return db.collection(COLLECTION).createIndex({ ownerId: 1, createdAt: -1, _id: -1 });
}

export function installLocalExperimentRoutes(app, { getDb, requireUser, requireSafeId, asyncRoute, success, HttpError }) {
  app.get('/api/experiments', requireUser, asyncRoute(async (req, res) => {
    const records = await getDb().collection(COLLECTION)
      .find({ ownerId: req.user.id }, { projection: { ownerId: 0 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(HISTORY_LIMIT)
      .toArray();

    success(res, records.map(({ _id, createdAt, ...record }) => ({
      ...record,
      id: _id.toHexString(),
      created_at: createdAt.toISOString(),
    })));
  }));

  app.post('/api/experiments', requireUser, asyncRoute(async (req, res) => {
    const {
      datasetId, revision, reductionMethod, clusteringMethod,
      k, silhouetteScore, ari, params = {},
    } = req.body ?? {};

    requireSafeId(datasetId, 'Dataset ID');
    if (!Number.isSafeInteger(revision) || revision < 0
      || typeof reductionMethod !== 'string' || !reductionMethod.trim() || reductionMethod.length > 80
      || typeof clusteringMethod !== 'string' || !clusteringMethod.trim() || clusteringMethod.length > 80
      || !Number.isSafeInteger(k) || k < 0
      || !(silhouetteScore === null || Number.isFinite(silhouetteScore))
      || !(ari === null || Number.isFinite(ari))
      || !params || typeof params !== 'object' || Array.isArray(params)
      || Buffer.byteLength(JSON.stringify(params)) > MAX_PARAMS_BYTES) {
      throw new HttpError(400, 'Invalid experiment data.');
    }

    const db = getDb();
    const ownerId = req.user.id;
    const dataset = await db.collection('user_datasets').findOne(
      { ownerId, id: datasetId, syncStatus: 'ready' },
      { projection: { _id: 0, name: 1, revision: 1 } },
    );
    if (!dataset) throw new HttpError(404, 'Dataset not found.');
    if (dataset.revision !== revision) {
      throw new HttpError(409, 'The dataset revision changed. Reload it before saving this experiment.');
    }

    const result = await db.collection(COLLECTION).insertOne({
      ownerId,
      dataset_id: datasetId,
      dataset_name: dataset.name,
      dataset_revision: revision,
      reduction_method: reductionMethod,
      clustering_method: clusteringMethod,
      k,
      silhouette_score: silhouetteScore,
      ari,
      params,
      createdAt: new Date(),
    });
    success(res, { id: result.insertedId.toHexString(), message: 'Experiment saved.' }, 201);
  }));
}
