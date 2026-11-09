import type { PortalSection, PortalRoute } from './portalNavigation';

export interface TransitionRect { left: number; top: number; width: number; height: number }
export interface TransitionLabel { rect: TransitionRect; size: number; lineHeight: number; spacing: number; family: string; weight: string; color: string }
export interface SectionSource {
  rect: TransitionRect; title: TransitionLabel; number: TransitionLabel; icon: { rect: TransitionRect; color: string };
  radius: number; background: string; border: string; accent: string;
}
export interface SectionNavigation {
  id: number; kind: 'open' | 'back'; phase: 'covering' | 'revealing'; route: PortalRoute;
  section?: PortalSection; source?: SectionSource;
}
export function shouldAnimateLink(event: {
  defaultPrevented: boolean; button: number; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean;
}, target = '', download = false) {
  return !event.defaultPrevented && event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
    (!target || target === '_self') && !download;
}
export function captureSectionSource(link: HTMLAnchorElement): SectionSource {
  const rect = (element: Element): TransitionRect => {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { left, top, width, height };
  };
  const label = (element: HTMLElement): TransitionLabel => {
    const style = getComputedStyle(element);
    const size = parseFloat(style.fontSize);
    return { rect: rect(element), size, lineHeight: parseFloat(style.lineHeight) || size * 1.15,
      spacing: parseFloat(style.letterSpacing) || 0, family: style.fontFamily, weight: style.fontWeight, color: style.color };
  };
  const icon = link.querySelector<SVGSVGElement>('.workspace-section-icon')!;
  const style = getComputedStyle(link);
  const origin = rect(link.querySelector('.workspace-map-beacon')!);
  return {
    rect: origin, title: label(link.querySelector('.workspace-map-title')!),
    number: label(link.querySelector('.workspace-map-number')!),
    icon: { rect: rect(icon), color: getComputedStyle(icon).color },
    radius: origin.width / 2, background: style.getPropertyValue('--map-paper').trim(),
    border: style.getPropertyValue('--map-line').trim(), accent: style.getPropertyValue('--map-accent').trim(),
  };
}
