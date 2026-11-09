/** Conceptual illustrations, never experiment results or input to the models. */
export const morphScenes = [
  { id: 'pca', label: 'PCA', category: 'Dimensionality reduction', color: '#347db0' },
  { id: 'tsne', label: 't-SNE', category: 'Local structure', color: '#ba5d91' },
  { id: 'umap', label: 'UMAP', category: 'Connected structure', color: '#6475b9' },
  { id: 'kmeans', label: 'K-Means', category: 'Clustering', color: '#31846c' },
  { id: 'gmm', label: 'GMM', category: 'Soft clustering', color: '#258d8d' },
  { id: 'dbscan', label: 'DBSCAN', category: 'Density-based clustering', color: '#527f54' },
  { id: 'anomaly', label: 'Isolation Forest', category: 'Anomaly detection', color: '#c45b4b' },
  { id: 'association', label: 'Apriori', category: 'Association rules', color: '#b47b35' },
] as const;

export const morphSettings = {
  sceneSeconds: 5.2, transitionSeconds: 1.8,
  desktopPoints: 4800, mobilePoints: 2400, lowPowerPoints: 1600, fallbackPoints: 1000,
  maxDpr: 1.5, pixelBudget: 1_100_000,
  pointSize: 3.7, breathe: .05, bob: .075,
};

export function morphDisplayColor(hex: string, theme: 'light' | 'dark') {
  if (theme === 'light') return hex;
  const value = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map(shift => Math.round(((value >> shift) & 255) * .65 + 255 * .35).toString(16).padStart(2, '0')).join('');
}

export function morphFrame(seconds: number) {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  // Decimal cycle lengths (5.2s) can land one floating-point ulp below an exact seam.
  const turn = Math.floor(time / morphSettings.sceneSeconds + 1e-10);
  const scene = turn % morphScenes.length;
  const local = Math.max(0, time - turn * morphSettings.sceneSeconds);
  const blend = Math.max(0, Math.min(1, (local - (morphSettings.sceneSeconds - morphSettings.transitionSeconds)) / morphSettings.transitionSeconds));
  return { scene, next: (scene + 1) % morphScenes.length, blend, label: blend < .5 ? scene : (scene + 1) % morphScenes.length };
}

export function morphBudget(width: number, height: number, dpr: number, lowPower = false) {
  return {
    count: lowPower ? morphSettings.lowPowerPoints : width < 440 || height < 300 ? morphSettings.mobilePoints : morphSettings.desktopPoints,
    dpr: Math.max(.5, Math.min(dpr || 1, morphSettings.maxDpr, Math.sqrt(morphSettings.pixelBudget / Math.max(1, width * height)))),
  };
}

export interface MorphShape { positions: Float32Array; colors: string[] }
export const associationCenters = [
  [-1.42, .3, .12], [-.88, .98, -.25], [-.3, .15, .32], [.05, -.88, .08],
  [.65, .83, .18], [1.4, .17, -.26], [.98, -.82, .2], [-1.05, -.65, -.2],
];
export const associationEdges = [[0, 1], [0, 2], [0, 7], [1, 2], [1, 4], [2, 3], [2, 4], [2, 7], [3, 6], [3, 7], [4, 5], [5, 6], [2, 5]];
const clusterCenters = [[-1, .55, .3], [.83, .72, -.15], [.55, -.72, .35], [-.85, -.65, -.5]];
const palette = ['#22836e', '#377fab', '#ca8748', '#ac6593'];

