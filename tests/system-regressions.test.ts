import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticate, issueSession, SESSION_DURATION_MS } from '../server/auth';
import { computePCA } from '../src/algorithms/pca';
import { computeDBSCAN } from '../src/algorithms/dbscan';
import { computeKMeans } from '../src/algorithms/kmeans';
import { computeARI } from '../src/algorithms/metrics';
import { computeTSNE } from '../src/algorithms/tsne';
import { computeUMAP } from '../src/algorithms/umap';
import { randomSource } from '../src/algorithms/unsupervised';
import { extractFeatureMatrix, MAX_CSV_ROWS, parseCSVString } from '../src/utils/dataParser';
import { makePoints } from '../src/utils/exploration';
import { projectInBrowser } from '../src/utils/projectionWorker';
import { csvText, resultRows } from '../src/utils/exportData';
import Papa from 'papaparse';

test('an absent or forged Authorization header never assigns a demo role', () => {
  for (const authorization of [undefined, 'Bearer admin_token', 'Bearer constructor', 'Bearer __proto__']) {
    const request = { headers: { authorization }, user: undefined };
    let error: unknown;
    authenticate(request as never, {} as never, (value) => { error = value; });
    assert.equal(request.user, undefined);
    assert.equal(Boolean(error), Boolean(authorization));
  }
});

test('a server-issued session past its expiry is rejected', () => {
  const { token } = issueSession('admin', Date.now() - SESSION_DURATION_MS - 1);
  const request = { headers: { authorization: 'Bearer ' + token }, user: undefined };
  let error: unknown;
  authenticate(request as never, {} as never, value => { error = value; });
  assert.equal(request.user, undefined);
  assert.equal((error as { statusCode: number }).statusCode, 401);
});

test('PCA null axes do not change density clustering', () => {
  const result = computePCA([[0, 0, 0], [1, 0, 0], [10, 0, 0]]);
  assert.deepEqual(result.explainedVariance, [1, 0, 0]);
  for (const [, y, z] of result.coordinates) assert.deepEqual([y, z], [0, 0]);
  assert.deepEqual(computeDBSCAN(result.coordinates, 1.1, 2).clusters, [0, 0, -1]);
  assert.deepEqual(computePCA([[4, 4, 4], [4, 4, 4]]).coordinates, [[0, 0, 0], [0, 0, 0]]);
});

test('CSV rejects ambiguous headers and ragged rows instead of changing values', () => {
  const rows = '\n001,A,0,2,3,4\n002,B,1,3,4,5';
  for (const header of ['id,label,a,a,c,d', 'id,label,a, a,c,d', 'id,label,a,,c,d']) {
    assert.throws(() => parseCSVString(header + rows), /column|header/i);
  }
  assert.throws(() => parseCSVString('id,label,a,b,c,d\n001,A,0,2,3,4\n002,B,1,3,4'), /CSV/i);
});

test('CSV preserves lexical IDs and explicit missing cells alongside true zero', () => {
  const data = parseCSVString('id,a,b,c\n001,0,2,3\n002,,3,4\n003,2,4,5');
  assert.deepEqual(data.featureColumns, ['a', 'b', 'c']);
  assert.equal(data.labelColumn, null);
  assert.deepEqual(data.rawRows.map(row => row.id), ['001', '002', '003']);
  assert.deepEqual(data.rawRows.map(row => row.a), [0, null, 2]);
  assert.deepEqual(extractFeatureMatrix(data.rawRows, data.featureColumns, 'none').map(row => row[0]), [0, 1, 2]);
  assert.deepEqual(makePoints(data, [[0, 0, 0], [1, 0, 0], [2, 0, 0]])
    .map(point => point.originalFeatures.a), [0, null, 2]);
  const oversized = 'a,b,c\n' + '1,2,3\n'.repeat(MAX_CSV_ROWS + 1);
  assert.throws(() => parseCSVString(oversized), /limit/);
});

