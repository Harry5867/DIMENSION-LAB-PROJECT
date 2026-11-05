import * as THREE from 'three';
import globeData from '../data/globe-data.json';
import { atlasLines, earthPosition } from './atlasLines';
import { createTerrainLayer } from './terrainGeometry';
import { type TerrainView } from './terrainData';
import { createCanvasTerrainLayer } from './terrainCanvas';

export const capitals = globeData.cities;
export type Capital = typeof capitals[number];

const capitalRoles: Partial<Record<number, string>> = globeData.capitalRoles;
export const capitalRole = (city: Capital) => capitalRoles[city.id];
export const hanoiIndex = capitals.findIndex(city => city.iso === 'VN' && city.city === 'Hanoi');

export const capitalPositions = capitals.map(city => earthPosition(city.latitude, city.longitude));

const featuredCountries = new Set([
  'CA', 'US', 'MX', 'CU', 'CO', 'BR', 'AR', 'GB', 'ES', 'FI', 'IS', 'EG',
  'SN', 'KE', 'ZA', 'SA', 'IN', 'CN', 'JP', 'VN', 'ID', 'AU', 'NZ', 'FJ',
]);
const featuredCityByCountry: Partial<Record<string, string>> = { JP: 'Tokyo', ZA: 'Pretoria' };
export const featuredCapitalIndices = capitals.flatMap(({ iso, city }, index) => {
  if (!iso || !featuredCountries.has(iso)) return [];
  const preferredCity = featuredCityByCountry[iso];
  return !preferredCity || city === preferredCity ? [index] : [];
});

type Coordinate = [latitude: number, longitude: number];
function coordinatePairs(flat: number[]): Coordinate[] {
  return Array.from({ length: flat.length / 2 }, (_, index) => [flat[index * 2], flat[index * 2 + 1]]);
}

// Mixed land/ocean cells approximate the coast using the existing dot map.
function mapCell([latitude, longitude]: Coordinate) {
  return Math.floor((latitude + 900) / 50) * 72 + Math.floor(((longitude + 1800) % 3600) / 50);
}

function spread<T>(items: T[], count: number) {
  const size = Math.min(count, items.length);
  return Array.from({ length: size }, (_, index) =>
    items[Math.floor((index + .5) * items.length / size)]);
}

const ocean = coordinatePairs(globeData.ocean);
const oceanCells = new Set(ocean.map(mapCell));
const coast: Coordinate[] = [];
const inland: Coordinate[] = [];
for (const point of coordinatePairs(globeData.land)) {
  (oceanCells.has(mapCell(point)) ? coast : inland).push(point);
}

const layers = [
  { coordinates: coast, land: true, desktop: 700, mobile: 460 },
  { coordinates: inland, land: true, desktop: 1300, mobile: 720 },
  { coordinates: ocean, land: false, desktop: 400, mobile: 220 },
];
const desktopOnly: Array<{ position: THREE.Vector3; land: boolean }> = [];
const mobileSamples = layers.flatMap(({ coordinates, land, desktop, mobile }) => {
  const desktopPoints = spread(coordinates, desktop);
  const mobilePoints = new Set(spread(desktopPoints, mobile));
  return desktopPoints.flatMap(point => {
    const sample = { position: earthPosition(point[0] / 10, point[1] / 10), land };
    if (mobilePoints.has(point)) return [sample];
    desktopOnly.push(sample);
    return [];
  });
});
const samples = mobileSamples.concat(desktopOnly);
const sparseCount = mobileSamples.length;

export const atlasLayerNames = {
  particles: 'Particles',
  grid: 'Geographic Grid',
  borders: 'Country Borders',
  labels: 'Capital Labels',
  flags: 'Capital Flags',
};
export type AtlasLayers = Record<keyof typeof atlasLayerNames, boolean>;

const gridColor = '#D8DDDA';
const borderColor = '#C8CECA';