/** Stable identities and seeds keep resize and unrelated renders from reshuffling. */
export function createMorphShapes(count: number): MorphShape[] {
  let seed = 7429;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  // Bounded, approximately normal coordinates without long outlier tails.
  const normal = () => (random() + random() + random() + random() - 2) * .92;
  const samples = Array.from({ length: count }, (_, index) => ({
    a: normal(), b: normal(), c: normal(), u: random(), v: random(), group: index % 4, node: index % 8,
  }));
  return morphScenes.map(scene => {
    const positions = new Float32Array(count * 3), colors: string[] = [];
    samples.forEach((s, i) => {
      let x = 0, y = 0, z = 0, color: string = scene.color;
      const center = clusterCenters[s.group];
      if (scene.id === 'pca') {
        x = s.a * 1.3; y = s.b * .62 + x * .24; z = s.c * .075;
        color = s.group < 2 ? '#367eae' : '#64a5b0';
      } else if (scene.id === 'tsne') {
        x = center[0] + s.a * .28; y = center[1] + s.b * .27; z = center[2] + s.c * .3;
        color = ['#ac548a', '#ca7399', '#7275b2', '#b78caa'][s.group];
      } else if (scene.id === 'umap') {
        const t = s.u * Math.PI * 1.65;
        const lane = i % 2 === 0 ? -1 : 1;
        x = Math.cos(t) * (1 + s.a * .13) + lane * .37;
        y = Math.sin(t) * .65 + lane * .35 + s.b * .13;
        z = (s.u - .5) * .7 + s.c * .12;
        color = lane < 0 ? '#587fb8' : '#a369a5';
      } else if (scene.id === 'kmeans') {
        x = center[0] + s.a * .36; y = center[1] + s.b * .34; z = center[2] + s.c * .3;
        color = palette[s.group];
      } else if (scene.id === 'gmm') {
        const g = i % 3, angle = [-.55, .65, -.28][g];
        const a = s.a * .85, b = s.b * .24;
        x = [-.85, .58, .3][g] + a * Math.cos(angle) - b * Math.sin(angle);
        y = [.48, .35, -.65][g] + a * Math.sin(angle) + b * Math.cos(angle);
        z = s.c * .28 + (g - 1) * .15;
        color = ['#2a8a88', '#b76c96', '#6c8bb7'][g];
      } else if (scene.id === 'dbscan') {
        const t = s.u * Math.PI, lane = i % 2;
        x = Math.cos(t) * 1.14 + (lane ? .48 : -.4) + s.a * .12;
        y = Math.sin(t) * (lane ? -.85 : .85) + (lane ? .28 : -.23) + s.b * .12;
        z = Math.sin(t * 2) * .27 + s.c * .12;
        color = lane ? '#4382a1' : '#41876d';
        if (i % 31 === 0) { x = s.a * 1.5; y = s.b * 1.2; z = s.c * .65; color = '#92958a'; }
      } else if (scene.id === 'anomaly') {
        x = s.a * .86; y = s.b * .58 + s.a * .27; z = s.c * .42;
        color = i % 3 ? '#6b9788' : '#397e75';
        if (i % 23 === 0) {
          const angle = s.u * Math.PI * 2;
          x = Math.cos(angle) * (1.35 + s.v * .33); y = Math.sin(angle) * (1 + s.v * .25); z = s.c * .5;
          color = i % 2 ? '#ca5a4c' : '#da8250';
        }
      } else {
        const node = associationCenters[s.node];
        x = node[0] + s.a * .13; y = node[1] + s.b * .13; z = node[2] + s.c * .14;
        color = s.node % 3 ? '#b78546' : '#38867d';
      }
      positions.set([x, y, z], i * 3); colors.push(color);
    });
    return { positions, colors };
  });
}

/** Balance the visual footprint of each scene while keeping its relative geometry. */
export function prepareMorphShapes(count: number) {
  const shapes = createMorphShapes(count), scales: number[] = [];
  for (const shape of shapes) {
    let x = .1, y = .1;
    for (let i = 0; i < shape.positions.length; i += 3) {
      x = Math.max(x, Math.abs(shape.positions[i])); y = Math.max(y, Math.abs(shape.positions[i + 1]));
    }
    const scale = Math.min(1.5, 2 / x, 1.35 / y);
    scales.push(scale);
    for (let i = 0; i < shape.positions.length; i++) shape.positions[i] *= scale;
  }
  return { shapes, scales };
}

export interface MorphMotion { active: boolean; visible: boolean; hidden: boolean; reduced: boolean; paused: boolean }
export interface MorphClock { request(callback: FrameRequestCallback): number; cancel(id: number): void }

/** One clock owns all rendering. Pauses retain scene/time, with no catch-up jump. */
export function createMorphPlayback(paint: (seconds: number, dt: number) => void, clock: MorphClock) {
  let seconds = 0, last: number | null = null, frame: number | null = null, destroyed = false;
  let state: MorphMotion = { active: false, visible: false, hidden: false, reduced: false, paused: false };
  const running = () => !destroyed && state.active && state.visible && !state.hidden && !state.paused;
  function stop() { if (frame !== null) clock.cancel(frame); frame = null; last = null; }
  function tick(time: number) {
    frame = null;
    if (!running()) return;
    const dt = last === null ? 0 : Math.max(0, Math.min(.08, (time - last) / 1000));
    last = time; const motionDt = dt * (state.reduced ? .45 : 1); seconds += motionDt; paint(seconds, motionDt);
    if (running()) frame = clock.request(tick);
  }
  return {
    setMotion(next: MorphMotion) {
      state = next;
      if (running()) { if (frame === null) frame = clock.request(tick); }
      else { stop(); if (!destroyed && state.visible && !state.hidden) paint(seconds, 0); }
    },
    redraw() { if (!destroyed) paint(seconds, 0); },
    destroy() { stop(); destroyed = true; },
  };
}
