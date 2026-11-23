const standardTiming = { cover: 700, prepare: 180, reveal: 320 };
const standardDuration = standardTiming.cover + standardTiming.prepare + standardTiming.reveal;
const inboundCruise = { start: 320, duration: 1050 };
export const workspaceFlightTiming = {
  in: { ...standardTiming, cover: standardTiming.cover + inboundCruise.duration },
  out: standardTiming,
};
export type WorkspaceFlightDirection = keyof typeof workspaceFlightTiming;
export type WorkspaceEntrancePhase = 'covering' | 'preparing' | 'revealing';

const flightAt = (progress: number) => (1 - progress) ** 1.35;
const remainingDistance = (flight: number) => .16 * flight + 1.7 * flight ** 2.25;
// Match the original trajectory's speed at the start of the extra travel.
const cruiseDistancePerMs = remainingDistance(flightAt(inboundCruise.start / standardDuration))
  - remainingDistance(flightAt((inboundCruise.start + 1) / standardDuration));

const palettes = {
  dark: ['141,246,208', '99,220,180', '193,254,228', '103,231,194', '157,232,199', '125,210,250', '220,248,232', '111,211,174'],
  light: ['26,117,91', '44,131,103', '40,143,114', '41,119,100', '59,141,112', '48,115,150', '77,151,117', '39,126,103'],
};

export interface WorkspaceFlightOptions {
  direction: WorkspaceFlightDirection;
  theme: 'light' | 'dark';
  limitedBudget: boolean;
}
export interface WorkspaceFlightBounds {
  width: number; height: number; pixelRatio: number; originX: number; originY: number;
}
export interface WorkspaceFlightState {
  phase: WorkspaceEntrancePhase;
  startedAt: number;
  paused: boolean;
  bounds: WorkspaceFlightBounds;
}
export type WorkspaceFlightMessage =
  | { type: 'start'; canvas: OffscreenCanvas; options: WorkspaceFlightOptions; state: WorkspaceFlightState }
  | { type: 'sync'; state: WorkspaceFlightState };

interface FlightClock {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}
const animationClock: FlightClock = {
  request: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id),
};