interface EarthRenderer {
  frameInterval: number;
  resize: (width: number, height: number, centerX: number) => void;
  draw: (orientation: THREE.Quaternion, radius: number, highlight: THREE.Vector3 | null, layers: AtlasLayers, detailed: boolean, terrain: TerrainView | null, terrainBlend: number) => void;
  dispose: () => void;
  pickTerrain: (view: TerrainView, blend: number, orientation: THREE.Quaternion, x: number, y: number) => number | null;
}

function createLineLayer(vertices: Float32Array, color: string, opacity: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying float facing;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        facing = world.z;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying float facing;
      void main() {
        if (facing <= 0.0) discard;
        gl_FragColor = vec4(color, opacity * smoothstep(0.0, 0.16, facing));
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.LineSegments(geometry, material);
}

export function createEarthRenderer(container: HTMLElement): EarthRenderer {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, powerPreference: 'low-power' });
  } catch {
    return createCanvasRenderer(container);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(samples.flatMap(point => point.position.toArray()), 3));
  geometry.setAttribute('land', new THREE.Float32BufferAttribute(samples.map(point => Number(point.land)), 1));
  const uniforms = {
    dotSize: { value: 2 },
    highlight: { value: new THREE.Vector3() },
    highlighting: { value: 0 },
    layerOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float land;
      uniform float dotSize;
      uniform vec3 highlight;
      uniform float highlighting;
      uniform float layerOpacity;
      varying float opacity;
      varying vec3 color;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float front = smoothstep(-0.08, 0.27, world.z);
        float depth = max(world.z, 0.0);
        float nearCity = 1.0 - smoothstep(0.03, 0.22, distance(position, highlight));
        opacity = mix(0.035, mix(0.24, 0.90, depth), front);
        opacity *= mix(0.42, 1.0, land) * (1.0 - highlighting * nearCity * 0.42) * layerOpacity;
        color = mix(vec3(0.72), vec3(0.290, 0.310, 0.298), land * front);
        gl_PointSize = max(1.0, dotSize * mix(0.66, 1.0, land) * mix(0.72, 1.12, depth));
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying float opacity;
      varying vec3 color;
      void main() {
        float coverage = 1.0 - smoothstep(0.30, 0.50, distance(gl_PointCoord, vec2(0.5)));
        gl_FragColor = vec4(color, opacity * coverage);
      }
    `,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 8);
  camera.position.z = 4;
  const particles = new THREE.Points(geometry, material);
  const grid = createLineLayer(atlasLines.grid, gridColor, .30);
  const detail = createLineLayer(atlasLines.detail, gridColor, .26);
  const borders = createLineLayer(atlasLines.borders, borderColor, .58);
  const globe = new THREE.Group();
  particles.renderOrder = 1;
  globe.add(grid, detail, borders, particles);
  const terrainLayer = createTerrainLayer(globe);
  scene.add(globe);
  container.append(renderer.domElement);
  let width = 1, height = 1, centerX = .5, pixelRatio = 1;
  return {
    frameInterval: 0,
    resize(w, h, x) {
      width = w;
      height = h;
      centerX = x;
      pixelRatio = Math.min(window.devicePixelRatio || 1, width < 520 ? 1.5 : 1.75);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(w, h, false);
      geometry.setDrawRange(0, width < 520 ? sparseCount : samples.length);
    },
    draw(orientation, radius, highlight, layers, detailed, terrain, terrainBlend) {
      const halfHeight = height / (radius * 2);
      camera.left = -centerX / radius;
      camera.right = (width - centerX) / radius;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      globe.quaternion.copy(orientation);
      particles.visible = layers.particles && terrainBlend < 1;
      grid.visible = layers.grid && !detailed && terrainBlend < 1;
      detail.visible = layers.grid && detailed && terrainBlend < 1;
      borders.visible = layers.borders;
      grid.material.uniforms.opacity.value = .30 * (1 - terrainBlend);
      detail.material.uniforms.opacity.value = .26 * (1 - terrainBlend);
      borders.material.uniforms.opacity.value = detailed ? .68 : .52;
      uniforms.dotSize.value = Math.max(1.6, Math.min(4.6, radius * .011)) * pixelRatio;
      uniforms.highlighting.value = highlight ? 1 : 0;
      uniforms.layerOpacity.value = 1 - terrainBlend;
      if (highlight) uniforms.highlight.value.copy(highlight);
      terrainLayer.draw(terrain, terrainBlend, width);
      renderer.render(scene, camera);
    },
    pickTerrain: (view, blend, orientation, x, y) => terrainLayer.pick(view, blend, orientation, x, y, width),
    dispose() {
      geometry.dispose();
      material.dispose();
      terrainLayer.dispose();
      for (const layer of [grid, detail, borders]) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function createCanvasRenderer(container: HTMLElement): EarthRenderer {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  container.append(canvas);
  let width = 1, height = 1, centerX = .5;
  const point = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const terrainLayer = createCanvasTerrainLayer();
  function drawLines(vertices: Float32Array, orientation: THREE.Quaternion, radius: number, color: string, opacity: number) {
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    for (let index = 0; index < vertices.length; index += 6) {
      start.fromArray(vertices, index).applyQuaternion(orientation);
      end.fromArray(vertices, index + 3).applyQuaternion(orientation);
      if (start.z <= 0 && end.z <= 0) continue;
      if (start.z < 0) start.lerp(end, -start.z / (end.z - start.z));
      if (end.z < 0) end.lerp(start, -end.z / (start.z - end.z));
      ctx.moveTo(centerX + start.x * radius, height / 2 - start.y * radius);
      ctx.lineTo(centerX + end.x * radius, height / 2 - end.y * radius);
    }
    ctx.stroke();
  }
  return {
    frameInterval: 1000 / 30,
    resize(w, h, x) {
      width = w;
      height = h;
      centerX = x;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    },
    draw(orientation, radius, highlight, layers, detailed, terrain, terrainBlend) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (layers.grid && terrainBlend < 1) drawLines(detailed ? atlasLines.detail : atlasLines.grid, orientation, radius, gridColor,
        (detailed ? .26 : .30) * (1 - terrainBlend));
      if (layers.borders) drawLines(atlasLines.borders, orientation, radius, borderColor, detailed ? .68 : .52);
      const count = layers.particles && terrainBlend < 1 ? (width < 520 ? sparseCount : samples.length) : 0;
      for (let i = 0; i < count; i++) {
        const sample = samples[i];
        point.copy(sample.position).applyQuaternion(orientation);
        const depth = Math.max(point.z, 0);
        const dim = highlight && sample.position.distanceToSquared(highlight) < .04 ? .65 : 1;
        const frontOpacity = sample.land ? .22 + depth * .63 : .2 + depth * .6;
        ctx.globalAlpha = (point.z < 0 ? .03 : frontOpacity) * (sample.land ? 1 : .36) * dim * (1 - terrainBlend);
        ctx.fillStyle = sample.land && point.z >= 0 ? '#4A4F4C' : '#b8b8b8';
        ctx.beginPath();
        ctx.arc(centerX + point.x * radius, height / 2 - point.y * radius, Math.max(.55, radius * .005) * (.72 + .4 * depth) * (sample.land ? 1 : .66), 0, Math.PI * 2);
        ctx.fill();
      }
      if (terrain && terrainBlend > 0) terrainLayer.draw(ctx, terrain, terrainBlend, orientation, radius, centerX, height / 2);
      ctx.globalAlpha = 1;
    },
    pickTerrain: (view, blend, orientation, x, y) => terrainLayer.pick(view, blend, orientation, x, y),
    dispose() { terrainLayer.dispose(); canvas.remove(); },
  };
}
