import { useLayoutEffect, useRef } from 'react';
import { useAppTheme } from './ThemeProvider';
import { useAppLanguage } from './WelcomeLanguage';
import type { SectionNavigation, TransitionLabel, TransitionRect } from '../utils/sectionTransition';
import './section-transition.css';

const translate = (x: number, y: number, scale = 1) => `translate3d(${x}px,${y}px,0) scale(${scale})`;
const center = (rect: TransitionRect) => [rect.left + rect.width / 2, rect.top + rect.height / 2] as const;
const lift = 9;
const liftScale = 1.045;
function detailPose(rect: TransitionRect, [x, y] = center(rect), scale = 1) {
  return `translate3d(${x}px,${y}px,0) scale(${scale}) translate(${-rect.width / 2}px,${-rect.height / 2}px)`;
}

export function SectionTransition({ navigation, onCovered, onComplete }: {
  navigation: SectionNavigation; onCovered: (id: number) => void; onComplete: (id: number) => void;
}) {
  const { theme } = useAppTheme();
  const { tr } = useAppLanguage();
  const theory = navigation.section?.id === 'theory';
  const root = useRef<HTMLDivElement>(null), paper = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null), title = useRef<HTMLSpanElement>(null), number = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!root.current || !paper.current || !scrim.current) return;
    const sheet = paper.current, wash = scrim.current, animations: Animation[] = [];
    let disposed = false, finished = false, readyTimer: number | undefined, observer: MutationObserver | undefined;
    let firstLayout: number | undefined, secondLayout: number | undefined, revealScheduled = false;
    const source = navigation.source, model = navigation.section?.id === 'model';
    const finalColor = navigation.route === 'overview'
      ? theme === 'dark' ? '#0e1916' : '#fafaf6'
      : theme === 'dark' ? '#101815' : model ? '#fbfbfa' : '#f1eee6';
    wash.style.backgroundColor = finalColor;
    const liftedPose = (rect: TransitionRect, detailScale = 1) => {
      if (theory) return translate(rect.left, rect.top - 7, 1.025);
      if (!source) return detailPose(rect);
      const [x, y] = center(rect), [cx, cy] = center(source.rect);
      return detailPose(rect, [cx + liftScale * (x - cx), cy - lift + liftScale * (y - cy)], liftScale * detailScale);
    };
    const animate = (element: Element, keyframes: Keyframe[], duration: number, easing = 'cubic-bezier(.22,.75,.28,1)') => {
      const animation = element.animate(keyframes, { duration, easing, fill: 'both' });
      animations.push(animation); return animation;
    };
    const finish = () => {
      if (disposed || finished) return;
      finished = true;
      if (navigation.phase === 'covering') {
        sheet.style.transform = 'none'; sheet.style.background = finalColor; sheet.style.borderRadius = '0';
        wash.style.opacity = '1';
        if (theory && source?.title && title.current) {
          title.current.style.transform = liftedPose(source.title.rect);
          if (number.current && source.number) number.current.style.transform = liftedPose(source.number.rect);
        }
        onCovered(navigation.id);
      } else onComplete(navigation.id);
    };
    const place = (element: HTMLSpanElement | null, label?: TransitionLabel) => {
      if (!element || !label) return;
      if (!theory) Object.assign(element.style, { width: label.rect.width + 2 + 'px',
        lineHeight: label.lineHeight + 'px', letterSpacing: label.spacing + 'px' });
      Object.assign(element.style, { opacity: '1', fontSize: label.size + 'px', fontFamily: label.family,
        fontWeight: label.weight, color: label.color, transform: theory ? translate(label.rect.left, label.rect.top) : liftedPose(label.rect) });
    };
    if (navigation.phase === 'covering') {
      if (navigation.kind === 'back' || !source) {
        sheet.style.background = finalColor;
        animate(sheet, [{ opacity: 0 }, { opacity: 1 }], 90, 'ease-out').onfinish = finish;
      } else if (theory) {
        place(title.current, source.title); place(number.current, source.number);
        animate(wash, [{ opacity: 0 }, { opacity: 1 }], 340);
        animate(sheet, [
          { transform: `translate3d(${source.rect.left}px,${source.rect.top}px,0) scale(${source.rect.width / innerWidth},${source.rect.height / innerHeight})`, background: source.background, borderRadius: '36px', boxShadow: '0 20px 60px #35554138' },
          { transform: 'translate3d(0,0,0) scale(1,1)', background: finalColor, borderRadius: '0', boxShadow: '0 0 0 transparent' },
        ], 340).onfinish = finish;
        for (const [element, label] of [[title.current, source.title], [number.current, source.number]] as const) {
          if (element && label) animate(element, [{ transform: translate(label.rect.left, label.rect.top) },
            { transform: translate(label.rect.left, label.rect.top - 7, 1.025) }], 200);
        }
      } else {
        const duration = 350;
        const [x, y] = center(source.rect);
        const scaleX = source.rect.width / innerWidth, scaleY = source.rect.height / innerHeight;
        const paperPose = (yOffset: number, scale: number) =>
          `translate3d(${x - innerWidth / 2}px,${y - innerHeight / 2 - yOffset}px,0) scale(${scaleX * scale},${scaleY * scale})`;
        const corners = `${source.radius / scaleX}px / ${source.radius / scaleY}px`;
        animate(wash, [{ opacity: 0 }, { opacity: .25, offset: .26 }, { opacity: 1 }], duration);
        animate(sheet, [
          { transform: paperPose(0, 1), backgroundColor: source.background, borderRadius: corners, borderColor: source.border, easing: 'ease-out' },
          { transform: paperPose(lift, liftScale), backgroundColor: source.background, borderRadius: corners, borderColor: source.accent, offset: .26, easing: 'cubic-bezier(.35,.15,.23,1)' },
          { transform: 'translate3d(0,0,0) scale(1,1)', backgroundColor: finalColor, borderRadius: '0', borderColor: 'transparent' },
        ], duration, 'linear').onfinish = finish;
        for (const [element, label] of [[title.current, source.title], [number.current, source.number]] as const) {
          if (!element || !label) continue;
          place(element, label);
          animate(element, [{ transform: detailPose(label.rect) }, { transform: liftedPose(label.rect) }], 110);
        }
      }
    } else {
      sheet.style.opacity = '1'; sheet.style.transform = 'none'; sheet.style.background = finalColor;
      sheet.style.borderColor = 'transparent';
      if (title.current) title.current.style.opacity = '0';
      if (number.current) number.current.style.opacity = '0';
      const reveal = () => {
        if (disposed || finished || animations.length) return;
        observer?.disconnect(); window.clearTimeout(readyTimer);
        const duration = navigation.kind === 'back' ? 110 : theory ? 240 : 225;
        animate(wash, [{ opacity: 1 }, { opacity: 0 }], duration, 'ease-out');
        animate(sheet, [{ opacity: 1 }, { opacity: 0 }], duration, 'ease-out').onfinish = finish;
        if (!source) return;
        const heading = document.querySelector<HTMLElement>(model
          ? '.model-session:not([hidden]) .workspace-stage'
          : '.portal-content-heading h1');
        const ordinal = document.querySelector<HTMLElement>('[data-section-number]');
        for (const [element, label, destination] of [[title.current, source.title, heading], [number.current, source.number, ordinal]] as const) {
          if (!element || !label) continue;
          const bounds = destination?.getBoundingClientRect();
          const style = destination && getComputedStyle(destination);
          const size = style && !model ? parseFloat(style.fontSize) : label.size;
          const inset = model ? 16 : 0;
          const x = bounds ? bounds.left + inset : theory ? innerWidth * .05 : label.rect.left;
          const y = bounds ? bounds.top + inset : theory ? 110 : label.rect.top;
          const start: Keyframe = { transform: liftedPose(label.rect), opacity: 1 };
          const end: Keyframe = { transform: translate(x, y, size / label.size), opacity: model || element === number.current || (!theory && !destination) ? 0 : 1 };
          if (!theory) {
            start.color = label.color;
            end.color = style ? style.color : label.color;
          }
          animate(element, element === number.current ? [start, { opacity: 0, offset: .3 }, end] : [start, end], duration);
        }
      };
      const scheduleReveal = () => {
        if (disposed || finished || revealScheduled) return;
        revealScheduled = true; observer?.disconnect(); window.clearTimeout(readyTimer);
        // Let the destination's flex layout and scrollbar settle before measuring
        // the shared title. Measuring the mount frame made it land above the heading.
        firstLayout = requestAnimationFrame(() => { secondLayout = requestAnimationFrame(reveal); });
      };
      const destinationReady = () => navigation.kind === 'back' || !!document.querySelector(model
        ? '.model-session:not([hidden]) :is(.workspace-header, .workspace-explore:not([hidden]) .workspace-stage)'
        : '.portal-content-heading');
      if (destinationReady()) scheduleReveal();
      else {
        // Let the cold Model chunk mount under the paper, without adding a WebGL snapshot.
        observer = new MutationObserver(() => { if (destinationReady()) scheduleReveal(); });
        observer.observe(document.getElementById('root')!, { childList: true, subtree: true });
        readyTimer = window.setTimeout(scheduleReveal, 900);
      }
    }
    window.addEventListener('resize', finish);
    return () => {
      disposed = true; observer?.disconnect(); window.clearTimeout(readyTimer);
      if (firstLayout !== undefined) cancelAnimationFrame(firstLayout);
      if (secondLayout !== undefined) cancelAnimationFrame(secondLayout);
      window.removeEventListener('resize', finish);
      animations.forEach(animation => { animation.onfinish = null; animation.cancel(); });
    };
  }, [navigation.id, navigation.phase, navigation.route, onCovered, onComplete, theme, theory]);

  return <div ref={root} className={'section-transition section-transition--' + navigation.kind + (theory ? ' section-transition--theory' : '')} aria-hidden="true">
    <div ref={scrim} className="section-transition-wash" />
    <div ref={paper} className="section-transition-paper" />
    {navigation.section && <>
      <span ref={title} className="section-transition-label section-transition-title">{tr(navigation.section.title)}</span>
      {navigation.source?.number && <span ref={number} className="section-transition-label section-transition-number">{navigation.source.numberText}</span>}
    </>}
  </div>;
}
