import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { ArrowRight } from 'lucide-react';
import { portalSections, type PortalSection } from '../utils/portalNavigation';
import { shouldAnimateLink } from '../utils/sectionTransition';
import type { AtmosphereSignal } from '../visuals/atmosphere';
import { useAppLanguage } from './WelcomeLanguage';
import { WorkspaceSectionIcon } from './WorkspaceSectionIcon';
import './workspace-map.css';

type Station = PortalSection['id'];
type Point = readonly [x: number, y: number];
const positions: Record<Station, { wide: Point; compact: Point }> = {
  theory: { wide: [8, 27], compact: [22, 12] },
  model: { wide: [44, 48], compact: [22, 49] },
  about: { wide: [76, 24], compact: [22, 31] },
  guide: { wide: [76, 74], compact: [22, 68] },
  library: { wide: [9, 80], compact: [22, 87] },
};
const branchSections = portalSections.filter(section => section.id !== 'model');
type Branch = typeof branchSections[number]['id'];
const branches: Record<Branch, string> = {
  theory: 'M44 48 C28 48 20 30 8 27',
  about: 'M44 48 C58 48 62 24 76 24',
  guide: 'M44 48 C60 50 60 72 76 74',
  library: 'M44 48 C30 48 24 76 9 80',
};
const layouts = [
  { name: 'wide', paths: branches },
  {
    name: 'compact',
    paths: Object.fromEntries(branchSections.map(({ id }) => {
      const [x, y] = positions[id].compact;
      const direction = Math.sign(y - 49);
      return [id, `M22 49 H14 Q8 49 8 ${49 + direction * 6} V${y - direction * 6} Q8 ${y} 14 ${y} H${x}`];
    })) as Record<Branch, string>,
  },
];

export function WorkspaceMap({ backgroundSignal, onOpenSection, openingId, active }: {
  backgroundSignal: RefObject<AtmosphereSignal>;
  onOpenSection?: (section: PortalSection, link: HTMLAnchorElement) => void;
  openingId?: Station;
  active: boolean;
}) {
  const { tr } = useAppLanguage();
  const map = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState<Station | null>(null);
  const [focused, setFocused] = useState<Station | null>(null);
  const [visible, setVisible] = useState(false);
  const station = openingId ?? hovered ?? focused ?? 'model';

  useEffect(() => {
    const element = map.current;
    if (!element) return;
    let intersecting = false;
    const sync = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(entries => {
      intersecting = entries[0]?.isIntersecting ?? false;
      sync();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  useEffect(() => {
    const element = map.current;
    if (!element) return;
    const sync = () => {
      const point = element.querySelector(`[data-station="${station}"] .workspace-map-beacon`)?.getBoundingClientRect();
      if (!point) return;
      backgroundSignal.current.focusX = (point.left + point.width / 2) / Math.max(1, innerWidth);
      backgroundSignal.current.focusY = (point.top + point.height / 2) / Math.max(1, innerHeight);
    };
    backgroundSignal.current.slow = active && (hovered !== null || focused !== null);
    sync();
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      backgroundSignal.current.slow = false;
    };
  }, [active, backgroundSignal, focused, hovered, station]);

  return <nav ref={map} className="workspace-map" aria-label={tr('Workspace sections')}
    data-active-station={station} data-opening={openingId} data-paused={!active || !visible || undefined}>
    {layouts.map(({ name, paths }) => <svg key={name}
      className={'workspace-map-geometry workspace-map-geometry--' + name} viewBox="0 0 100 100"
      preserveAspectRatio="none" aria-hidden="true">
      {branchSections.map(({ id }) => <g key={id} className="workspace-map-branch" data-branch={id}
        data-highlight={station === id || undefined}>
        <path className="workspace-map-track" d={paths[id]} />
        <path className="workspace-map-signal" d={paths[id]} />
        <path className="workspace-map-trail" d={paths[id]} pathLength="100" />
        <path className="workspace-map-particles" d={paths[id]} pathLength="100" />
      </g>)}
    </svg>)}
    {portalSections.map((section, index) => {
      const { wide, compact } = positions[section.id];
      return <a key={section.id} className="workspace-map-link" href={section.href} data-station={section.id}
        data-highlight={station === section.id || undefined} data-opening={openingId === section.id || undefined}
        style={{
          '--station-x': wide[0] + '%', '--station-y': wide[1] + '%',
          '--compact-x': compact[0] + '%', '--compact-y': compact[1] + '%',
          '--station-delay': 240 + index * 70 + 'ms',
        } as CSSProperties}
        onPointerEnter={event => { if (event.pointerType !== 'touch') setHovered(section.id); }}
        onPointerMove={event => {
          if (event.pointerType !== 'touch' && hovered !== section.id) setHovered(section.id);
        }}
        onPointerLeave={() => setHovered(null)}
        onFocus={() => {
          setHovered(null);
          setFocused(section.id);
        }}
        onBlur={() => setFocused(null)}
        onClick={event => {
          if (!onOpenSection || window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
            !shouldAnimateLink(event, event.currentTarget.target, event.currentTarget.hasAttribute('download'))) return;
          event.preventDefault();
          onOpenSection(section, event.currentTarget);
        }}>
        <span className="workspace-map-beacon" aria-hidden="true"><span /></span>
        <WorkspaceSectionIcon section={section.id} />
        <span className="workspace-map-caption">
          <span className="workspace-map-number" aria-hidden="true">{section.number}</span>
          <span className="workspace-map-title">{tr(section.title)}</span>
          <ArrowRight className="workspace-map-arrow" aria-hidden="true" />
        </span>
      </a>;
    })}
  </nav>;
}
