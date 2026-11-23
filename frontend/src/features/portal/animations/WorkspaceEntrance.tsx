import type { CSSProperties } from 'react';
import { WorkspaceFlight, workspaceFlightTiming, type WorkspaceEntrancePhase, type WorkspaceFlightDirection } from './WorkspaceFlight';

export function WorkspaceEntrance({ phase, onComplete, direction, reducedMotion }: {
  phase: WorkspaceEntrancePhase; onComplete: () => void;
  direction: WorkspaceFlightDirection; reducedMotion: boolean;
}) {
  const { cover, prepare, reveal } = workspaceFlightTiming[direction];
  const style = {
    '--flight-cover-duration': `${cover}ms`,
    '--flight-prepare-duration': `${prepare}ms`,
    '--flight-reveal-duration': `${reveal}ms`,
    '--flight-glow-duration': `${cover + prepare}ms`,
  } as CSSProperties;

  return <div
    className={`entry-curtain entry-curtain--${phase} entry-curtain--${direction}${reducedMotion ? '' : ' entry-curtain--flight'}`}
    style={style}
    aria-hidden="true"
    onAnimationEnd={event => { if (event.target === event.currentTarget && !event.nativeEvent.pseudoElement) onComplete(); }}
  >
    {!reducedMotion && <WorkspaceFlight direction={direction} phase={phase} />}
  </div>;
}
