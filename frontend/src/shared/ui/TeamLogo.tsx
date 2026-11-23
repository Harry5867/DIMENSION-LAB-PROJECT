import type { Ref } from 'react';
import logoUrl from '../visuals/dimension-interwoven-logo.png';
import './team-logo.css';

export function TeamLogo({ label, formation = false, ref }: { label?: string; formation?: boolean; ref?: Ref<HTMLSpanElement> }) {
  return <span ref={ref} className="team-logo" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <img src={logoUrl} alt="" draggable={false} />
    {formation && <span className="team-logo-formation" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <span className="team-logo-ribbon" data-ribbon={index} key={index}>
        <img src={logoUrl} alt="" draggable={false} />
      </span>)}
    </span>}
  </span>;
}
