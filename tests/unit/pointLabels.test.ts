import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataPoint } from '@dimension-lab/contracts';
import { MAX_STATIC_POINT_LABELS, visiblePointLabels } from '../../frontend/src/features/visualization/scene/pointLabels';

function point(rowIndex: number, label?: DataPoint['label']): DataPoint {
  return { id: rowIndex, rowIndex, label, x: 0, y: 0, z: 0, cluster: 0, originalFeatures: {} };
}

test('all non-empty dataset labels are shown for smaller datasets', () => {
  const points = [point(0, 'M'), point(1, 'B'), point(2, null)];
  assert.deepEqual(visiblePointLabels(points, null, null), [points[0], points[1]]);
});

test('large datasets only show labels for hovered and selected rows', () => {
  const points = Array.from({ length: MAX_STATIC_POINT_LABELS + 1 }, (_, index) =>
    point(index, index % 2 ? 'class-a' : 'class-b'));
  const hovered = point(7, 'class-a');
  const selected = point(150, 'class-b');
  assert.deepEqual(visiblePointLabels(points, hovered, selected), [points[7], points[150]]);
  assert.deepEqual(visiblePointLabels(points, null, null), []);
});