test('CSV preserves class codes and ISO timestamps through export', () => {
  const data = parseCSVString('id,label,a,b,c,note\n001,001,0,2,3,2025-01-01T12:05:09Z\n002,002,1,3,4,2025-01-02T00:00:00+00:00');
  assert.deepEqual(data.rawRows.map(row => [row.label, row.note]), [
    ['001', '2025-01-01T12:05:09Z'], ['002', '2025-01-02T00:00:00+00:00'],
  ]);
  const exported = Papa.parse<Record<string, string>>(csvText(resultRows(data, makePoints(data, [[0, 0, 0], [1, 0, 0]]), false)), { header: true });
  assert.deepEqual(exported.data.map(row => [row.id, row.label_ground_truth, row.note]), [
    ['001', '001', '2025-01-01T12:05:09Z'], ['002', '002', '2025-01-02T00:00:00+00:00'],
  ]);
});

test('known K-Means and all-noise DBSCAN results preserve every input row', () => {
  const points = [[0], [2], [20], [22]];
  const kmeans = computeKMeans(points, 2);
  assert.deepEqual(kmeans.centroids.flat().sort((a, b) => a - b), [1, 21]);
  assert.equal(kmeans.inertia, 4);
  assert.deepEqual(computeDBSCAN(points, 0.5, 2), { clusters: [-1, -1, -1, -1], numClusters: 0, noiseCount: 4 });
  const duplicates = computeKMeans([[2], [2], [2]], 2);
  assert.equal(duplicates.inertia, 0);
  assert.equal(duplicates.clusters.length, 3);
});

test('ARI gives perfect agreement to identical single-cluster partitions', () => {
  assert.equal(computeARI(['A', 'A'], [0, 0]), 1);
  assert.equal(computeARI(['A', 'B'], [0, 0]), 0);
  assert.equal(computeARI(['A', 'A', null], [0, 0, 0]), 1);
  assert.equal(computeARI([null, null], [0, 1]), null);
});

test('t-SNE and UMAP preserve local neighborhoods on the same separated fixture', (t) => {
  const source = Array.from({ length: 48 }, (_, i) => Array.from({ length: 6 }, (_, j) =>
    Math.floor(i / 12) * 25 + Math.sin(i * 1.17 + j) * 0.8 + Math.cos(i * 0.4 + j * 2) * 0.2));
  const nearest = (rows: number[][], i: number) => rows.map((row, j) => ({
    j, distance: row.reduce((sum, value, d) => sum + (value - rows[i][d]) ** 2, 0),
  })).filter(item => item.j !== i).sort((a, b) => a.distance - b.distance || a.j - b.j)
    .slice(0, 5).map(item => item.j);
  for (const project of [
    (rows: number[][]) => computeTSNE(rows, { perplexity: 8, learningRate: 100, iterations: 250 }),
    (rows: number[][]) => computeUMAP(rows, { nNeighbors: 8, minDist: 0.1 }),
  ]) {
    const random = t.mock.method(Math, 'random', randomSource(42));
    try {
      const coordinates = project(source);
      assert.equal(coordinates.length, source.length);
      assert.ok(coordinates.every(row => row.length === 3 && row.every(Number.isFinite)));
      const overlap = coordinates.reduce((sum, _, i) => {
        const projected = nearest(coordinates, i);
        return sum + nearest(source, i).filter(j => projected.includes(j)).length;
      }, 0) / (source.length * 5);
      assert.ok(overlap >= 0.7, `Neighbor overlap was ${overlap}`);
      assert.ok(project(Array.from({ length: 12 }, () => [1, 1, 1])).flat().every(Number.isFinite));
    } finally {
      random.mock.restore();
    }
  }
});

test('aborting a browser fallback terminates its worker and discards a late reply', async () => {
  const originalWorker = globalThis.Worker;
  let terminated = false;
  let reply: ((event: { data: { result: { coordinates: number[][] } } }) => void) | undefined;
  globalThis.Worker = class {
    set onmessage(handler: typeof reply) { reply = handler; }
    postMessage() {}
    terminate() { terminated = true; }
  } as unknown as typeof Worker;
  try {
    const controller = new AbortController();
    const config = { method: 'PCA', normalization: 'none', perplexity: 30, learningRate: 100,
      iterations: 250, nNeighbors: 15, minDist: 0.1 } as const;
    const pending = projectInBrowser([[1, 2, 3]], config, controller.signal);
    controller.abort();
    reply?.({ data: { result: { coordinates: [[1, 2, 3]] } } });
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(terminated, true);
  } finally {
    globalThis.Worker = originalWorker;
  }
});
