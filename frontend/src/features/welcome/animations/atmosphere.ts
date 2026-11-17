export type AtmosphereVariant = 'welcome' | 'workspace';
export interface AtmosphereSignal { focusX: number; focusY: number; slow: boolean }
export interface AtmosphereParticle { x: number; y: number; z: number; speed: number; size: number; phase: number }
export interface AtmosphereSettings {
  color: string; density: number; minCount: number; maxCount: number;
  minSpeed: number; maxSpeed: number; opacity: number; trailSeconds: number; maxTrail: number;
  fps: number; maxDpr: number; pixelBudget: number; slowedSpeed: number;
  reducedSpeed: number; reducedCount: number;
}

/** All visual tuning lives here; neither screen needs an animation library. */
export const atmosphereSettings: Record<AtmosphereVariant, AtmosphereSettings> = {
  welcome: { color: '88,115,99', density: 28, minCount: 16, maxCount: 44, minSpeed: 2, maxSpeed: 5,
    opacity: .5, trailSeconds: 0, maxTrail: 0, fps: 24, maxDpr: 1.25, pixelBudget: 1200000, slowedSpeed: .65,
    reducedSpeed: .6, reducedCount: .7 },
  workspace: { color: '79,106,89', density: 180, minCount: 65, maxCount: 220, minSpeed: 90, maxSpeed: 160,
    opacity: .68, trailSeconds: .2, maxTrail: 14, fps: 30, maxDpr: 1.5, pixelBudget: 2000000, slowedSpeed: .55,
    reducedSpeed: .55, reducedCount: .7 },
};
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const smoothstep = (low: number, high: number, value: number) => {
  const t = clamp((value - low) / (high - low), 0, 1); return t * t * (3 - 2 * t);
};
export const atmosphereEase = (current: number, target: number, dt: number, rate = 3.5) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export function atmosphereBudget(variant: AtmosphereVariant, width: number, height: number, dpr: number, lowPower = false) {
  const preset = atmosphereSettings[variant], area = Math.max(1, width * height);
  const mobile = width < 600;
  const factor = (mobile ? .65 : 1) * (lowPower ? .7 : 1);
  return {
    count: Math.round(clamp(area / 1000000 * preset.density, preset.minCount, preset.maxCount) * factor),
    dpr: Math.min(Math.max(1, dpr || 1), preset.maxDpr, Math.sqrt(preset.pixelBudget / area)),
    fps: lowPower ? Math.min(24, preset.fps) : preset.fps,
  };
}

export function createAtmosphereParticle(variant: AtmosphereVariant, width: number, height: number, random: () => number, initial = false,
  origin = { focusX: .74, focusY: .52 }): AtmosphereParticle {
  const preset = atmosphereSettings[variant];
  const z = initial ? 180 + random() * 900 : 1200;
  let x = random() * width, y = random() * height;
  if (variant === 'welcome') {
    // Spend the small particle budget on visible edges instead of the masked globe/title.
    for (let attempt = 0; attempt < 32 && atmosphereMask(variant, x, y, width, height) < .2; attempt++) {
      x = random() * width; y = random() * height;
    }
  } else {
    const compact = width < 900;
    x = (compact ? .04 + random() * .92 : .4 + random() * .58) * width;
    y = (compact ? .45 + random() * .49 : .17 + random() * .75) * height;
    // Seed in screen space, then unproject. The old world-space field mostly fell off-screen.
    x = (x - width * origin.focusX) * z / 360;
    y = (y - height * origin.focusY) * z / 360;
  }
  return {
    x, y, z,
    speed: preset.minSpeed + random() * (preset.maxSpeed - preset.minSpeed),
    size: 1 + random() * .7, phase: random() * Math.PI * 2,
  };
}

export function atmosphereParticleExpired(particle: AtmosphereParticle, width: number, height: number, focusX: number, focusY: number) {
  const scale = 360 / Math.max(60, particle.z);
  const x = focusX * width + particle.x * scale, y = focusY * height + particle.y * scale;
  return particle.z < 60 || x < -40 || x > width + 40 || y < -40 || y > height + 40;
}

export function advanceAtmosphereParticle(particle: AtmosphereParticle, variant: AtmosphereVariant, dt: number, speed: number, width: number, height: number) {
  if (variant === 'workspace') particle.z -= particle.speed * dt * speed;
  else {
    particle.x = (particle.x + Math.cos(particle.phase) * particle.speed * dt * speed + width) % width;
    particle.y = (particle.y + Math.sin(particle.phase) * particle.speed * dt * speed + height) % height;
  }
}

/** Keep titles/buttons quiet; the globe's center never receives a star-field wash. */
export function atmosphereMask(variant: AtmosphereVariant, x: number, y: number, width: number, height: number) {
  const nx = x / width, ny = y / height;
  const rim = smoothstep(.06, .17, ny) * (1 - smoothstep(.92, 1, ny));
  if (variant === 'workspace') return rim * (width < 900
    ? smoothstep(.25, .44, ny) * smoothstep(.01, .2, nx)
    : smoothstep(.34, .6, nx));
  const cx = width < 600 ? .5 : .79, cy = width < 600 ? .73 : .52;
  const distance = Math.hypot((nx - cx) / .42, (ny - cy) / .62);
  return rim * smoothstep(.35, .63, nx) * smoothstep(.5, .86, distance);
}

export function projectAtmosphereParticle(particle: AtmosphereParticle, width: number, height: number, originX: number, originY: number, speed: number) {
  const preset = atmosphereSettings.workspace, fov = 360;
  const scale = fov / Math.max(60, particle.z);
  const x = originX + particle.x * scale, y = originY + particle.y * scale;
  const previousScale = fov / (Math.max(60, particle.z) + particle.speed * speed * preset.trailSeconds);
  let dx = particle.x * (scale - previousScale), dy = particle.y * (scale - previousScale);
  const distance = Math.hypot(dx, dy);
  if (distance > preset.maxTrail) { dx *= preset.maxTrail / distance; dy *= preset.maxTrail / distance; }
  const fadeIn = clamp((1200 - particle.z) / 220, 0, 1), fadeOut = clamp((particle.z - 60) / 110, 0, 1);
  return { x, y, tailX: x - dx, tailY: y - dy, opacity: fadeIn * fadeOut * atmosphereMask('workspace', x, y, width, height) };
}

export interface AtmosphereMotion { active: boolean; visible: boolean; hidden: boolean; reduced: boolean }
// The product now requests continuous particles. Reduced motion uses a gentler
// field; it no longer blocks the animation. Visibility and route lifetime still do.
export const shouldAnimateAtmosphere = (state: AtmosphereMotion) => state.active && state.visible && !state.hidden;
