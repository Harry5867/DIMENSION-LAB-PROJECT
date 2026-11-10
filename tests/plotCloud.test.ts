import assert from 'node:assert/strict';
import test from 'node:test';
import { Color, Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import { createPlotCloud, makePlotColors, matchPlotRows } from '../src/components/plotCloud';
import { createPlotViewCamera } from '../src/components/plotViewCamera';
import type { DataPoint } from '../src/types';

const point = (rowIndex: number, x: number, cluster = 0): DataPoint => ({
  id: 'duplicate CSV ID', rowIndex, x, y: 0, z: 0, cluster, originalFeatures: {},
});

test('the same mesh morphs by source row and recolors points without moving them again', async () => {
  const scene = new Scene();
  const cloud = createPlotCloud(scene);
  const before = [point(2, -24), point(4, 24, 1)];
  const after = [point(4, 8), point(2, -4, 1)];
  const beforeColors = before.map(makePlotColors(before, 'cluster', undefined, false).forPoint);
  const afterColors = after.map(makePlotColors(after, 'cluster', undefined, false).forPoint);
  const matrix = new Matrix4();
  cloud.sync(before, beforeColors, .48, null);
  const mesh = cloud.mesh!;
  const xAt = (index: number) => {
    mesh.getMatrixAt(index, matrix);
    return new Vector3().setFromMatrixPosition(matrix).x;
  };
  try {
    assert.deepEqual(matchPlotRows(before, after), [1, 0]);
    let eased = 0;
    const pending = cloud.stage(after, afterColors, true, new AbortController().signal, () => null, t => { eased = t; });
    const time = performance.now();
    cloud.tick(time + 425);
    assert.ok(Math.abs(xAt(0) - (-14)) < 1);
    assert.ok(Math.abs(xAt(1) - 16) < 1);
    assert.ok(Math.abs(eased - .5) < .1);
    assert.equal(cloud.mesh, mesh);
    assert.equal(scene.children.length, 1);
    cloud.tick(time + 1000);
    await pending;
    assert.equal(eased, 1);
    cloud.sync(after, afterColors, .48, null);
    assert.deepEqual([xAt(0), xAt(1)], [8, -4]);

    const swappedColors = [...afterColors].reverse();
    const recolored = cloud.stage(after, swappedColors, true, new AbortController().signal, () => null);
    cloud.tick(performance.now() + 425);
    assert.deepEqual([xAt(0), xAt(1)], [8, -4]);
    const blended = new Color();
    mesh.getColorAt(0, blended);
    const midpoint = new Color(afterColors[0]).lerp(new Color(swappedColors[0]), .5);
    assert.ok(Math.abs(blended.r - midpoint.r) < .01);
    cloud.tick(performance.now() + 1000);
    await recolored;
    assert.equal(cloud.mesh, mesh);
  } finally {
    cloud.destroy();
  }
});

test('changing datasets fades even when row indices overlap and abort restores the previous cloud', async () => {
  const scene = new Scene();
  const cloud = createPlotCloud(scene);
  const before = [point(2, -24), point(4, 24)];
  const after = [point(2, -8), point(4, 8)];
  const colors = ['#7788aa', '#aa8877'];
  cloud.sync(before, colors, .48, null);
  const source = cloud.mesh!;
  const abort = new AbortController();
  try {
    assert.equal(matchPlotRows(before, [point(2, 0), point(2, 1)]), null);
    const pending = cloud.stage(after, colors, false, abort.signal, () => null);
    cloud.tick(performance.now() + 125);
    assert.equal(scene.children.length, 2);
    assert.ok(source.material.opacity > 0 && source.material.opacity < 1);
    abort.abort();
    await pending;
    assert.equal(cloud.mesh, source);
    assert.equal(cloud.pickMesh, source);
    assert.equal(source.material.opacity, 1);
    assert.deepEqual(scene.children, [source]);
    const next = cloud.stage(after, colors, false, new AbortController().signal, () => null);
    cloud.tick(performance.now() + 350);
    await next;
    assert.notEqual(cloud.mesh, source);
    assert.equal(cloud.pickMesh, undefined, 'the incoming cloud becomes pickable only when its rows commit');
    cloud.sync(after, colors, .48, null);
    assert.equal(cloud.pickMesh, cloud.mesh);
    assert.deepEqual(scene.children, [cloud.mesh]);
  } finally {
    cloud.destroy();
  }
});

test('pointer tilt preserves the orbit pose and zoom and settles for primary interactions', () => {
  const orbit = new PerspectiveCamera(45, 1.4, .1, 1000);
  const target = new Vector3(5, -3, 8);
  orbit.position.set(60, 42, 76);
  orbit.lookAt(target);
  orbit.zoom = 1.2;
  orbit.updateProjectionMatrix();
  const initialPosition = orbit.position.clone(), initialOrientation = orbit.quaternion.clone();
  const view = createPlotViewCamera(orbit, target);

  view.setPointer(1, -1);
  view.update(.3, false, false);
  const hoverOffset = view.camera.position.distanceTo(initialPosition);
  assert.ok(hoverOffset > 0);
  assert.ok(Math.abs(view.camera.position.distanceTo(target) - orbit.position.distanceTo(target)) < 1e-9);
  assert.ok(view.camera.projectionMatrix.equals(orbit.projectionMatrix));
  assert.ok(orbit.position.equals(initialPosition));
  assert.ok(orbit.quaternion.equals(initialOrientation));

  view.update(.12, false, true);
  const settlingOffset = view.camera.position.distanceTo(initialPosition);
  assert.ok(settlingOffset > 0 && settlingOffset < hoverOffset);
  view.setPointer(0, 0);
  view.update(2, false, false);
  assert.ok(view.camera.position.equals(initialPosition));

  view.setPointer(1, 1);
  view.update(.3, false, false);
  view.update(0, true, false);
  assert.ok(view.camera.position.equals(initialPosition));
  assert.ok(view.camera.quaternion.equals(initialOrientation));
});
