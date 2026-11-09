import type { MutableRefObject } from 'react';
import type { StoryGroup } from './storyData';
import { storyTopicLabel, useWelcomeLanguage } from './WelcomeLanguage';
import { localizeStory } from './storyLanguage';

export function StoryMarkers({ groups, nodes, hovered, selected, onHover, onOpen }: {
  groups: StoryGroup[]; nodes: MutableRefObject<Map<string, HTMLButtonElement>>;
  hovered: string | null; selected: string | null;
  onHover: (key: string | null) => void;
  onOpen: (group: StoryGroup, trigger: HTMLButtonElement) => void;
}) {
  const { language, t } = useWelcomeLanguage();
  return <>{groups.map(group => {
    const first = localizeStory(group.members[0], language), clustered = group.members.length > 1;
    const previewId = `story-preview-${group.key.replaceAll(':', '-')}`;
    const active = group.members.some(story => story.id === selected);
    return <button key={group.key} hidden type="button" className={`story-marker${clustered ? ' story-cluster' : ''}`}
      ref={node => { if (node) nodes.current.set(group.key, node); else nodes.current.delete(group.key); }}
      aria-label={clustered ? `${group.members.length} ${t('stories', 'câu chuyện')}: ${group.members.map(story => localizeStory(story, language).city).join(', ')}` : `${first.title} · ${first.city} · ${first.demo ? t('Demo', 'Mẫu') : first.year}`}
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
      {clustered && <span className="story-marker-badge" data-kind="count" aria-hidden="true">{group.members.length}</span>}
      {hovered === group.key && <span id={previewId} className="story-marker-preview" role="tooltip">
        <small>{clustered ? `${group.members.length} ${t('STORIES', 'CÂU CHUYỆN')}` : `${storyTopicLabel(first.category, language).toUpperCase()} · ${first.demo ? t('DEMO / ', 'MẪU / ') : ''}${first.year}`}</small>
        <strong>{clustered ? `${group.members.length} ${t('stories', 'câu chuyện')}` : first.title}</strong>
        <span>{clustered ? t('Select to zoom in and separate these stories.', 'Chọn để phóng to và xem riêng từng câu chuyện.') : `${first.city}, ${first.country}`}</span>
      </span>}
    </button>;
  })}</>;
}
