import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { makePoints } from '../src/utils/exploration';
import {
  listWorkbenchDatasets, listWorkbenchExperiments, loadWorkbenchDataset, parseWorkbenchRows,
  saveWorkbenchExperiment, type WorkbenchDataset,
} from '../src/utils/workbench';

const dataset: WorkbenchDataset = {
  id: 'ds_example', ownerId: 'owner_a', name: 'Private CSV', filename: 'private.csv',
  columns: ['external_id', 'a', 'b', 'c', 'target'], rowCount: 2, revision: 3,
  updatedAt: '2026-11-11T00:00:00.000Z', syncStatus: 'ready',
};

function makeRow(rowIndex: number) {
  return {
    recordId: `row_${rowIndex}`, rowIndex,
    values: { external_id: '007', a: String(rowIndex + 1), b: String(rowIndex + 2), c: String(rowIndex + 3), target: rowIndex % 2 ? 'x' : 'y' },
  };
}

function json(data: unknown) { return Response.json({ success: true, data }); }

function mockWindow(t: TestContext) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: { location: { protocol: 'http:', hostname: 'localhost' } },
  });
  t.after(() => { Reflect.deleteProperty(globalThis, 'window'); });
}

test('workbench analysis preserves ordered record IDs and literal external IDs while typing features', () => {
  const input = [makeRow(0), makeRow(1)];
  const parsed = parseWorkbenchRows(dataset, input);
  assert.deepEqual(parsed.featureColumns, ['a', 'b', 'c']);
  assert.deepEqual(parsed.workbench?.recordIds, ['row_0', 'row_1']);
  assert.equal(parsed.rawRows[0].external_id, '007');
  assert.equal(parsed.rawRows[0].a, 1);
  assert.equal(input[0].values.a, '1');
  assert.deepEqual(makePoints(parsed, [[0, 0, 0], [1, 1, 1]]).map(point => [point.id, point.rowIndex]), [['007', 0], ['007', 1]]);
  assert.throws(() => parseWorkbenchRows({ ...dataset, columns: ['external_id', 'target'] }, input), /valid numeric features/);
});

test('private dataset pages are scoped to the verified session and pinned to one revision', async (t) => {
  mockWindow(t);
  const manyRows = { ...dataset, rowCount: 501 };
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (resource: string, options: RequestInit) => {
    const url = new URL(resource);
    assert.equal(url.origin, 'http://localhost:5100');
    assert.equal(options.credentials, 'include');
    assert.equal(new Headers(options.headers).get('X-Dimension-Lab-Client'), 'database-workbench');
    requests.push(url.pathname + url.search);
    if (url.pathname === '/api/auth/me') return json({ user: { id: dataset.ownerId } });
    assert.equal(url.searchParams.get('expectedOwnerId'), dataset.ownerId);
    if (url.pathname === '/api/datasets') {
      return json([manyRows, { ...manyRows, id: 'other', ownerId: 'other' }, { ...manyRows, id: 'pending', syncStatus: 'syncing' }]);
    }
    assert.equal(url.pathname, '/api/datasets/ds_example/rows');
    assert.equal(url.searchParams.get('expectedRevision'), '3');
    const after = Number(url.searchParams.get('after'));
    return json({ dataset: manyRows, rows: Array.from({ length: after === -1 ? 500 : 1 }, (_, index) => makeRow(after + 1 + index)) });
  });
  assert.deepEqual(await listWorkbenchDatasets(dataset.ownerId), [manyRows]);
  const parsed = await loadWorkbenchDataset(manyRows);
  assert.equal(parsed.id, 'workbench:ds_example');
  assert.equal(parsed.rawRows.length, 501);
  assert.equal(parsed.workbench?.recordIds[500], 'row_500');
  assert.equal(requests.filter(path => path === '/api/auth/me').length, 2);
  assert.ok(requests.some(path => path.endsWith('after=499')));
});

test('private experiments use the owner-scoped endpoint and expose revision mismatch', async (t) => {
  mockWindow(t);
  const record = {
    id: 'saved', dataset_id: dataset.id, dataset_name: dataset.name, dataset_revision: 3, reduction_method: 'PCA',
    clustering_method: 'None', k: 2, silhouette_score: null, ari: null, params: {}, created_at: dataset.updatedAt,
  };
  t.mock.method(globalThis, 'fetch', async (resource: string, options: RequestInit) => {
    const url = new URL(resource);
    assert.equal(url.origin, 'http://localhost:5100');
    assert.equal(url.pathname, '/api/experiments');
    assert.equal(url.searchParams.get('expectedOwnerId'), dataset.ownerId);
    if (options.method !== 'POST') return json([record]);
    assert.deepEqual(JSON.parse(String(options.body)), { datasetId: dataset.id, revision: 3 });
    return Response.json({ success: false, error: 'Revision mismatch' }, { status: 409 });
  });
  assert.deepEqual(await listWorkbenchExperiments(dataset.ownerId), [{ ...record, id: 'workbench:saved', dataset_id: 'workbench:ds_example' }]);
  await assert.rejects(saveWorkbenchExperiment(dataset.ownerId, { datasetId: dataset.id, revision: 3 }), /revision changed/);
});
