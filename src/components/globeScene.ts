import * as THREE from 'three';
import globeData from '../data/globe-data.json';
import { atlasLines, earthPosition } from './atlasLines';
import { createTerrainLayer } from './terrainGeometry';
import { type TerrainView } from './terrainData';
import { createCanvasTerrainLayer } from './terrainCanvas';
import { constellationGraph, type GlobeHover } from './globeInteraction';
import { createStoryEarth, createCanvasStoryEarth } from './storyEarth';
import { atlasParticleFragment, atlasParticleStyle, atlasScanStyle } from './genesisParticles';
import { genesisEase, genesisScanCoordinate, type GenesisFrame } from '../visuals/welcomeGenesis';

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

type AtlasReveal = Pick<GenesisFrame, 'scan' | 'scanGlow' | 'grid' | 'borders'>;

interface EarthRenderer {
  kind: 'webgl' | 'canvas';
  canvas: HTMLCanvasElement;
  failed: () => boolean;
  needsRedraw: () => boolean;
  frameInterval: number;
  resize: (width: number, height: number, centerX: number) => void;
  draw: (orientation: THREE.Quaternion, radius: number, highlight: THREE.Vector3 | null, layers: AtlasLayers, detailed: boolean, terrain: TerrainView | null, terrainBlend: number, hover?: GlobeHover | null, theme?: 'light' | 'dark', stories?: boolean, reveal?: AtlasReveal) => void;
  dispose: () => void;
  pickTerrain: (view: TerrainView, blend: number, orientation: THREE.Quaternion, x: number, y: number) => number | null;
}

