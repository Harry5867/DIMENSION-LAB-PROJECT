import { Quaternion, Ray, Vector3 } from 'three';
import { earthPosition } from './atlasLines';
import { maxTerrainElevation, sampleDisplay, sourceIndex, type TerrainData, type TerrainView } from './terrainData';

export interface TerrainSurface {
  columns: number; rows: number; positions: Float32Array; raw: Float32Array; smooth: Float32Array;
  valid: Float32Array; indices: number[]; lines: number[];
  rawNormals: Float32Array; smoothNormals: Float32Array;
}
export function createTerrainSurface(data: TerrainData, columns = 360, rows = 180): TerrainSurface {
  const count = (columns + 1) * (rows + 1);
  const positions = new Float32Array(count * 3), raw = new Float32Array(count), smooth = new Float32Array(count), valid = new Float32Array(count);
  const indices: number[] = [], lines: number[] = [];
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const i = row * (columns + 1) + col;
    const latitude = 90 - row / rows * 180, longitude = col === columns ? -180 : -180 + col / columns * 360;
    earthPosition(latitude, longitude).toArray(positions, i * 3);
    const sample = sampleDisplay(data.grid, latitude, longitude);
    raw[i] = sample.raw; smooth[i] = sample.smooth; valid[i] = sample.valid;
    if (row < rows && col < columns) {
      const a = i, b = a + 1, c = a + columns + 1, d = c + 1;
      if (row > 0) indices.push(a, c, b);
      if (row < rows - 1) indices.push(b, c, d);
    }
    const stride = columns >= 360 ? 2 : 1;
    const latitudeStride = Math.abs(latitude) > 75 ? stride * 4 : Math.abs(latitude) > 60 ? stride * 2 : stride;
    if (col < columns && row > 0 && row < rows && row % stride === 0) lines.push(i, i + 1);
    if (row < rows && col < columns && col % latitudeStride === 0) lines.push(i, i + columns + 1);
  }
  function normals(heights: Float32Array) {
    const result = new Float32Array(count * 3);
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3();
    for (let t = 0; t < indices.length; t += 3) {
      const ia = indices[t], ib = indices[t + 1], ic = indices[t + 2];
      a.fromArray(positions, ia * 3).multiplyScalar(1 + heights[ia] * maxTerrainElevation);
      b.fromArray(positions, ib * 3).multiplyScalar(1 + heights[ib] * maxTerrainElevation);
      c.fromArray(positions, ic * 3).multiplyScalar(1 + heights[ic] * maxTerrainElevation);
      normal.crossVectors(b.sub(a), c.sub(a));
      for (const i of [ia, ib, ic]) { result[i * 3] += normal.x; result[i * 3 + 1] += normal.y; result[i * 3 + 2] += normal.z; }
    }
    for (let row = 0; row <= rows; row++) {
      const a = row * (columns + 1) * 3, b = (row * (columns + 1) + columns) * 3;
      for (let axis = 0; axis < 3; axis++) result[a + axis] = result[b + axis] = result[a + axis] + result[b + axis];
    }
    for (let i = 0; i < count; i++) {
      if (i <= columns || i >= rows * (columns + 1)) normal.set(0, i <= columns ? 1 : -1, 0);
      else normal.fromArray(result, i * 3).normalize();
      normal.toArray(result, i * 3);
    }
    return result;
  }
  return { columns, rows, positions, raw, smooth, valid, indices, lines, rawNormals: normals(raw), smoothNormals: normals(smooth) };
}
export function surfaceVertex(surface: TerrainSurface, index: number, view: TerrainView, blend: number, target: Vector3) {
  const height = surface.raw[index] + (surface.smooth[index] - surface.raw[index]) * view.smoothing;
  return target.fromArray(surface.positions, index * 3).multiplyScalar(1 + height * maxTerrainElevation * view.intensity * blend);
}
// Traverse the small portion of the spherical grid crossed by the ray through its elevation shell.
// Triangle tests use the exact same vertex heights and transition blend as the GPU, including near the limb.
export function pickTerrainSurface(surface: TerrainSurface, view: TerrainView, blend: number, orientation: Quaternion, x: number, y: number) {
  const extent = 1 + maxTerrainElevation * view.intensity * blend;
  const r2 = x * x + y * y;
  if (r2 > extent * extent) return null;
  const top = Math.sqrt(extent * extent - r2), bottom = r2 < 1 ? Math.sqrt(1 - r2) - .003 : -top;
  const inverse = orientation.clone().invert();
  const ray = new Ray(new Vector3(x, y, 4).applyQuaternion(inverse), new Vector3(0, 0, -1).applyQuaternion(inverse));
  const probe = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
  const candidates = new Set<number>();
  const { columns, rows } = surface;
  for (let step = 0; step <= 96; step++) {
    probe.set(x, y, top + (bottom - top) * step / 96).applyQuaternion(inverse).normalize();
    const lat = Math.asin(Math.max(-1, Math.min(1, probe.y))) * 180 / Math.PI;
    const lon = Math.atan2(probe.x, probe.z) * 180 / Math.PI;
    const row = Math.floor((90 - lat) / 180 * rows), col = Math.floor((lon + 180) / 360 * columns);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = row + dy, xx = (col + dx + columns) % columns;
      if (yy >= 0 && yy < rows) candidates.add(yy * columns + xx);
    }
  }
  let nearest = Infinity;
  const position = new Vector3();
  function triangle(ia: number, ib: number, ic: number) {
    surfaceVertex(surface, ia, view, blend, a); surfaceVertex(surface, ib, view, blend, b); surfaceVertex(surface, ic, view, blend, c);
    if (!ray.intersectTriangle(a, b, c, true, hit)) return;
    const distance = ray.origin.distanceToSquared(hit);
    if (distance < nearest) { nearest = distance; position.copy(hit); }
  }
  for (const cell of candidates) {
    const row = Math.floor(cell / columns), col = cell % columns;
    const i = row * (columns + 1) + col, down = i + columns + 1;
    if (row > 0) triangle(i, down, i + 1);
    if (row < rows - 1) triangle(i + 1, down, down + 1);
  }
  if (!Number.isFinite(nearest)) return null;
  position.normalize();
  return sourceIndex(view.data.grid, Math.asin(Math.max(-1, Math.min(1, position.y))) * 180 / Math.PI, Math.atan2(position.x, position.z) * 180 / Math.PI);
}
