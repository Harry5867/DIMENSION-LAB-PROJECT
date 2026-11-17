import type { Ref } from 'react';
import './team-logo.css';

export function TeamLogo({ label, ref }: { label?: string; ref?: Ref<HTMLSpanElement> }) {
  return <span ref={ref} className="team-logo" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
