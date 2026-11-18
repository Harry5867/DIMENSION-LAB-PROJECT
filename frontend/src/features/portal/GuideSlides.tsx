import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { guideChapters, type GuideChapter } from '../../shared/navigation/portalNavigation';
import { guideSlides } from './data/guideSlides';
import './styles/guide-slides.css';

const images = import.meta.glob<string>('./guide-slides/*.webp', {
  eager: true,
  import: 'default',
  query: '?url',
});

const slideDelayMs = 7_000;

export type OpenGuideChapter = (chapter: GuideChapter, event: MouseEvent<HTMLAnchorElement>) => void;

export function GuideSlides({ chapter, startAtLast, onOpenChapter }: {
  chapter: GuideChapter;
  startAtLast: boolean;
  onOpenChapter: OpenGuideChapter;
}) {
  const slides = guideSlides[chapter.slug];
  const lastIndex = slides.length - 1;
  const [index, setIndex] = useState(startAtLast ? lastIndex : 0);
  const [playing, setPlaying] = useState(true);
  const previousChapterLink = useRef<HTMLAnchorElement>(null);
  const nextChapterLink = useRef<HTMLAnchorElement>(null);
  const slide = slides[index];
  const autoAdvance = playing && index < lastIndex;
  const chapterIndex = guideChapters.indexOf(chapter);
  const previousChapter = guideChapters[chapterIndex - 1];
  const nextChapter = guideChapters[chapterIndex + 1];
  const nextImage = index < lastIndex ? images[`./guide-slides/${slides[index + 1].image}.webp`] : undefined;

  useEffect(() => {
    if (!autoAdvance) return;
    const timer = window.setTimeout(() => setIndex(index + 1), slideDelayMs);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, index]);

  useEffect(() => {
    if (!nextImage) return;
    const image = new Image();
    image.src = nextImage;
  }, [nextImage]);

  const move = useCallback((offset: number) => {
    setPlaying(false);
    setIndex(current => Math.max(0, Math.min(lastIndex, current + offset)));
  }, [lastIndex]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowLeft' && (index > 0 || previousChapterLink.current)) {
        event.preventDefault();
        if (event.repeat) return;
        if (index > 0) move(-1);
        else previousChapterLink.current?.click();
      } else if (event.key === 'ArrowRight' && (index < lastIndex || nextChapterLink.current)) {
        event.preventDefault();
        if (event.repeat) return;
        if (index < lastIndex) move(1);
        else nextChapterLink.current?.click();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [index, lastIndex, move]);

  return (
    <section className="portal-prose portal-guide-slides" aria-label={chapter.title}>
      <figure aria-live={autoAdvance ? 'off' : 'polite'}>
        <img key={slide.image} className="guide-slide-image" src={images[`./guide-slides/${slide.image}.webp`]} alt="" />
        <figcaption lang="en">
          <h2>{slide.title}</h2>
          <p>{slide.description}</p>
        </figcaption>
      </figure>
      <div className="guide-slide-controls" role="group" aria-label="Slide controls">
        {index === 0 && previousChapter ? (
          <a ref={previousChapterLink} className="back-control" aria-keyshortcuts="ArrowLeft" href={'#/guide/' + previousChapter.slug + '?slide=last'}
            onClick={event => onOpenChapter(previousChapter, event)}>Previous chapter</a>
        ) : (
          <button type="button" className="back-control" aria-keyshortcuts="ArrowLeft" onClick={() => move(-1)} disabled={index === 0}>Previous</button>
        )}
        <div className="guide-slide-playback">
          <button type="button" className="back-control" onClick={() => setPlaying(value => !value)} disabled={index === lastIndex}>
            {autoAdvance ? 'Pause' : 'Play'}
          </button>
          <span className="guide-slide-count">{index + 1} / {slides.length}</span>
        </div>
        {index === lastIndex && nextChapter ? (
          <a ref={nextChapterLink} className="back-control" aria-keyshortcuts="ArrowRight" href={'#/guide/' + nextChapter.slug}
            onClick={event => onOpenChapter(nextChapter, event)}>Next chapter</a>
        ) : (
          <button type="button" className="back-control" aria-keyshortcuts="ArrowRight" onClick={() => move(1)} disabled={index === lastIndex}>Next</button>
        )}
      </div>
      {chapter.slug === 'quick-start' && <a className="portal-action" href="#/explore">Open Model</a>}
    </section>
  );
}
