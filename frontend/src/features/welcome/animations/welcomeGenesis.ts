const genesisGlobeStart = .24;
export const genesisSignalStart = .78;
export const genesisImpact = 1.98;
export const genesisScanEnd = 3.64;
export const genesisSatelliteEnd = genesisScanEnd + 1.05;
export const genesisReturnEnd = genesisSatelliteEnd + 1.3;
export const genesisLogoOrbitEnd = genesisReturnEnd + .36;
export const genesisGrowthStart = genesisLogoOrbitEnd + .52;
export const genesisDuration = genesisGrowthStart + .92;

// A tilted plane sweeps through the globe. The curve and the Atlas shaders
// share this axis, so the light stays attached to the real geographic points.
export const scanAxisX = .976;
export const scanAxisZ = -Math.sqrt(1 - scanAxisX ** 2);
export const genesisScanCoordinate = (x: number, z: number) => scanAxisX * x + scanAxisZ * z;

export function shouldPlayGenesis(returning: boolean, startedInPage: boolean, reduced: boolean) {
  return !returning && !startedInPage && !reduced;
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
  const departure = genesisProgress(time, genesisSatelliteEnd, genesisReturnEnd);
  return {
    time,
    phase: time < genesisGlobeStart ? 'empty' : time < genesisSignalStart ? 'globe' :
      time < genesisImpact ? 'signal' : time < genesisScanEnd ? 'scan' : time < genesisSatelliteEnd ? 'satellite' :
      time < genesisReturnEnd ? 'return' : time < genesisGrowthStart ? 'logo' : time < genesisDuration ? 'grow' : 'complete',
    complete: time >= genesisDuration,
    scan: -1 + 2.16 * sweep,
    scanProgress: sweep,
    scanGlow: ramp(genesisImpact, genesisImpact + .19) * (1 - ramp(genesisScanEnd - .29, genesisScanEnd)),
    silhouette: ramp(genesisGlobeStart, genesisSignalStart - .06),
    atmosphere: ramp(genesisGlobeStart, genesisSignalStart + .32),
    disk: .34 + .66 * sweep,
    grid: ramp(genesisImpact, genesisScanEnd - .30),
    borders: ramp(genesisImpact + .20, genesisScanEnd - .09),
    satelliteTurns: genesisProgress(time, genesisScanEnd, genesisSatelliteEnd),
    returning: departure * (2 - departure),
    logoOrbit: genesisProgress(time, genesisReturnEnd, genesisLogoOrbitEnd),
    logo: ramp(genesisLogoOrbitEnd, genesisGrowthStart - .08),
    growth: ramp(genesisGrowthStart, genesisDuration),
  };
}

export type GenesisFrame = ReturnType<typeof genesisFrame>;

type Rect = { left: number; top: number };
export function genesisProjection(host: Rect, globe: Rect & { height: number }, centerX: number, radius: number, centerY = globe.height / 2) {
  return { x: globe.left - host.left + centerX, y: globe.top - host.top + centerY, radius };
}

type Point = { x: number; y: number };

export function genesisImpactPoint({ x, y, radius }: ReturnType<typeof genesisProjection>): Point {
  return { x: x - scanAxisX * radius, y };
}

function cubic(start: Point, first: Point, second: Point, end: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u ** 3 * start.x + 3 * u ** 2 * t * first.x + 3 * u * t ** 2 * second.x + t ** 3 * end.x,
    y: u ** 3 * start.y + 3 * u ** 2 * t * first.y + 3 * u * t ** 2 * second.y + t ** 3 * end.y,
  };
}

export function genesisBrandPath(
  host: Rect & { width: number; height: number },
  globe: ReturnType<typeof genesisProjection>,
  logo: Rect & { width: number; height: number },
) {
  const left = logo.left - host.left;
  const top = logo.top - host.top;
  const rotation = -.43;
  // Fit the traced ellipse to the orbit already in the team's mark.
  const orbit = {
    x: left + logo.width * .55, y: top + logo.height * .58,
    rx: logo.width * .45, ry: logo.width * .075, rotation,
  };
  const entry = { x: orbit.x - orbit.rx * Math.cos(rotation), y: orbit.y - orbit.rx * Math.sin(rotation) };
  const bottom = host.height - Math.min(44, host.height * .075);
  const satelliteTilt = .43;
  const cosTilt = Math.cos(satelliteTilt);
  const sinTilt = Math.sin(satelliteTilt);
  const squash = .56;
  // Fit the orbit through the far end of the scan, opposite the impact.
  const impact = genesisImpactPoint(globe);
  const start = { x: globe.x + scanAxisX * globe.radius, y: globe.y };
  const major = scanAxisX * globe.radius * Math.hypot(cosTilt, sinTilt / squash);
  const minor = major * squash;
  const entryAngle = Math.atan2(-sinTilt / squash, cosTilt);
  function satellite(turns: number) {
    const angle = entryAngle + turns * Math.PI * 2;
    const localX = major * Math.cos(angle);
    const localY = minor * Math.sin(angle);
    const dx = localX * cosTilt - localY * sinTilt;
    const dy = localX * sinTilt + localY * cosTilt;
    // The globe hides the rear arc only where it crosses the projected disk.
    const front = localY < 0;
    return { x: globe.x + dx, y: globe.y + dy, front, visible: front || dx ** 2 + dy ** 2 >= globe.radius ** 2 };
  }
  const tangentX = -major * Math.sin(entryAngle);
  const tangentY = minor * Math.cos(entryAngle);
  const tangent = { x: tangentX * cosTilt - tangentY * sinTilt, y: tangentX * sinTilt + tangentY * cosTilt };
  const scanFirst = { x: impact.x + globe.radius * .63, y: impact.y - globe.radius * .18 };
  const scanLast = { x: start.x - tangent.x * .26, y: start.y - tangent.y * .26 };
  const compact = host.width < 600;
  const source = {
    x: Math.max(12, Math.min(host.width * (compact ? .08 : .16), impact.x - 28)),
    y: Math.min(host.height - 24, impact.y + globe.radius * (compact ? .9 : .43)),
  };
  const signalFirst = { x: source.x + (impact.x - source.x) * .46, y: source.y - globe.radius * .11 };
  const signalLast = { x: impact.x - (scanFirst.x - impact.x) * .36, y: impact.y - (scanFirst.y - impact.y) * .36 };
  const departureFirst = { x: start.x + tangent.x * .36, y: start.y + tangent.y * .36 };
  const leftEdge = Math.max(8, left * .48);
  const turn = { x: Math.max(leftEdge + 8, Math.min(start.x - 12, host.width * .18)), y: bottom };
  return {
    orbit,
    satellite,
    signal: (t: number) => cubic(source, signalFirst, signalLast, impact, t),
    scan: (t: number) => cubic(impact, scanFirst, scanLast, start, t),
    point(t: number) {
      const split = .69;
      if (t <= split) {
        return cubic(start, departureFirst, { x: Math.max(turn.x, Math.min(start.x, host.width * .48)), y: bottom }, turn, t / split);
      }
      return cubic(turn, { x: leftEdge, y: bottom }, { x: leftEdge, y: entry.y + host.height * .13 },
        entry, (t - split) / (1 - split));
    },
  };
}

export interface WelcomeGenesisRequest {
  id: number;
  host: { current: HTMLCanvasElement | null };
  logo: { current: HTMLElement | null };
  onStarted: (id: number) => void;
  onComplete: (id: number) => void;
}
