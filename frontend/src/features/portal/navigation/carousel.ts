export const CAROUSEL_STEP = 72;
export const CAROUSEL_DRAG_THRESHOLD = 8;
const count = 5;
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

export function frontSection(angle: number) {
  return modulo(Math.round(-angle / CAROUSEL_STEP) + 1, count);
}

/** Nearest equivalent angle, so keyboard focus never spins through a full turn. */
export function angleForSection(index: number, angle: number) {
  const target = (1 - index) * CAROUSEL_STEP;
  return angle + modulo(target - angle + 180, 360) - 180;
}

export function orbitPoint(angle: number) {
  const radians = angle * Math.PI / 180;
  const sine = Math.sin(radians), cosine = Math.cos(radians);
  return { x: 50 + sine * 34 - cosine * 10, y: 46 + cosine * 22 - sine * 6,
    scale: .62 + .38 * (cosine + 1) / 2, tilt: -sine * 9, depth: (cosine + 1) / 2 };
}

/** Pointer distance maps directly to rotation while the button is held. */
export function dragAngle(startAngle: number, deltaX: number, width: number) {
  return startAngle + deltaX / Math.max(1, width) * 180;
}

/** Mouse speed supplies a rotational impulse, rather than an angle or edge speed. */
export function spinVelocity(current: number, deltaX: number, width: number, elapsedMs: number) {
  const seconds = Math.max(4, elapsedMs) / 1000;
  const sample = Math.max(-1200, Math.min(1200, dragAngle(0, deltaX, width) / seconds));
  const blend = 1 - Math.exp(-seconds / .025);
  return current + (sample - current) * blend;
}

/** Exact exponential friction: quick at first, then naturally slows to rest. */
export function coastCarousel(position: number, velocity: number, seconds: number, friction = 3.8) {
  const dt = Math.max(0, Math.min(.05, seconds));
  const decay = Math.exp(-friction * dt);
  return { position: position + velocity * (1 - decay) / friction, velocity: velocity * decay };
}

/** Exact critically damped spring: preserves velocity when the pointer retargets. */
export function dampCarousel(position: number, velocity: number, target: number, seconds: number) {
  const dt = Math.max(0, Math.min(.05, seconds)), frequency = 22;
  const offset = position - target, step = (velocity + frequency * offset) * dt;
  const decay = Math.exp(-frequency * dt);
  return { position: target + (offset + step) * decay, velocity: (velocity - frequency * step) * decay };
}

export function dragIntent(dx: number, dy: number, touch: boolean): 'pending' | 'rotate' | 'scroll' {
  if (Math.hypot(dx, dy) < CAROUSEL_DRAG_THRESHOLD) return 'pending';
  return touch && Math.abs(dy) > Math.abs(dx) ? 'scroll' : 'rotate';
}
