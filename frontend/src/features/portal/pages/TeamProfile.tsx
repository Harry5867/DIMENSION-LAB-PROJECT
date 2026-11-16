import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { teamMembers, type TeamMember } from '../data/teamMembers';
import { dampCarousel } from '../navigation/carousel';
import { shouldAnimateLink } from '../navigation/sectionTransition';
import { aboutTeamHref, aboutTeamSelection } from '../../../shared/navigation/portalNavigation';
import { useMemberDrag } from '../navigation/useMemberDrag';
import { useAppLanguage } from '../../../shared/providers/WelcomeLanguage';
import '../styles/team-profile.css';

const profileHref = (member: TeamMember) => '#/about/' + member.slug;
const wrap = (position: number) => (position % teamMembers.length + teamMembers.length) % teamMembers.length;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const memberStep = .62;
const visibleArc = memberStep * 2.4;

function memberPose(distance: number) {
  const angle = Math.max(-visibleArc, Math.min(visibleArc, distance * memberStep));
  const cosine = Math.cos(angle);
  const focus = Math.max(0, (cosine - Math.cos(memberStep)) / (1 - Math.cos(memberStep)));
  const edge = Math.max(0, (Math.abs(angle) - memberStep) / (visibleArc - memberStep));
  const fade = edge * edge * (3 - 2 * edge);
  return {
    x: Math.sin(angle) / Math.sin(memberStep),
    z: 620 * (cosine - 1),
    yaw: -angle * 36,
    scale: .62 + .38 * cosine,
    opacity: (.68 + .32 * focus) * (1 - fade),
    focus,
  };
}

function TeamAvatar({ member }: { member: TeamMember }) {
  const [failedSource, setFailedSource] = useState<string>();
  const { photo } = member;
  const names = member.name.trim().split(/\s+/);
  const initials = names[0].slice(0, 1) + (names.length > 1 ? names.at(-1)!.slice(0, 1) : '');
  const hasPhoto = Boolean(photo?.src && photo.src !== failedSource);
  return <div className="portal-team-avatar" data-photo={hasPhoto || undefined} aria-hidden="true">
    {hasPhoto && photo
      ? <img src={photo.src} alt="" draggable={false} style={{ objectPosition: photo.position }} onError={() => setFailedSource(photo.src)} />
      : <><span className="member-avatar-orbits"><i /><i /><i /></span>
        <span className="member-avatar-initials">{initials.toUpperCase()}</span></>}
  </div>;
}

function MemberCard({ member }: { member: TeamMember }) {
  return <div className="member-card">
    <div className="member-card-surface">
      <header className="member-card-heading">
        <strong>{member.name}</strong>
      </header>
      <TeamAvatar member={member} />
    </div>
  </div>;
}

