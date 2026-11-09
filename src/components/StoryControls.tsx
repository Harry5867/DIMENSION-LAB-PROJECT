import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { storyCategories, type StoryFilter, type StoryRecord } from './storyData';
import { storyTopicLabel, useWelcomeLanguage } from './WelcomeLanguage';
import { localizeStory } from './storyLanguage';

function StoryImage({ story }: { story: StoryRecord }) {
  const { t } = useWelcomeLanguage();
  const [failed, setFailed] = useState(false);
  return failed ? <div className="story-image-placeholder" role="img" aria-label={story.imageAlt}>{t('Photo unavailable', 'Không tải được ảnh')}</div>
    : <img className="story-panel-image" src={`${import.meta.env.BASE_URL}${story.imageUrl}`} alt={story.imageAlt} decoding="async" onError={() => setFailed(true)} />;
}
export function StoryControls({ stories, filtered, category, selected: sourceStory, error, onCategory, onSelect, onClose, onRetry, onAtlas, categoryRef }: {
  stories: StoryRecord[] | null; filtered: StoryRecord[]; category: StoryFilter; selected: StoryRecord | null; error: boolean;
  onCategory: (category: StoryFilter) => void; onSelect: (id: string | null, trigger: HTMLElement) => void;
  onClose: () => void; onRetry: () => void; onAtlas: (story: StoryRecord) => void;
  categoryRef: React.RefObject<HTMLSelectElement | null>;
}) {
  const { language, t } = useWelcomeLanguage();
  const selected = sourceStory && localizeStory(sourceStory, language);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(() => {
      close.current?.closest('.story-information')?.scrollIntoView({ block: 'nearest' });
      close.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected?.id]);
  return <aside className={`globe-story-panel${selected ? ' story-is-open' : ''}`} aria-label={t('Story controls', 'Điều khiển câu chuyện')}>
      <div className="story-controls-body">
        {error ? <div role="alert"><p>{t('Stories could not be loaded.', 'Không tải được các câu chuyện.')}</p><button type="button" onClick={onRetry}>{t('Try again', 'Thử lại')}</button></div>
          : !stories ? <p role="status">{t('Loading stories…', 'Đang tải câu chuyện…')}</p> : <>
            <div className="story-filter-bar"><label htmlFor="story-category">{t('Topic', 'Chủ đề')}</label>
            <select ref={categoryRef} id="story-category" value={category} onChange={event => onCategory(event.currentTarget.value as StoryFilter)}>
              <option value="All">{t('All topics', 'Tất cả chủ đề')}</option>{storyCategories.map(item => <option key={item} value={item}>{storyTopicLabel(item, language)}</option>)}
            </select>
            <p className="story-count" role="status">{filtered.length} {t(filtered.length === 1 ? 'story' : 'stories', 'câu chuyện')}{t(' · global perspectives', ' · góc nhìn toàn cầu')}</p>
            {!filtered.length && <p>{t('No stories in this topic.', 'Chưa có câu chuyện cho chủ đề này.')}</p>}
            <details className="story-directory">
              <summary>{t('Browse stories', 'Danh sách câu chuyện')} <ChevronDown size={14} aria-hidden="true" /></summary>
              <label className="sr-only" htmlFor="story-select">{t('Choose a story', 'Chọn câu chuyện')}</label>
              <select id="story-select" value={selected?.id ?? ''} onChange={event => onSelect(event.currentTarget.value || null, event.currentTarget)}>
                <option value="">{t('Choose a story', 'Chọn câu chuyện')}</option>{filtered.map(story => {
                  const entry = localizeStory(story, language);
                  return <option key={story.id} value={story.id}>{entry.city} · {entry.title}</option>;
                })}
              </select>
            </details>
            </div>
            {!selected && filtered.length > 0 && <p className="story-selection-hint">{t('Select a story on the globe, or choose one from the list.', 'Chọn một câu chuyện trên quả cầu hoặc từ danh sách.')}</p>}
            {selected && <section className="story-information" aria-labelledby="story-title" key={selected.id}>
              <header><span>{storyTopicLabel(selected.category, language)} · {selected.demo ? t('DEMO / ', 'MẪU / ') : ''}{selected.year}</span><button ref={close} type="button" onClick={onClose} aria-label={t('Close story details', 'Đóng nội dung câu chuyện')}><X size={15} /></button></header>
              <div className="story-detail-intro"><StoryImage key={selected.id} story={selected} />
                <div><h2 id="story-title">{selected.title}</h2><p className="story-location">{selected.city}, {selected.country}</p></div>
              </div>
              <p>{selected.description}</p>
              <details className="story-data-reference"><summary>{t('Related data', 'Dữ liệu liên quan')}{selected.demo ? t(' · demo schema', ' · cấu trúc mẫu') : ''} <ChevronDown size={14} aria-hidden="true" /></summary><p>{selected.datasetReference}</p></details>
              <p className="story-source">{selected.source.url ? <a href={selected.source.url} target="_blank" rel="noreferrer">{t('Source', 'Nguồn')} · {selected.source.label}</a> : `${t('Source', 'Nguồn')} · ${selected.source.label}`}</p>
              <p className="story-photo-credit">{t('Photo', 'Ảnh')}: <a href={selected.photo.url} target="_blank" rel="noreferrer">{selected.photo.author}</a> · <a href={selected.photo.licenseUrl} target="_blank" rel="noreferrer">{selected.photo.license}</a><br /><small>{selected.photo.changes}</small></p>
              {selected.demo && <p className="story-demo-note">{t('Real location photograph; conceptual data story. No measured statistical findings are claimed.', 'Ảnh địa điểm thật; câu chuyện dữ liệu mang tính ý tưởng, không thể hiện kết quả thống kê đo lường.')}</p>}
              <button className="story-atlas-action" type="button" onClick={() => { if (sourceStory) onAtlas(sourceStory); }}>{t('View place in Atlas ↗', 'Xem địa điểm trên bản đồ ↗')}</button>
            </section>}
            <p className="story-earth-credit">{t('Earth imagery', 'Ảnh Trái Đất')} · <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/" target="_blank" rel="noreferrer">NASA Blue Marble</a></p>
          </>}
      </div>
  </aside>;
}
