import { genesisEase, genesisImpact, genesisProgress, genesisSignalStart, scanAxisX, scanAxisZ, type GenesisFrame, type genesisProjection } from './welcomeGenesis';

type Projection = ReturnType<typeof genesisProjection>;
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
    draw(frame: GenesisFrame, { x, y, radius }: Projection, dark: boolean) {
      ctx.clearRect(0, 0, width, height);
      const t = frame.time;
      if (t < genesisSignalStart) return;
      const mint = dark ? '146,247,218' : '0,120,105';
      const glint = dark ? '226,255,245' : '6,110,98';
      const color = (rgb: string, alpha: number) => `rgba(${rgb},${alpha})`;
      const compact = width < 600;
      const hitX = x - scanAxisX * radius;
      const sourceX = compact ? width * .39 : Math.max(12, Math.min(width * .16, hitX - 44));
      const sourceY = compact ? Math.max(100, y - radius * 2.8) : Math.min(height - 24, y + radius * .43);
      const xAt = (p: number) => sourceX + (hitX - sourceX) * p - (compact ? width * .16 : 0) * Math.sin(Math.PI * p);
      const yAt = (p: number) => sourceY + (y - sourceY) * p - radius * (compact ? .08 : .42) * Math.sin(Math.PI * p);
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
        if (lead > tail && energy > 0) {
          const gradient = ctx.createLinearGradient(xAt(tail), yAt(tail), xAt(lead), yAt(lead));
          gradient.addColorStop(0, color(mint, 0));
          gradient.addColorStop(1, color(mint, energy * .78));
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          for (let i = 0; i <= 28; i++) {
            const p = tail + (lead - tail) * i / 28;
            if (i) ctx.lineTo(xAt(p), yAt(p)); else ctx.moveTo(xAt(p), yAt(p));
          }
          ctx.stroke();
        }
        const count = compact ? 82 : particles.length;
        for (let i = 0; i < count; i++) {
          const [lag, drift, spread, brightness] = particles[i];
          const start = genesisSignalStart + lag * .38;
          const p = Math.pow(genesisProgress(t, start, genesisImpact + .10 + lag * .45), 1.35);
          const fan = (1 - p) ** .82 * Math.min(58, radius * .44);
          const alpha = genesisEase(t, start, start + .30) * (1 - genesisEase(p, .88, 1)) * (.32 + brightness * .52);
          dot(xAt(p) + (spread - .5) * fan, yAt(p) + (drift - .5) * fan, .55 + brightness * 1.15, brightness > .78 ? glint : mint, alpha);
        }
        if (energy > 0) {
          halo(xAt(lead), yAt(lead), 16, mint, energy * .55);
          dot(xAt(lead), yAt(lead), 2.7, glint, energy);
        }
        const impact = genesisEase(t, genesisImpact, genesisImpact + .09) * (1 - genesisEase(t, genesisImpact + .09, genesisImpact + .43));
        if (impact > 0) halo(hitX, y, Math.max(24, radius * .23), mint, impact * .72);
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