export function TeamBrowser({ hash, onOpenMember }: {
  hash: string; onOpenMember: (member: TeamMember, source: HTMLAnchorElement) => void;
}) {
  const { tr } = useAppLanguage();
  const count = teamMembers.length;
  const [selected, setSelected] = useState(() => {
    const slug = aboutTeamSelection(hash);
    const index = teamMembers.findIndex(member => member.slug === slug);
    return index < 0 ? Math.floor(count / 2) : index;
  });
  const [position, setPosition] = useState(selected);
  const visualPosition = useRef(position);
  const destination = useRef(selected);
  const tick = useRef(0);
  const cursorFrame = useRef(0);

  useEffect(() => () => {
    cancelAnimationFrame(tick.current);
    cancelAnimationFrame(cursorFrame.current);
  }, []);

  function updatePosition(value: number) {
    visualPosition.current = value;
    setPosition(value);
  }

  function slide(to: number, releaseVelocity?: number) {
    cancelAnimationFrame(tick.current);
    destination.current = to;
    const from = visualPosition.current;
    if (reduceMotion() || Math.abs(from - to) < .002) {
      updatePosition(to);
      return;
    }
    const start = performance.now();
    const distance = to - from;
    if (releaseVelocity !== undefined) {
      // Limit the release impulse to the direction of the nearest slot.
      // The same damped spring used in Workspace then approaches it without overshooting.
      const direction = Math.sign(distance);
      let speed = direction * Math.max(0, Math.min(16 * Math.abs(distance), releaseVelocity * 1000 * direction));
      let previousFrame = start;
      function settleFrame(now: number) {
        const next = dampCarousel(visualPosition.current, speed, to, (now - previousFrame) / 1000);
        previousFrame = now;
        speed = next.velocity;
        if (Math.abs(next.position - to) < .001 && Math.abs(speed) < .025) {
          updatePosition(to);
          return;
        }
        updatePosition(next.position);
        tick.current = requestAnimationFrame(settleFrame);
      }
      tick.current = requestAnimationFrame(settleFrame);
      return;
    }
    function frame(now: number) {
      const progress = Math.max(0, Math.min(1, (now - start) / 610));
      const fraction = progress ** 2 * (3 - 2 * progress);
      updatePosition(from + distance * fraction);
      if (progress < 1) tick.current = requestAnimationFrame(frame);
    }
    tick.current = requestAnimationFrame(frame);
  }

  function save(position: number) {
    const member = teamMembers[wrap(position)];
    window.history.replaceState(window.history.state, '', aboutTeamHref(member.slug));
    setSelected(position);
  }

  function settle(target: number, releaseVelocity?: number) {
    save(target);
    slide(target, releaseVelocity);
  }

  const { dragging, dragHandlers } = useMemberDrag(count, element => {
    const width = element.querySelector<HTMLAnchorElement>('.member-gallery-open')?.offsetWidth ?? 0;
    const spacing = Number(getComputedStyle(element).getPropertyValue('--member-spacing'));
    cancelAnimationFrame(tick.current);
    return { step: width * spacing, position: visualPosition.current };
  }, updatePosition, settle);

  function trackCursor(event: PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== 'mouse' || event.buttons !== 0 || dragging || reduceMotion()) return;
    const { currentTarget: card, clientX, clientY } = event;
    cancelAnimationFrame(cursorFrame.current);
    cursorFrame.current = requestAnimationFrame(() => {
      if (!card.isConnected || !card.matches(':hover')) return;
      // Measure the link, whose bounds stay independent of the hover transform.
      const bounds = card.getBoundingClientRect();
      const normalize = (point: number, start: number, size: number) =>
        Math.max(-1, Math.min(1, (point - start) * 2 / Math.max(size, 1) - 1));
      card.style.setProperty('--member-cursor-x', String(normalize(clientX, bounds.left, bounds.width)));
      card.style.setProperty('--member-cursor-y', String(normalize(clientY, bounds.top, bounds.height)));
      card.setAttribute('data-member-hovered', '');
    });
  }

  function resetCursor(event: PointerEvent<HTMLAnchorElement>) {
    cancelAnimationFrame(cursorFrame.current);
    event.currentTarget.removeAttribute('data-member-hovered');
  }

  if (!count) return <h1>{tr('About us')}</h1>;
  const middle = Math.round(position);
  // Recycle slots beyond the visible arc so crossing the loop keeps the same cards in view.
  const slots = count === 1 ? [0] : Array.from({ length: 7 }, (_, offset) => middle + offset - 3);

  return <section className="member-gallery" aria-labelledby="member-gallery-title"
    data-static={count === 1 || undefined} data-dragging={dragging || undefined} {...dragHandlers}
    onDragStart={event => event.preventDefault()}>
    <h1 id="member-gallery-title" className="member-watermark">{tr('About us')}</h1>
    <span id="member-gallery-instructions" className="sr-only">{tr('Use the arrow keys to browse members and Enter to open a profile.')}</span>
    <div className="member-gallery-stage" tabIndex={0} role="group"
      aria-label={tr('Member profiles')} aria-describedby={count > 1 ? 'member-gallery-instructions' : undefined}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || dragging) return;
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          event.preventDefault();
          event.currentTarget.querySelector<HTMLAnchorElement>('.member-gallery-open')?.click();
        }
        if (count < 2 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        settle(destination.current + (event.key === 'ArrowLeft' ? -1 : 1));
      }}>
      {slots.map(slot => {
        const member = teamMembers[wrap(slot)];
        const distance = slot - position;
        const pose = memberPose(distance);
        const active = slot === selected;
        const exposed = Math.abs(distance) * memberStep < visibleArc;
        const style = {
          '--member-x': pose.x,
          '--member-z': pose.z + 'px',
          '--member-turn': pose.yaw + 'deg',
          '--member-scale': pose.scale,
          '--member-focus': pose.focus,
          '--member-opacity': pose.opacity,
        } as CSSProperties;
        return <div key={slot} className="member-gallery-slot" style={style}
          aria-hidden={!exposed || undefined} inert={!exposed}>
          <a className={`member-gallery-card${active ? ' member-gallery-open' : ''}`}
            href={profileHref(member)} tabIndex={active || Math.abs(slot - selected) === 1 ? 0 : -1}
            aria-label={tr('View the profile of {name}').replace('{name}', member.name)}
            onPointerEnter={trackCursor} onPointerMove={trackCursor}
            onPointerLeave={resetCursor} onPointerCancel={resetCursor}
            onClick={event => {
              if (!shouldAnimateLink(event, event.currentTarget.target, event.currentTarget.hasAttribute('download'))) return;
              event.preventDefault();
              cancelAnimationFrame(tick.current);
              cancelAnimationFrame(cursorFrame.current);
              onOpenMember(member, event.currentTarget);
            }}>
            <MemberCard member={member} />
          </a>
        </div>;
      })}
    </div>
  </section>;
}

export function TeamProfile({ member }: { member: TeamMember | null }) {
  const { tr } = useAppLanguage();
  if (!member) return <div className="portal-content-heading portal-team-error">
    <h1>{tr('Team member not found')}</h1>
    <p>{tr('Check the address or choose a member from the team page.')}</p>
  </div>;
  return <article className="member-profile" aria-labelledby="member-profile-name">
    <div className="member-profile-card">
      <div className="member-profile-portrait">
        <TeamAvatar member={member} />
      </div>
      <div className="member-profile-copy">
        <header>
          <h1 id="member-profile-name">{member.name}</h1>
          <p className="member-profile-role">{member.role}</p>
        </header>
        <section>
          <h2>Interests</h2>
          <p>{member.interests}</p>
        </section>
        <section>
          <h2>Project Responsibilities</h2>
          <ul>{member.responsibilities.map(responsibility => <li key={responsibility}>{responsibility}</li>)}</ul>
        </section>
      </div>
    </div>
  </article>;
}
