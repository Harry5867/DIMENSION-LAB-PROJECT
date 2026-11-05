import type { MutableRefObject } from 'react';
import type { StoryGroup } from './storyData';

export function StoryMarkers({ groups, nodes, hovered, selected, onHover, onOpen }: {
  groups: StoryGroup[]; nodes: MutableRefObject<Map<string, HTMLButtonElement>>;
  hovered: string | null; selected: string | null;
  onHover: (key: string | null) => void;
  onOpen: (group: StoryGroup, trigger: HTMLButtonElement) => void;
}) {
  return <>{groups.map(group => {
    const first = group.members[0], clustered = group.members.length > 1;
    const previewId = `story-preview-${group.key.replaceAll(':', '-')}`;
    const active = group.members.some(story => story.id === selected);
    return <button key={group.key} hidden type="button" className={`story-marker${clustered ? ' story-cluster' : ''}`}
      ref={node => { if (node) nodes.current.set(group.key, node); else nodes.current.delete(group.key); }}
      aria-label={clustered ? `${group.members.length} stories: ${group.members.map(story => story.city).join(', ')}` : `${first.title} · ${first.city} · ${first.demo ? 'Demo' : first.year}`}
      aria-pressed={active} aria-describedby={hovered === group.key ? previewId : undefined}
      onPointerEnter={event => { if (event.pointerType === 'mouse') onHover(group.key); }}
      onPointerLeave={() => onHover(null)} onFocus={() => onHover(group.key)} onBlur={() => onHover(null)}
      onClick={event => onOpen(group, event.currentTarget)}>
      <span className="story-tether" hidden aria-hidden="true" />
      <span className="story-anchor" hidden aria-hidden="true" />
      <span className="story-marker-art" aria-hidden="true">
        <span className="story-marker-fallback">{first.category.slice(0, 2).toUpperCase()}</span>
        <img data-src={`${import.meta.env.BASE_URL}${first.imageUrl}`} alt="" loading="lazy" decoding="async" onError={event => { event.currentTarget.hidden = true; }} />
      </span>
      <span className="story-marker-badge" data-kind={clustered ? 'count' : 'demo'} aria-hidden="true">{clustered ? group.members.length : first.demo ? 'DEMO' : ''}</span>
      {hovered === group.key && <span id={previewId} className="story-marker-preview" role="tooltip">
        <small>{clustered ? `${group.members.length} STORIES` : `${first.category.toUpperCase()} · ${first.demo ? 'DEMO / ' : ''}${first.year}`}</small>
        <strong>{clustered ? group.members.map(story => story.city).join(' · ') : first.title}</strong>
        <span>{clustered ? 'Select to zoom in and separate these stories.' : `${first.city}, ${first.country}`}</span>
        {!clustered && <span>{first.description}</span>}
      </span>}
    </button>;
  })}</>;
}
