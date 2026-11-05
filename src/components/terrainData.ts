import { Vector3 } from 'three';
import { earthPosition } from './atlasLines';
import metadata from '../data/worldpop-grid-2020.json';

export const densityColors = ['#EDF1ED', '#D5DED6', '#A9BAAC', '#799681', '#466B57', '#1F4334'];
export const terrainDefaults = { intensity: .85, smoothing: .65, contrast: 1, wireframe: true };
export const maxTerrainElevation = .12;
export interface TerrainPoint { latitude: number; longitude: number; density: number; height: number; position: Vector3 }
export interface DensityGrid { width: number; height: number; values: Float32Array; normalized: Float32Array; smoothed: Float32Array; edge: Float32Array }
export interface TerrainData {
  year: number; source: string; sourceUrl: string; license: string;
  points: TerrainPoint[]; featuredIndices: number[]; heightCap: number; grid: DensityGrid;
}
export interface TerrainView {
  data: TerrainData; intensity: number; smoothing: number; contrast: number; wireframe: boolean;
  highlight: number | null;
}
export interface TerrainReading { latitude: number; longitude: number; density: number | null; cell: number }
export function sourceCell(data: TerrainData, index: number): TerrainReading {
  const { width, height, values } = data.grid;
  const row = Math.floor(index / width), column = index % width;
  const value = values[index];
  return { latitude: 90 - (row + .5) * 180 / height, longitude: -180 + (column + .5) * 360 / width,
    density: Number.isFinite(value) ? value : null, cell: index };
}
export function sourceIndex(grid: DensityGrid, latitude: number, longitude: number) {
  const column = ((Math.floor((longitude + 180) / 360 * grid.width) % grid.width) + grid.width) % grid.width;
  const row = Math.max(0, Math.min(grid.height - 1, Math.floor((90 - latitude) / 180 * grid.height)));
  return row * grid.width + column;
}
// Diffusion only crosses adjacent valid cells. Missing cells remain missing and never become zero-density observations.
export function smoothDensity(grid: DensityGrid, passes = 12) {
  const { width, height, normalized, values } = grid;
  let current = normalized.slice(), next = current.slice();
  for (let pass = 0; pass < passes; pass++) {
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const i = row * width + col;
      if (!Number.isFinite(values[i])) continue;
      let sum = current[i] * 2, weight = 2;
      const neighbors = [row * width + (col + width - 1) % width, row * width + (col + 1) % width,
        row > 0 ? i - width : -1, row < height - 1 ? i + width : -1];
      for (const n of neighbors) if (n >= 0 && Number.isFinite(values[n])) { sum += current[n]; weight++; }
      next[i] = sum / weight;
    }
    [current, next] = [next, current];
  }
  return current;
}
export function sampleDisplay(grid: DensityGrid, latitude: number, longitude: number) {
  const { width, height, values, normalized, smoothed, edge } = grid;
  if (!Number.isFinite(values[sourceIndex(grid, latitude, longitude)])) return { raw: 0, smooth: 0, valid: 0 };
  const x = (longitude + 180) / 360 * width - .5, y = Math.max(0, Math.min(height - 1, (90 - latitude) / 180 * height - .5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let raw = 0, smooth = 0, weight = 0;
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const col = ((x0 + dx) % width + width) % width, row = Math.min(height - 1, y0 + dy);
    const i = row * width + col, w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
    if (!Number.isFinite(values[i])) continue;
    raw += normalized[i] * edge[i] * w; smooth += smoothed[i] * edge[i] * w; weight += w;
  }
  // Coverage tapers the displayed shape at data boundaries; it does not create density values there.
  return { raw, smooth, valid: weight };
}
export async function loadTerrainData(binary?: ArrayBuffer): Promise<TerrainData> {
  if (!binary) {
    const response = await fetch(new URL('../data/worldpop-grid-2020.bin', import.meta.url).href);
    if (!response.ok) throw new Error('Population grid unavailable');
    binary = await response.arrayBuffer();
  }
  if (binary.byteLength !== metadata.width * metadata.height * 4) throw new Error('Invalid population grid length');
  const view = new DataView(binary);
  const values = new Float32Array(metadata.width * metadata.height);
  for (let i = 0; i < values.length; i++) {
    const value = view.getFloat32(i * 4, true);
    if (!Number.isNaN(value) && (!Number.isFinite(value) || value < 0 || value >= 3.4e38)) throw new Error('Invalid population value');
    values[i] = value;
  }
  const positive = [...values].filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!positive.length) throw new Error('No positive population samples');
  const heightCap = positive[Math.floor((positive.length - 1) * .98)];
  const normalized = Float32Array.from(values, value => Number.isFinite(value) ? Math.log1p(Math.min(value, heightCap)) / Math.log1p(heightCap) : 0);
  const edge = new Float32Array(values.length);
  const { width, height } = metadata;
  // Ease the display to its neutral base within valid shore cells, never by assigning values to missing cells.
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const i = row * width + col;
    if (!Number.isFinite(values[i])) continue;
    let distance = 3;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const d = Math.abs(dx) + Math.abs(dy), yy = row + dy;
      if (d >= distance || yy < 0 || yy >= height) continue;
      if (!Number.isFinite(values[yy * width + (col + dx + width) % width])) distance = d;
    }
    edge[i] = distance === 1 ? .3 : distance === 2 ? .8 : 1;
  }
  const grid: DensityGrid = { width, height, values, normalized, smoothed: new Float32Array(), edge };
  grid.smoothed = smoothDensity(grid);
  const { default: sparse } = await import('../data/worldpop-density-2020.json');
  const points = sparse.points.map(([latitude, longitude]) => {
    const density = values[sourceIndex(grid, latitude, longitude)];
    if (!Number.isFinite(density)) throw new Error('Featured sample is missing in the restored raster');
    return { latitude, longitude, density,
      height: Math.log1p(Math.min(density, heightCap)) / Math.log1p(heightCap), position: earthPosition(latitude, longitude) };
  });
  const featuredIndices = points.map((point, index) => ({ index, density: point.density })).sort((a, b) => b.density - a.density).slice(0, 12).map(point => point.index);
  return { year: metadata.year, source: metadata.source, sourceUrl: metadata.sourceUrl, license: metadata.license, points, featuredIndices, heightCap, grid };
}