export function createWorkspaceFlightRuntime(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  { direction, theme, limitedBudget }: WorkspaceFlightOptions,
  clock: FlightClock = animationClock,
) {
  const context = canvas.getContext('2d');
  if (!context) return null;

  const palette = palettes[theme];
  const returning = direction === 'out';
  const baseCount = limitedBudget ? 176 : 340;
  const count = baseCount + (returning ? 0 : limitedBudget ? 20 : 56);
  // Seed the field so each flight has a consistent arrangement.
  let seed = 15373;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stars = Array.from({ length: count }, (_, index) => {
    const angle = (index + random()) / count * Math.PI * 2;
    const distance = .08 + random() ** .8 * .94;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      depth: random(),
      size: random() ** 1.7,
      color: `rgb(${palette[index % palette.length] ?? palette[0]})`,
      screenX: 0,
      screenY: 0,
      screenDistance: 0,
    };
  });

  const { cover, prepare, reveal } = workspaceFlightTiming[direction];
  const timeline = {
    covering: { offset: 0, duration: cover },
    preparing: { offset: cover, duration: prepare },
    revealing: { offset: cover + prepare, duration: reveal },
  };
  let width = 1, height = 1, originX = .54, originY = .5;
  let frame: number | null = null;
  let current: WorkspaceFlightState | undefined;
  const resize = (bounds: WorkspaceFlightBounds) => {
    ({ width, height, originX, originY } = bounds);
    for (const star of stars) {
      star.screenX = star.x * width;
      star.screenY = star.y * height;
      star.screenDistance = Math.hypot(star.screenX, star.screenY);
    }
    const ratio = Math.min(bounds.pixelRatio, 1.25, Math.sqrt(1_200_000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    context.lineCap = 'round';
  };

  const paint = (now: number) => {
    frame = null;
    if (!current || current.paused) return;
    const stage = timeline[current.phase];
    // A slow first paint can delay the CSS handoff. Keep the stars in phase with the overlay.
    const elapsed = Math.max(0, Math.min(stage.duration, performance.timeOrigin + now - current.startedAt));
    const flightTime = stage.offset + elapsed;
    const cruiseTime = returning ? 0 : Math.max(0, Math.min(inboundCruise.duration, flightTime - inboundCruise.start));
    const progress = (flightTime - cruiseTime) / standardDuration;
    const flight = flightAt(progress);
    context.clearRect(0, 0, width, height);

    const centerX = width * (returning ? originX + (.54 - originX) * flight : originX);
    const centerY = height * (returning ? originY + (.5 - originY) * flight : originY);
    const remainingTravel = remainingDistance(flight);
    const travel = returning ? remainingTravel : 1.86 - remainingTravel + cruiseTime * cruiseDistancePerMs;
    const trailStrength = returning ? flight : 4 * flight * (1 - flight);
    const streak = .002 + .33 * trailStrength ** 1.45;
    const spread = returning ? .34 + .66 * flight : 1;
    const maxTrail = Math.min(255, Math.min(width, height) * .39);
    for (const star of stars) {
      // Recycle distant stars as nearer ones leave the viewport.
      const depth = (star.depth + travel) % 1;
      const scale = .34 / (1.17 - depth);
      const trail = .34 / (1.17 - depth + streak * (.52 + star.size * .68));
      const dx = star.screenX * spread, dy = star.screenY * spread;
      const outerX = centerX + dx * scale, outerY = centerY + dy * scale;
      const length = (scale - trail) * star.screenDistance * spread;
      const tailScale = (scale - trail) * Math.min(1, maxTrail / Math.max(1, length));
      const innerX = outerX - dx * tailScale, innerY = outerY - dy * tailScale;
      const endX = returning ? innerX : outerX, endY = returning ? innerY : outerY;
      const tailX = returning ? outerX : innerX, tailY = returning ? outerY : innerY;
      if ((endX < 0 && tailX < 0) || (endX > width && tailX > width)
        || (endY < 0 && tailY < 0) || (endY > height && tailY > height)) continue;

      const depthFade = Math.min(1, depth / .13, (1 - depth) / .075);
      const opacity = (.23 + .45 * star.size + .32 * depth) * depthFade;
      const weight = .65 + star.size * .95 + depth * .65;
      if (length < 2) {
        context.fillStyle = star.color;
        context.globalAlpha = opacity;
        context.beginPath(); context.arc(endX, endY, weight * .48, 0, Math.PI * 2); context.fill();
        continue;
      }
      const segmentX = endX - tailX, segmentY = endY - tailY;
      context.strokeStyle = star.color;
      if (star.size > .66 && length > 10) {
        context.lineWidth = weight * 3.2;
        context.globalAlpha = opacity * .13;
        context.beginPath();
        context.moveTo(endX - segmentX * .72, endY - segmentY * .72);
        context.lineTo(endX, endY); context.stroke();
      }
      context.lineWidth = weight * .68;
      context.globalAlpha = opacity * .3;
      context.beginPath(); context.moveTo(tailX, tailY); context.lineTo(endX, endY); context.stroke();
      context.lineWidth = weight;
      context.globalAlpha = opacity * .58;
      context.beginPath();
      context.moveTo(endX - segmentX * .57, endY - segmentY * .57);
      context.lineTo(endX, endY); context.stroke();
      context.globalAlpha = opacity;
      context.beginPath();
      context.moveTo(endX - segmentX * .18, endY - segmentY * .18);
      context.lineTo(endX, endY); context.stroke();
    }
    context.globalAlpha = 1;
    if (progress < 1) frame = clock.request(paint);
  };

  const stop = () => {
    if (frame !== null) clock.cancel(frame);
    frame = null;
  };
  return {
    sync(next: WorkspaceFlightState) {
      const previous = current?.bounds;
      current = next;
      if (!previous || previous.width !== next.bounds.width || previous.height !== next.bounds.height
        || previous.pixelRatio !== next.bounds.pixelRatio || previous.originX !== next.bounds.originX || previous.originY !== next.bounds.originY) {
        resize(next.bounds);
      }
      if (next.paused) stop();
      else if (frame === null) frame = clock.request(paint);
    },
    destroy: stop,
  };
}
