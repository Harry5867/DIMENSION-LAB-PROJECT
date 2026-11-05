import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { storyCategories, type StoryFilter, type StoryRecord } from './storyData';

function StoryImage({ story }: { story: StoryRecord }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="story-image-placeholder" role="img" aria-label={story.imageAlt}>Illustration unavailable</div>
    : <img className="story-panel-image" src={`${import.meta.env.BASE_URL}${story.imageUrl}`} alt={story.imageAlt} decoding="async" onError={() => setFailed(true)} />;
}
export function StoryControls({ stories, filtered, category, selected, error, onCategory, onSelect, onClose, onRetry, onAtlas, categoryRef }: {
  stories: StoryRecord[] | null; filtered: StoryRecord[]; category: StoryFilter; selected: StoryRecord | null; error: boolean;
  onCategory: (category: StoryFilter) => void; onSelect: (id: string | null, trigger: HTMLElement) => void;
  onClose: () => void; onRetry: () => void; onAtlas: (story: StoryRecord) => void;
  categoryRef: React.RefObject<HTMLSelectElement | null>;
}) {
  const [expanded, setExpanded] = useState(() => matchMedia('(min-width: 600px)').matches);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!selected) return;
    setExpanded(true);
    const frame = requestAnimationFrame(() => close.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [selected?.id]);
  return <aside className={`globe-story-panel${selected ? ' story-is-open' : ''}`} aria-label="Story controls">
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>Visual stories <span>{!stories || stories.every(story => story.demo) ? 'DEMO' : 'COLLECTION'}</span></summary>
      <div className="story-controls-body">
        {error ? <div role="alert"><p>Stories could not be loaded.</p><button type="button" onClick={onRetry}>Try again</button></div>
          : !stories ? <p role="status">Loading stories…</p> : <>
            <label htmlFor="story-category">Topic</label>
            <select ref={categoryRef} id="story-category" value={category} onChange={event => onCategory(event.currentTarget.value as StoryFilter)}>
              <option value="All">All topics</option>{storyCategories.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <p className="story-count" role="status">{filtered.length} {filtered.length === 1 ? 'story' : 'stories'}{stories.every(story => story.demo) ? ' · illustrated demos' : ''}</p>
            {!filtered.length && <p>No stories in this topic.</p>}
            <details className="story-directory">
              <summary>Browse stories</summary>
              <label className="sr-only" htmlFor="story-select">Choose a story</label>
              <select id="story-select" value={selected?.id ?? ''} onChange={event => onSelect(event.currentTarget.value || null, event.currentTarget)}>
                <option value="">Choose a story</option>{filtered.map(story => <option key={story.id} value={story.id}>{story.city} · {story.title}</option>)}
              </select>
            </details>
            {selected && <section className="story-information" aria-labelledby="story-title">
              <header><span>{selected.category} · {selected.demo ? 'DEMO / ' : ''}{selected.year}</span><button ref={close} type="button" onClick={onClose} aria-label="Close story details"><X size={15} /></button></header>
              <StoryImage key={selected.id} story={selected} />
              <h2 id="story-title">{selected.title}</h2><p className="story-location">{selected.city}, {selected.country}</p>
              <p>{selected.description}</p>
              <details className="story-data-reference"><summary>Related data{selected.demo ? ' · demo schema' : ''}</summary><p>{selected.datasetReference}</p></details>
              <p className="story-source">{selected.source.url ? <a href={selected.source.url} target="_blank" rel="noreferrer">Source · {selected.source.label}</a> : `Source · ${selected.source.label}`}</p>
              {selected.demo && <p className="story-demo-note">Original illustration. No statistical findings are claimed.</p>}
              <button className="story-atlas-action" type="button" onClick={() => onAtlas(selected)}>View place in Atlas ↗</button>
            </section>}
          </>}
      </div>
    </details>
  </aside>;
}