function createLineLayer(vertices: Float32Array, color: string, opacity: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, scan: { value: 1.16 } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 surface;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        surface = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity, scan;
      varying vec3 surface;
      ${atlasScanStyle}
      void main() {
        if (surface.z <= 0.0) discard;
        float visible = scanReveal(scanCoordinate(surface), scan);
        gl_FragColor = vec4(color, opacity * smoothstep(0.0, 0.16, surface.z) * visible);
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.LineSegments(geometry, material);
}

export function createEarthRenderer(container: HTMLElement, forceCanvas = false): EarthRenderer {
  if (forceCanvas) return createCanvasRenderer(container);
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
    dark: { value: 0 },
    scan: { value: 1.16 },
    scanGlow: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float land;
      uniform float dotSize;
      uniform vec3 highlight;
      uniform float highlighting;
      uniform float layerOpacity;
      uniform float dark, scan, scanGlow;
      varying float opacity;
      varying vec3 color;
      ${atlasParticleStyle}
      ${atlasScanStyle}
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float front = smoothstep(-0.08, 0.27, world.z);
        float depth = max(world.z, 0.0);
        float nearCity = 1.0 - smoothstep(0.03, 0.22, distance(position, highlight));
        float coord = scanCoordinate(world.xyz);
        float reveal = scanReveal(coord, scan);
        float glow = scanGlow * front * (1.0 - smoothstep(0.0, .14, abs(scan - coord)));
        opacity = atlasOpacity(land, front, depth) * (1.0 - highlighting * nearCity * .42) * layerOpacity * mix(.16, 1.0, reveal);
        opacity = mix(opacity, .92, glow * .76);
        color = atlasColor(land, front, dark);
        color = mix(color, mix(vec3(0.0,.47,.41), vec3(.65,.98,.86),dark), glow);
        gl_PointSize = atlasSize(land, depth, dotSize) * (1.0 + glow * .38);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: atlasParticleFragment,
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
  const storyEarth = createStoryEarth(globe);
  const nodePositions = new Float32Array(8 * 3), edgePositions = new Float32Array(12 * 6);
  const nodeGeometry = new THREE.BufferGeometry(), edgeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3).setUsage(THREE.DynamicDrawUsage));
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const nodeMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false,
    uniforms: { size: { value: 9 }, color: { value: new THREE.Color(0, .478, .431) } },
    vertexShader: 'uniform float size; void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=size; }',
    fragmentShader: 'uniform vec3 color; void main(){ float d=distance(gl_PointCoord,vec2(.5)); float a=1.0-smoothstep(.08,.5,d); gl_FragColor=vec4(color,a*.8); }',
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: '#007a6e', transparent: true, opacity: .38, depthWrite: false, depthTest: false });
  const hoverNodes = new THREE.Points(nodeGeometry, nodeMaterial), hoverEdges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  hoverNodes.frustumCulled = hoverEdges.frustumCulled = false;
  hoverNodes.renderOrder = 4; hoverEdges.renderOrder = 3;
  globe.add(hoverNodes, hoverEdges);
  scene.add(globe);
  container.append(renderer.domElement);
  let width = 1, height = 1, centerX = .5, pixelRatio = 1;
  let colorTheme: 'light' | 'dark' = 'light';
  let shaderFailed = false;
  const defaultShaderError = renderer.debug.onShaderError;
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    shaderFailed = true;
    defaultShaderError?.(gl, program, vertex, fragment);
  };
  return {
    kind: 'webgl',
    canvas: renderer.domElement,
    failed: () => shaderFailed || renderer.getContext().isContextLost(),
    needsRedraw: storyEarth.needsRedraw,
    frameInterval: 0,
    resize(w, h, x) {
      width = w;
      height = h;
      centerX = x;
      pixelRatio = Math.min(window.devicePixelRatio || 1, width < 520 ? 1.5 : 1.75);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      geometry.setDrawRange(0, width < 520 ? sparseCount : samples.length);
    },
    draw(orientation, radius, highlight, layers, detailed, terrain, terrainBlend, hover = null, theme = 'light', stories = false, reveal) {
      if (theme !== colorTheme) {
        colorTheme = theme;
        const dark = theme === 'dark';
        uniforms.dark.value = Number(dark);
        grid.material.uniforms.color.value.set(dark ? '#739581' : gridColor);
        detail.material.uniforms.color.value.set(dark ? '#739581' : gridColor);
        borders.material.uniforms.color.value.set(dark ? '#a2bba9' : borderColor);
        edgeMaterial.color.set(dark ? '#91d1bd' : '#007a6e');
        nodeMaterial.uniforms.color.value.setRGB(dark ? .569 : 0, dark ? .820 : .478, dark ? .741 : .431);
      }
      camera.left = -centerX / radius;
      camera.right = (width - centerX) / radius;
      camera.top = height / (2 * radius);
      camera.bottom = -camera.top;
      camera.updateProjectionMatrix();
      globe.quaternion.copy(orientation);
      storyEarth.draw(stories);
      particles.visible = !stories && layers.particles && terrainBlend < 1;
      grid.visible = !stories && layers.grid && !detailed && terrainBlend < 1;
      detail.visible = !stories && layers.grid && detailed && terrainBlend < 1;
      borders.visible = !stories && layers.borders;
      grid.material.uniforms.opacity.value = .30 * (1 - terrainBlend) * (reveal?.grid ?? 1);
      detail.material.uniforms.opacity.value = .26 * (1 - terrainBlend) * (reveal?.grid ?? 1);
      borders.material.uniforms.opacity.value = (detailed ? .68 : .52) * (reveal?.borders ?? 1);
      const scan = reveal?.scan ?? 1.16;
      grid.material.uniforms.scan.value = detail.material.uniforms.scan.value = borders.material.uniforms.scan.value = uniforms.scan.value = scan;
      uniforms.scanGlow.value = reveal?.scanGlow ?? 0;
      uniforms.dotSize.value = Math.max(1.6, Math.min(4.6, radius * .011)) * pixelRatio;
      uniforms.highlighting.value = highlight ? 1 : 0;
      uniforms.layerOpacity.value = 1 - terrainBlend;
      if (highlight) uniforms.highlight.value.copy(highlight);
      terrainLayer.draw(terrain, stories ? 0 : terrainBlend, width);
      if (reveal) {
        hoverNodes.visible = hoverEdges.visible = false;
        renderer.render(scene, camera);
        return;
      }
      const graph = constellationGraph(samples, orientation, !stories && layers.particles && terrainBlend === 0 ? hover : null, radius, width < 520 ? sparseCount : samples.length);
      graph.nodes.forEach((node, index) => samples[node.index].position.toArray(nodePositions, index * 3));
      graph.edges.forEach(([a, b], index) => {
        samples[graph.nodes[a].index].position.toArray(edgePositions, index * 6);
        samples[graph.nodes[b].index].position.toArray(edgePositions, index * 6 + 3);
      });
      nodeGeometry.setDrawRange(0, graph.nodes.length); edgeGeometry.setDrawRange(0, graph.edges.length * 2);
      hoverNodes.visible = graph.nodes.length > 0; hoverEdges.visible = graph.edges.length > 0;
      if (graph.nodes.length) nodeGeometry.attributes.position.needsUpdate = true;
      if (graph.edges.length) edgeGeometry.attributes.position.needsUpdate = true;
      nodeMaterial.uniforms.size.value = 9 * pixelRatio;
      renderer.render(scene, camera);
    },
    pickTerrain: (view, blend, orientation, x, y) => terrainLayer.pick(view, blend, orientation, x, y, width),
    dispose() {
      geometry.dispose();
      material.dispose();
      terrainLayer.dispose();
      storyEarth.dispose();
      nodeGeometry.dispose(); edgeGeometry.dispose(); nodeMaterial.dispose(); edgeMaterial.dispose();
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
  function sizeCanvas(w: number, h: number, maxRatio = 1.5) {
    const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  const point = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const terrainLayer = createCanvasTerrainLayer();
  const storyEarth = createCanvasStoryEarth();
  function drawLines(vertices: Float32Array, orientation: THREE.Quaternion, radius: number, color: string, opacity: number, x: number, y: number, scan: number) {
    if (!ctx || opacity <= 0) return;
    ctx.strokeStyle = color;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    for (let index = 0; index < vertices.length; index += 6) {
      start.fromArray(vertices, index).applyQuaternion(orientation);
      end.fromArray(vertices, index + 3).applyQuaternion(orientation);
      if (start.z <= 0 && end.z <= 0) continue;
      if (start.z < 0) start.lerp(end, -start.z / (end.z - start.z));
      if (end.z < 0) end.lerp(start, -end.z / (start.z - end.z));
      if (scan < 1) {
        const a = genesisScanCoordinate(start.x, start.z), b = genesisScanCoordinate(end.x, end.z);
        if (a > scan && b > scan) continue;
        if (a > scan) start.lerp(end, (a - scan) / (a - b));
        if (b > scan) end.lerp(start, (b - scan) / (b - a));
      }
      ctx.moveTo(x + start.x * radius, y - start.y * radius);
      ctx.lineTo(x + end.x * radius, y - end.y * radius);
    }
    ctx.stroke();
  }
  return {
    kind: 'canvas',
    canvas,
    failed: () => !ctx,
    needsRedraw: storyEarth.needsRedraw,
    frameInterval: 1000 / 30,
    resize(w, h, x) {
      width = w;
      height = h;
      centerX = x;
      sizeCanvas(w, h);
    },
    draw(orientation, radius, highlight, layers, detailed, terrain, terrainBlend, hover = null, theme = 'light', stories = false, reveal) {
      if (!ctx) return;
      const dark = theme === 'dark';
      const x = centerX, y = height / 2;
      const scan = reveal?.scan ?? 1.16;
      ctx.clearRect(0, 0, width, height);
      if (stories) { storyEarth.draw(ctx, orientation, radius, centerX, height / 2); return; }
      if (layers.grid && terrainBlend < 1) drawLines(detailed ? atlasLines.detail : atlasLines.grid, orientation, radius, dark ? '#739581' : gridColor,
        (detailed ? .26 : .30) * (1 - terrainBlend) * (reveal?.grid ?? 1), x, y, scan);
      if (layers.borders) drawLines(atlasLines.borders, orientation, radius, dark ? '#a2bba9' : borderColor, (detailed ? .68 : .52) * (reveal?.borders ?? 1), x, y, scan);
      const count = layers.particles && terrainBlend < 1 ? (width < 520 ? sparseCount : samples.length) : 0;
      for (let i = 0; i < count; i++) {
        const sample = samples[i];
        point.copy(sample.position).applyQuaternion(orientation);
        const depth = Math.max(point.z, 0);
        const dim = highlight && sample.position.distanceToSquared(highlight) < .04 ? .65 : 1;
        const frontOpacity = sample.land ? .22 + depth * .63 : .2 + depth * .6;
        const atlasAlpha = (point.z < 0 ? .03 : frontOpacity) * (sample.land ? 1 : .36) * dim * (1 - terrainBlend);
        const atlasSize = Math.max(.55, radius * .005) * (.72 + .4 * depth) * (sample.land ? 1 : .66);
        const coord = reveal ? genesisScanCoordinate(point.x, point.z) : -1;
        const visibility = reveal ? 1 - genesisEase(coord, scan - .11, scan) : 1;
        const glow = reveal && point.z >= 0 ? reveal.scanGlow * (1 - genesisEase(Math.abs(scan - coord), 0, .14)) : 0;
        const baseAlpha = atlasAlpha * (.16 + .84 * visibility);
        const opacity = baseAlpha + (.92 - baseAlpha) * glow * .76;
        const size = atlasSize * (1 + glow * .38);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = glow > .25 ? dark ? '#a5fbdb' : '#007869' :
          sample.land && point.z >= 0 ? dark ? '#c2d9c7' : '#4A4F4C' : dark ? '#6b8775' : '#b8b8b8';
        ctx.beginPath();
        ctx.arc(x + point.x * radius, y - point.y * radius, size, 0, Math.PI * 2);
        ctx.fill();
      }
      if (reveal) { ctx.globalAlpha = 1; return; }
      if (terrain && terrainBlend > 0) terrainLayer.draw(ctx, terrain, terrainBlend, orientation, radius, centerX, height / 2);
      const graph = constellationGraph(samples, orientation, layers.particles && terrainBlend === 0 ? hover : null, radius, count);
      ctx.strokeStyle = ctx.fillStyle = dark ? '#91d1bd' : '#007a6e'; ctx.lineWidth = .8; ctx.globalAlpha = .45;
      ctx.beginPath();
      graph.edges.forEach(([a,b]) => {
        ctx.moveTo(centerX + graph.nodes[a].x * radius, height / 2 - graph.nodes[a].y * radius);
        ctx.lineTo(centerX + graph.nodes[b].x * radius, height / 2 - graph.nodes[b].y * radius);
      }); ctx.stroke();
      graph.nodes.forEach(node => { ctx.beginPath(); ctx.arc(centerX + node.x * radius, height / 2 - node.y * radius, 3, 0, Math.PI * 2); ctx.fill(); });
      ctx.globalAlpha = 1;
    },
    pickTerrain: (view, blend, orientation, x, y) => terrainLayer.pick(view, blend, orientation, x, y),
    dispose() { terrainLayer.dispose(); storyEarth.dispose(); canvas.remove(); },
  };
}
