import { useAppLanguage } from "../../../shared/providers/WelcomeLanguage";
import { useId, useLayoutEffect, useRef } from 'react';
import { LabMark } from '../../../shared/ui/LabMark';
import { useAppTheme } from '../../../shared/providers/ThemeProvider';

const rays = Array.from({ length: 24 }, (_, index) => {
  const angle = index * Math.PI / 12;
  return { x1: Math.cos(angle) * 160, y1: Math.sin(angle) * 160,
    x2: Math.cos(angle) * 1100, y2: Math.sin(angle) * 1100 };
});
const nodes = Array.from({ length: 5 }, (_, index) => {
  const angle = index * Math.PI * 2 / 5 - Math.PI / 2;
  return { x: Math.cos(angle) * 250, y: Math.sin(angle) * 250, label: String(index + 1).padStart(2, '0') };
});

export function WorkspaceEntrance({ phase, onComplete, direction = 'in', center, reducedMotion = false }: {
  phase: 'covering' | 'revealing'; onComplete: () => void; direction?: 'in' | 'out';
  center?: { x: number; y: number }; reducedMotion?: boolean;
}) {
  const { tr } = useAppLanguage();
  const { theme } = useAppTheme();
  const id = useId().replace(/:/g, '');
  const curtain = useRef<HTMLDivElement>(null);
  const centerX = center?.x ?? .72, centerY = center?.y ?? .52;
  const cx = centerX * 100 + '%', cy = centerY * 100 + '%';
  useLayoutEffect(() => {
    const element = curtain.current;
    if (!element || direction !== 'out') return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      // Reach the farthest corner at the end, rather than opening an oversized
      // 150vmax hole that already uncovers the page halfway through the animation.
      element.style.setProperty('--gateway-radius', (Math.hypot(width * Math.max(centerX, 1 - centerX), height * Math.max(centerY, 1 - centerY)) + 2) + 'px');
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [centerX, centerY, direction]);
  const field = <svg x={cx} y={cy} width="1" height="1" overflow="visible">
    <g className="entry-gateway-rays" stroke="var(--welcome-action)" strokeWidth=".8" opacity=".24">
      {rays.map((ray, index) => <line key={index} {...ray} />)}
    </g>
    <g className="entry-gateway-rings" fill="none" stroke="var(--welcome-action)" strokeWidth="1">
      <circle r="155" opacity=".4" /><circle r="250" opacity=".65" />
      <circle r="345" opacity=".3" /><circle r="425" opacity=".15" />
      <ellipse rx="345" ry="120" transform="rotate(-24)" opacity=".55" />
      <ellipse rx="150" ry="345" transform="rotate(-24)" opacity=".35" />
    </g>
    <g className="entry-gateway-nodes" fill="var(--welcome-action)">
      {nodes.map(node => <g key={node.label}>
        <circle cx={node.x} cy={node.y} r="3" />
        <text x={node.x + 12} y={node.y + 4}>{node.label}</text>
      </g>)}
    </g>
  </svg>;
  return <div ref={curtain} className={`entry-curtain entry-curtain--${phase}${direction === 'out' ? ' entry-curtain--out' : ''}${theme === 'dark' ? ' entry-curtain--dark' : ''}${reducedMotion ? ' entry-curtain--reduced' : ''}`} aria-hidden="true"
    onAnimationEnd={event => { if (event.target === event.currentTarget) onComplete(); }}>
    {direction === 'out' && <>
    <svg className="entry-gateway-field" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-paper`} cx={cx} cy={cy} r="85%">
          <stop offset="0" stopColor="color-mix(in srgb, var(--welcome-action) 12%, var(--welcome-background))" /><stop offset=".45" stopColor="color-mix(in srgb, var(--welcome-action) 5%, var(--welcome-background))" />
          <stop offset="1" stopColor="var(--welcome-background)" />
        </radialGradient>
        <pattern id={`${id}-grid`} width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M42 0H0V42" fill="none" stroke="var(--welcome-action)" strokeWidth=".65" opacity=".16" />
        </pattern>
        <mask id={`${id}-iris`} x="0" y="0" width="100%" height="100%" maskUnits="userSpaceOnUse" style={{ maskType: 'luminance' }}>
          <rect width="100%" height="100%" fill="white" />
          <circle className="entry-gateway-hole" cx={cx} cy={cy} r="0" fill="black" />
        </mask>
      </defs>
      <g mask={`url(#${id}-iris)`}>
        <rect width="100%" height="100%" fill={`url(#${id}-paper)`} />
        <rect width="100%" height="100%" fill={`url(#${id}-grid)`} />
      </g>
      {field}
    </svg>
    <div className="entry-gateway-brand">
      <div className="entry-gateway-eyebrow"><LabMark /><span>{tr("A NEW PERSPECTIVE")}</span></div>
      <div className="entry-gateway-wordmark"><span>DIMENSION</span><span className="entry-gateway-slash">/</span><span>LAB</span></div>
      <div className="entry-gateway-caption"><span>{tr("RETURNING TO WELCOME")}</span><i /></div>
    </div>
    </>}
  </div>;
}
