import { advanceAtmosphereParticle, atmosphereBudget, atmosphereEase, atmosphereMask, atmosphereParticleExpired, atmosphereSettings, createAtmosphereParticle,
  projectAtmosphereParticle, shouldAnimateAtmosphere, type AtmosphereMotion, type AtmosphereParticle, type AtmosphereSignal, type AtmosphereVariant } from './atmosphere';

interface Clock { request: (callback: FrameRequestCallback) => number; cancel: (id: number) => void }
const browserClock: Clock = { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) };

export function createAtmosphereRuntime(canvas: HTMLCanvasElement, variant: AtmosphereVariant,
  signal: { current: AtmosphereSignal }, clock: Clock = browserClock) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const preset = atmosphereSettings[variant];
  let width = 0, height = 0, frame: number | null = null, lastPaint: number | null = null, destroyed = false;
  let particles: AtmosphereParticle[] = [], budget = { count: 0, dpr: 1, fps: preset.fps };
  let speed = 1, focusX = signal.current.focusX, focusY = signal.current.focusY;
  let motion: AtmosphereMotion = { active: true, visible: false, hidden: false, reduced: false };
  // Seeded positions avoid a distracting reshuffle on unrelated React renders.
  let seed = variant === 'workspace' ? 7331 : 1559;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const particleCount = () => Math.round(particles.length * (motion.reduced ? preset.reducedCount : 1));

  function draw() {
    if (!ctx || !width || !height || destroyed) return;
    // Transparent every frame: never accumulate the reference HTML's black wash.
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
    const count = particleCount();
    for (let index = 0; index < count; index++) {
      const particle = particles[index];
      if (variant === 'welcome') {
        const opacity = atmosphereMask(variant, particle.x, particle.y, width, height) * preset.opacity;
        if (opacity < .01) continue;
        ctx.fillStyle = 'rgba(' + preset.color + ',' + opacity + ')';
        ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill();
      } else {
        const point = projectAtmosphereParticle(particle, width, height, focusX * width, focusY * height, speed);
        if (point.x < -10 || point.x > width + 10 || point.y < -10 || point.y > height + 10 || point.opacity < .01) continue;
        ctx.strokeStyle = 'rgba(' + preset.color + ',' + point.opacity * preset.opacity + ')';
        ctx.lineWidth = .75 + particle.size * .18;
        ctx.beginPath(); ctx.moveTo(point.tailX, point.tailY); ctx.lineTo(point.x, point.y); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.arc(point.x, point.y, .65 + particle.size * .18, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function stop() {
    if (frame !== null) clock.cancel(frame);
    frame = null; lastPaint = null;
  }
  function tick(time: number) {
    frame = null;
    if (destroyed || !shouldAnimateAtmosphere(motion) || !ctx || !width || !height) return;
    const elapsed = lastPaint === null ? 0 : time - lastPaint;
    const fps = motion.reduced ? Math.min(24, budget.fps) : budget.fps;
    if (lastPaint === null || elapsed >= 1000 / fps - .5) {
      const dt = Math.min(.08, elapsed / 1000);
      lastPaint = time;
      const motionScale = motion.reduced ? preset.reducedSpeed : 1;
      speed = atmosphereEase(speed, (signal.current.slow ? preset.slowedSpeed : 1) * motionScale, dt);
      focusX = atmosphereEase(focusX, signal.current.focusX, dt);
      focusY = atmosphereEase(focusY, signal.current.focusY, dt);
      const count = particleCount();
      for (let i = 0; i < count; i++) {
        advanceAtmosphereParticle(particles[i], variant, dt, speed, width, height);
        if (variant === 'workspace' && atmosphereParticleExpired(particles[i], width, height, focusX, focusY)) {
          particles[i] = createAtmosphereParticle(variant, width, height, random, false, { focusX, focusY });
        }
      }
      draw();
    }
    frame = clock.request(tick);
  }
  function sync() {
    if (destroyed) return;
    if (ctx && width && height && shouldAnimateAtmosphere(motion)) {
      if (frame === null) frame = clock.request(tick);
    } else {
      stop();
      if (motion.visible && !motion.hidden) draw();
    }
  }
  return {
    resize(nextWidth: number, nextHeight: number, dpr: number, lowPower = false) {
      if (destroyed) return;
      const w = Math.max(0, nextWidth), h = Math.max(0, nextHeight);
      const nextBudget = atmosphereBudget(variant, w, h, dpr, lowPower);
      if (w === width && h === height && nextBudget.dpr === budget.dpr && nextBudget.count === budget.count) { sync(); return; }
      width = w; height = h; budget = nextBudget;
      canvas.width = Math.max(1, Math.round(width * budget.dpr)); canvas.height = Math.max(1, Math.round(height * budget.dpr));
      ctx?.setTransform(budget.dpr, 0, 0, budget.dpr, 0, 0);
      particles = Array.from({ length: budget.count }, () => createAtmosphereParticle(variant, width, height, random, true, { focusX, focusY }));
      draw(); sync();
    },
    setMotion(next: AtmosphereMotion) { motion = next; sync(); },
    destroy() { if (destroyed) return; stop(); destroyed = true; particles = []; canvas.width = canvas.height = 1; },
  };
}
