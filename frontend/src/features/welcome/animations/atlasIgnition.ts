import { genesisEase, genesisImpact, genesisImpactPoint, genesisProgress, genesisSatelliteEnd, genesisScanEnd, genesisSignalStart, scanAxisX, scanAxisZ, type GenesisFrame, type genesisBrandPath, type genesisProjection } from './welcomeGenesis';

type Projection = ReturnType<typeof genesisProjection>;
type BrandPath = ReturnType<typeof genesisBrandPath>;
const tau = Math.PI * 2;
const seed = (i: number) => { const x = Math.sin(i * 127.1 + 37.4) * 43758.5453; return x - Math.floor(x); };
const particles = Array.from({ length: 134 }, (_, i) => [seed(i * 4), seed(i * 4 + 1), seed(i * 4 + 2), seed(i * 4 + 3)] as const);
const curve = Array.from({ length: 53 }, (_, i) => {
  const angle = tau * i / 52;
  return [Math.cos(angle), Math.sin(angle)] as const;
});

export function createAtlasIgnition(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const ctx = context;
  let width = 0, height = 0;
  return {
    resize(w: number, h: number, dpr: number) {
      width = w; height = h;
      const ratio = Math.min(dpr, w < 600 ? 1.25 : 1.6, Math.sqrt(1_800_000 / (w * h)));
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    },
    draw(frame: GenesisFrame, globe: Projection, dark: boolean, brand: BrandPath | null) {
      ctx.clearRect(0, 0, width, height);
      const t = frame.time;
      if (t < genesisSignalStart) return;
      const mint = dark ? '145,209,189' : '0,122,110';
      const glint = dark ? '214,249,239' : '45,133,116';
      const color = (rgb: string, alpha: number) => `rgba(${rgb},${alpha})`;
      const compact = width < 600;
      const { x, y, radius } = globe;
      const impactPoint = genesisImpactPoint(globe);
      const hitX = impactPoint.x;
      const sourceX = compact ? width * .39 : Math.max(12, Math.min(width * .16, hitX - 44));
      const sourceY = compact ? Math.max(100, y - radius * 2.8) : Math.min(height - 24, y + radius * .43);
      const signal = brand?.signal ?? ((p: number) => ({
        x: sourceX + (hitX - sourceX) * p - (compact ? width * .16 : 0) * Math.sin(Math.PI * p),
        y: sourceY + (y - sourceY) * p - radius * (compact ? .08 : .42) * Math.sin(Math.PI * p),
      }));
      const dot = (cx: number, cy: number, size: number, rgb: string, alpha: number) => {
        if (alpha <= 0) return;
        ctx.fillStyle = color(rgb, alpha);
        ctx.beginPath(); ctx.arc(cx, cy, size, 0, tau); ctx.fill();
      };
      const halo = (cx: number, cy: number, size: number, rgb: string, alpha: number) => {
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
        gradient.addColorStop(0, color(rgb, alpha));
        gradient.addColorStop(.27, color(rgb, alpha * .37));
        gradient.addColorStop(1, color(rgb, 0));
        ctx.fillStyle = gradient; ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
      };
      if (t < genesisImpact + .57) {
        const lead = Math.pow(genesisProgress(t, genesisSignalStart, genesisImpact), 1.55);
        const energy = genesisEase(t, genesisSignalStart, genesisSignalStart + .22) * (1 - genesisEase(t, genesisImpact, genesisImpact + .22));
        const tail = Math.max(0, lead - (compact ? .60 : .44));
        const head = signal(lead);
        if (lead > tail && energy > 0) {
          const start = signal(tail);
          const gradient = ctx.createLinearGradient(start.x, start.y, head.x, head.y);
          gradient.addColorStop(0, color(mint, 0));
          gradient.addColorStop(1, color(mint, energy * .78));
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          for (let i = 1; i <= 28; i++) {
            const point = signal(tail + (lead - tail) * i / 28);
            ctx.lineTo(point.x, point.y);
          }
          ctx.stroke();
        }
        const count = compact ? 82 : particles.length;
        for (let i = 0; i < count; i++) {
          const [lag, drift, spread, brightness] = particles[i]!;
          const start = genesisSignalStart + lag * .38;
          const p = Math.pow(genesisProgress(t, start, genesisImpact + .10 + lag * .45), 1.35);
          const point = signal(p);
          const fan = (1 - p) ** .82 * Math.min(58, radius * .44);
          const alpha = genesisEase(t, start, start + .30) * (1 - genesisEase(p, .88, 1)) * (.32 + brightness * .52);
          dot(point.x + (spread - .5) * fan, point.y + (drift - .5) * fan, .55 + brightness * 1.15, brightness > .78 ? glint : mint, alpha);
        }
        if (energy > 0 && (!brand || t < genesisImpact)) {
          halo(head.x, head.y, 14, mint, energy * .52);
          dot(head.x, head.y, 2.15, glint, energy);
        }
        const impact = genesisEase(t, genesisImpact, genesisImpact + .09) * (1 - genesisEase(t, genesisImpact + .09, genesisImpact + .43));
        if (impact > 0) halo(hitX, y, Math.max(24, radius * .23), mint, impact * .72);
      }
      if (brand && frame.phase === 'scan') {
        const head = brand.scan(frame.scanProgress);
        halo(head.x, head.y, 14, mint, .52);
        dot(head.x, head.y, 2.15, glint, 1);
      }
      if (brand && t >= genesisScanEnd && t < genesisSatelliteEnd + .24) {
        const energy = genesisEase(t, genesisScanEnd, genesisScanEnd + .12);
        const trailAlpha = energy * (1 - genesisEase(t, genesisSatelliteEnd, genesisSatelliteEnd + .24));
        const traced = frame.satelliteTurns;
        const segments = Math.ceil(traced * 80);
        for (const front of [false, true]) {
          ctx.beginPath();
          let drawing = false;
          for (let i = 0; i <= segments; i++) {
            const point = brand.satellite(Math.min(i / 80, traced));
            if (point.visible && point.front === front) {
              if (drawing) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y);
              drawing = true;
            } else drawing = false;
          }
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = color(mint, trailAlpha * (front ? .38 : .23));
          ctx.setLineDash(front ? [] : [1.5, 4]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        const count = compact ? 54 : 82;
        for (let i = 0; i < count; i++) {
          const [lag, drift, spread, brightness] = particles[i]!;
          const turns = frame.satelliteTurns - lag * .29;
          if (turns < 0) continue;
          const point = brand.satellite(turns);
          if (!point.visible) continue;
          const fan = 2 + 10 * lag;
          const depth = point.front ? 1 : .55;
          dot(point.x + (spread - .5) * fan, point.y + (drift - .5) * fan,
            .48 + brightness * .92, brightness > .7 ? glint : mint, trailAlpha * depth * (1 - lag) * (.28 + brightness * .60));
        }
        if (t < genesisSatelliteEnd) {
          const head = brand.satellite(frame.satelliteTurns);
          if (head.visible) {
            const shine = head.front ? 1 : .62;
            halo(head.x, head.y, 14, mint, shine * .52);
            dot(head.x, head.y, 2.15, glint, shine);
          }
        }
      }
      if (brand && t >= genesisSatelliteEnd && frame.logo < 1) {
        const head = brand.point(frame.returning);
        const tail = Math.max(0, frame.returning - .54);
        const start = brand.point(tail);
        const energy = 1 - frame.logo;
        const gradient = ctx.createLinearGradient(start.x, start.y, head.x, head.y);
        gradient.addColorStop(0, color(mint, 0));
        gradient.addColorStop(1, color(mint, energy * .74));
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i <= 44; i++) {
          const point = brand.point(tail + (frame.returning - tail) * i / 44);
          ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
        const count = compact ? 82 : particles.length;
        for (let i = 0; i < count; i++) {
          const [lag, drift, spread, brightness] = particles[i]!;
          const p = frame.returning - lag * .54;
          if (p < 0) continue;
          const point = brand.point(p);
          const fan = 5 + 28 * lag;
          dot(point.x + (spread - .5) * fan, point.y + (drift - .5) * fan,
            .48 + brightness * .95, brightness > .78 ? glint : mint, energy * (1 - lag) * (.24 + brightness * .57));
        }
        halo(head.x, head.y, 14, mint, energy * .52);
        dot(head.x, head.y, 2.15, glint, energy);
      }
      if (frame.scanGlow <= 0 || Math.abs(frame.scan) >= 1) return;
      const ringRadius = Math.sqrt(1 - frame.scan ** 2);
      let visible = false;
      ctx.beginPath();
      for (const [cos, sin] of curve) {
        const u = ringRadius * cos;
        const px = x + (scanAxisX * frame.scan - scanAxisZ * u) * radius;
        const py = y - ringRadius * sin * radius;
        const front = scanAxisZ * frame.scan + scanAxisX * u >= 0;
        if (front) {
          if (visible) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        visible = front;
      }
      ctx.lineWidth = 1.65;
      ctx.strokeStyle = color(mint, frame.scanGlow * (dark ? .82 : .70));
      ctx.shadowColor = color(mint, .72);
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    },
  };
}
