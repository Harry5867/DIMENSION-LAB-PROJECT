const genesisGlobeStart = .24;
export const genesisSignalStart = .78;
export const genesisImpact = 1.98;
export const genesisScanEnd = 3.64;
export const genesisDuration = 4.6;

// A tilted plane sweeps through the globe. The curve and the Atlas shaders
// share this axis, so the light stays attached to the real geographic points.
export const scanAxisX = .976;
export const scanAxisZ = -Math.sqrt(1 - scanAxisX ** 2);
export const genesisScanCoordinate = (x: number, z: number) => scanAxisX * x + scanAxisZ * z;

export function shouldWaitForGenesis(returning: boolean, startedInPage: boolean) {
  return !returning && !startedInPage;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
export const genesisProgress = (time: number, start: number, end: number) => clamp((time - start) / (end - start));
export function genesisEase(time: number, start: number, end: number) {
  const t = genesisProgress(time, start, end);
  return t * t * (3 - 2 * t);
}

export function genesisFrame(elapsed: number) {
  const time = Math.min(genesisDuration, Math.max(0, elapsed));
  const ramp = (start: number, end: number) => genesisEase(time, start, end);
  const sweep = ramp(genesisImpact, genesisScanEnd);
  return {
    time,
    phase: time < genesisGlobeStart ? 'empty' : time < genesisSignalStart ? 'globe' :
      time < genesisImpact ? 'signal' : time < genesisScanEnd ? 'scan' : time < genesisDuration ? 'welcome' : 'complete',
    complete: time >= genesisDuration,
    scan: -1 + 2.16 * sweep,
    scanGlow: ramp(genesisImpact, genesisImpact + .19) * (1 - ramp(genesisScanEnd - .29, genesisScanEnd)),
    silhouette: ramp(genesisGlobeStart, genesisSignalStart - .06),
    atmosphere: ramp(genesisGlobeStart, genesisSignalStart + .32),
    disk: .34 + .66 * sweep,
    grid: ramp(genesisImpact, genesisScanEnd - .30),
    borders: ramp(genesisImpact + .20, genesisScanEnd - .09),
    eyebrow: ramp(genesisScanEnd, 4.16),
    headline: ramp(genesisScanEnd + .06, 4.30),
    description: ramp(3.77, 4.39),
    action: ramp(3.83, 4.51),
    navigation: ramp(genesisScanEnd, 4.40),
    controls: ramp(3.96, genesisDuration),
    hanoi: ramp(genesisScanEnd - .04, 4.03),
    hanoiPulse: genesisProgress(time, genesisScanEnd, 4.54),
  };
}

export type GenesisFrame = ReturnType<typeof genesisFrame>;

type Rect = { left: number; top: number };
export function genesisProjection(host: Rect, globe: Rect & { height: number }, centerX: number, radius: number) {
  return { x: globe.left - host.left + centerX, y: globe.top - host.top + globe.height / 2, radius };
}

export interface WelcomeGenesisRequest {
  id: number;
  host: { current: HTMLCanvasElement | null };
  onStarted: (id: number) => void;
  onComplete: (id: number) => void;
}
