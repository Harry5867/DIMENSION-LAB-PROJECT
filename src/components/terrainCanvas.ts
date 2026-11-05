import { Color, Quaternion, Vector3 } from 'three';
import { densityColors, type TerrainData, type TerrainView } from './terrainData';
import { createTerrainSurface, pickTerrainSurface, surfaceVertex, type TerrainSurface } from './terrainSurface';

// Low-resolution Canvas fallback uses the same density field and displacement as WebGL.
export function createCanvasTerrainLayer() {
  let data: TerrainData | undefined, field: TerrainSurface;
  let projected: Float32Array, values: Float32Array;
  let faces: Array<{ a: number; b: number; c: number; z: number }>;
  const position = new Vector3();
  const colors = densityColors.map(color => new Color(color));
  const ramp = Array.from({ length: 256 }, (_, index) => {
    const t = index / 255 * 5, lo = Math.min(4, Math.floor(t));
    return colors[lo].clone().lerp(colors[lo + 1], t - lo).getStyle();
  });
  function prepare(view: TerrainView) {
    if (data === view.data) return;
    data = view.data; field = createTerrainSurface(data, 90, 45);
    projected = new Float32Array(field.raw.length * 3); values = new Float32Array(field.raw.length);
    faces = [];
    for (let i = 0; i < field.indices.length; i += 3) faces.push({ a: field.indices[i], b: field.indices[i + 1], c: field.indices[i + 2], z: 0 });
  }
  return {
    draw(ctx: CanvasRenderingContext2D, view: TerrainView, blend: number, orientation: Quaternion, radius: number, centerX: number, centerY: number) {
      prepare(view);
      for (let i = 0; i < field.raw.length; i++) {
        surfaceVertex(field, i, view, blend, position).applyQuaternion(orientation);
        projected[i * 3] = centerX + position.x * radius;
        projected[i * 3 + 1] = centerY - position.y * radius;
        projected[i * 3 + 2] = position.z;
        values[i] = field.raw[i] + (field.smooth[i] - field.raw[i]) * view.smoothing;
      }
      for (const face of faces) face.z = projected[face.a * 3 + 2] + projected[face.b * 3 + 2] + projected[face.c * 3 + 2];
      faces.sort((a, b) => a.z - b.z);
      ctx.globalAlpha = blend;
      for (const face of faces) {
        const a = face.a * 3, b = face.b * 3, c = face.c * 3;
        if (face.z <= 0 || (projected[b] - projected[a]) * (projected[c + 1] - projected[a + 1]) - (projected[b + 1] - projected[a + 1]) * (projected[c] - projected[a]) >= 0) continue;
        const value = (values[face.a] + values[face.b] + values[face.c]) / 3;
        const present = (field.valid[face.a] + field.valid[face.b] + field.valid[face.c]) / 3;
        ctx.fillStyle = present > .25 ? ramp[Math.round(Math.pow(value, 1 / view.contrast) * 255)] : '#f5f7f4';
        ctx.beginPath(); ctx.moveTo(projected[a], projected[a + 1]); ctx.lineTo(projected[b], projected[b + 1]); ctx.lineTo(projected[c], projected[c + 1]); ctx.closePath(); ctx.fill();
      }
      if (view.wireframe) {
        ctx.globalAlpha = blend * .38; ctx.strokeStyle = '#6e8474'; ctx.lineWidth = .65; ctx.beginPath();
        for (let i = 0; i < field.lines.length; i += 2) {
          const a = field.lines[i] * 3, b = field.lines[i + 1] * 3;
          if (projected[a + 2] <= .06 || projected[b + 2] <= .06) continue;
          ctx.moveTo(projected[a], projected[a + 1]); ctx.lineTo(projected[b], projected[b + 1]);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    pick(view: TerrainView, blend: number, orientation: Quaternion, x: number, y: number) {
      prepare(view); return pickTerrainSurface(field, view, blend, orientation, x, y);
    },
    dispose() { data = undefined; },
  };
}
