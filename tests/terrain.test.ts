import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferGeometry, BufferAttribute, Euler, Group, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { loadTerrainData, sampleDisplay, sourceCell, sourceIndex, smoothDensity, terrainDefaults, type DensityGrid, type TerrainView } from '../src/components/terrainData';
import { createTerrainLayer } from '../src/components/terrainGeometry';
import { createTerrainSurface, pickTerrainSurface, surfaceVertex } from '../src/components/terrainSurface';
import { createCanvasTerrainLayer } from '../src/components/terrainCanvas';
import sparse from '../src/data/worldpop-density-2020.json';
import metadata from '../src/data/worldpop-grid-2020.json';
const bytes = await fs.readFile(new URL('../src/data/worldpop-grid-2020.bin', import.meta.url));
const data = await loadTerrainData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const view: TerrainView = { data, ...terrainDefaults, highlight: null };

test('restored grid preserves all source cells including zeros and explicit NoData', () => {
  const values = [...data.grid.values];
  assert.equal(values.filter(Number.isFinite).length, metadata.valid);
  assert.equal(values.filter(Number.isNaN).length, metadata.missing);
  assert.equal(values.filter(v => v === 0).length, metadata.zeros);
  for (const [lat, lon, original] of sparse.points) {
    const i = sourceIndex(data.grid, lat, lon);
    assert.ok(Math.abs(data.grid.values[i] - original) <= Math.max(1e-15, original * 1e-7)); // Legacy JSON rounded to eight significant digits.
    assert.equal(sourceCell(data, i).latitude, lat);
    assert.equal(sourceCell(data, i).longitude, lon);
  }
  const ocean = sourceIndex(data.grid, 0, -140);
  assert.equal(sourceCell(data, ocean).density, null);
  assert.deepEqual(sampleDisplay(data.grid, 0, -140), { raw: 0, smooth: 0, valid: 0 });
  const zero = values.indexOf(0);
  assert.equal(sourceCell(data, zero).density, 0);
  assert.equal(data.grid.normalized[zero], 0);
});

test('smoothing stays bounded, never fills missing cells or mutates source values', () => {
  const grid: DensityGrid = { width: 7, height: 1, values: Float32Array.from([0, 1, NaN, 100, 100, NaN, NaN]),
    normalized: Float32Array.from([0, .2, 0, 1, 1, 0, 0]), smoothed: new Float32Array(), edge: new Float32Array(7).fill(1) };
  const original = grid.values.slice();
  const result = smoothDensity(grid);
  assert.ok(result[0] > 0 && result[0] < .2);
  assert.equal(result[3], 1); assert.equal(result[4], 1);
  assert.equal(result[2], 0); assert.equal(result[5], 0);
  assert.deepEqual(grid.values, original);
  for (const v of data.grid.smoothed) assert.ok(v >= 0 && v <= 1);
});

test('spherical topology has closed seam, finite pole normals and bounded radial displacement', () => {
  const field = createTerrainSurface(data);
  assert.equal(field.raw.length, 361 * 181);
  const a = new Vector3(), b = new Vector3();
  for (let row = 0; row <= field.rows; row++) {
    const first = row * 361, last = first + 360;
    assert.equal(field.raw[first], field.raw[last]); assert.equal(field.smooth[first], field.smooth[last]);
    surfaceVertex(field, first, view, 1, a); surfaceVertex(field, last, view, 1, b);
    assert.ok(a.distanceTo(b) < 1e-12);
    a.fromArray(field.smoothNormals, first * 3); b.fromArray(field.smoothNormals, last * 3);
    assert.ok(a.distanceTo(b) < 1e-8);
  }
  for (let i = 0; i < field.raw.length; i++) {
    const length = surfaceVertex(field, i, view, 1, a).length();
    assert.ok(length > .9999999 && length < 1.120001);
    assert.ok(Math.abs(b.fromArray(field.smoothNormals, i * 3).length() - 1) < 1e-6);
    assert.ok(Math.abs(surfaceVertex(field, i, { ...view, intensity: 0 }, 1, a).length() - 1) < 1e-7);
  }
  assert.equal(createTerrainSurface(data, 180, 90).raw.length, 181 * 91);
});

test('surface picker matches full mesh raycasting after displacement, rotation, smoothing and transition', () => {
  const field = createTerrainSurface(data, 180, 90), tmp = new Vector3();
  for (const smoothing of [0, 1]) for (const blend of [.3, 1]) {
    const options = { ...view, smoothing, intensity: 1 };
    const vertices = new Float32Array(field.positions.length);
    for (let i = 0; i < field.raw.length; i++) surfaceVertex(field, i, options, blend, tmp).toArray(vertices, i * 3);
    const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(vertices, 3)); geometry.setIndex(field.indices);
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.quaternion.setFromEuler(new Euler(.45, -1.7, 0)); mesh.updateMatrixWorld(true);
    for (const [x, y] of [[0, 0], [.5, .4], [-.7, .2], [.98, .1], [1.04, 0], [-.3, -.8]]) {
      const ray = new Raycaster(new Vector3(x, y, 4), new Vector3(0, 0, -1));
      const hit = ray.intersectObject(mesh)[0];
      let expected: number | null = null;
      if (hit) {
        const p = mesh.worldToLocal(hit.point.clone()).normalize();
        expected = sourceIndex(data.grid, Math.asin(p.y) * 180 / Math.PI, Math.atan2(p.x, p.z) * 180 / Math.PI);
      }
      assert.equal(pickTerrainSurface(field, options, blend, mesh.quaternion, x, y), expected, `smoothing ${smoothing}, blend ${blend}, ray ${x}/${y}`);
    }
    geometry.dispose(); mesh.material.dispose();
  }
});

test('GPU layer keeps geometry during controls/mode changes, replaces LOD safely and disposes', () => {
  const group = new Group(), layer = createTerrainLayer(group);
  layer.draw(view, 1, 1440);
  const mesh = group.children.find(o => o instanceof Mesh) as Mesh;
  const geometry = mesh.geometry;
  let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
  layer.draw({ ...view, smoothing: 1, contrast: 2, intensity: 0, wireframe: false }, 1, 1440);
  assert.equal(mesh.geometry, geometry);
  layer.draw(null, 0, 1440); assert.equal(mesh.visible, false);
  layer.draw(view, 1, 1440); assert.equal(mesh.geometry, geometry);
  layer.draw(view, 1, 390); assert.equal(disposed, 1);
  assert.equal(mesh.geometry.getAttribute('position').count, 181 * 91);
  layer.dispose(); assert.equal(group.children.length, 0);
});

test('Canvas fallback draws connected faces and lines, not particles', () => {
  let faces = 0, lines = 0;
  const ctx = { beginPath() {}, moveTo() {}, lineTo() { lines++; }, closePath() {}, fill() { faces++; }, stroke() {} } as unknown as CanvasRenderingContext2D;
  const layer = createCanvasTerrainLayer();
  layer.draw(ctx, view, 1, new Quaternion(), 200, 200, 200);
  assert.ok(faces > 100); assert.ok(lines > faces * 2);
  assert.notEqual(layer.pick(view, 1, new Quaternion(), 0, 0), null);
  layer.dispose();
});

test('invalid binary sizes and infinities fail rather than silently inventing density', async () => {
  await assert.rejects(() => loadTerrainData(new ArrayBuffer(4)), /length/);
  const bad = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  new DataView(bad).setFloat32(0, Infinity, true);
  await assert.rejects(() => loadTerrainData(bad), /Invalid population value/);
});
