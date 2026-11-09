import type { CSSProperties, MouseEvent } from 'react';
import { ChartSpline, Layers, MessageCircleQuestionMark, PackageOpen } from 'lucide-react';
import { portalSections, type PortalSection } from '../utils/portalNavigation';
import { shouldAnimateLink } from '../utils/sectionTransition';
import { useAppLanguage } from './WelcomeLanguage';
import { WorkspaceDataMorph } from './WorkspaceDataMorph';
import './workspace-overview.css';

const about = portalSections[2];
const shortcuts = [
  { section: portalSections[1], Icon: PackageOpen },
  { section: portalSections[4], Icon: Layers },
  { section: portalSections[0], Icon: ChartSpline },
  { section: portalSections[3], Icon: MessageCircleQuestionMark },
];

export function WorkspaceOverview({ active, onOpenSection, openingId }: {
  active: boolean; openingId?: PortalSection['id'];
  onOpenSection?: (section: PortalSection, link: HTMLAnchorElement) => void;
}) {
  const { tr, t } = useAppLanguage();
  const navigationProps = (section: PortalSection) => ({
    href: section.href,
    'data-opening': openingId === section.id || undefined,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (!onOpenSection || window.matchMedia('(prefers-reduced-motion: reduce)').matches
        || !shouldAnimateLink(event, event.currentTarget.target, event.currentTarget.hasAttribute('download'))) return;
      event.preventDefault();
      onOpenSection(section, event.currentTarget);
    },
  });

  return <>
    <WorkspaceDataMorph active={active} />
    <section className="workspace-directory" aria-labelledby="workspace-overview-title">
      <div className="workspace-directory-heading">
        <h1 id="workspace-overview-title">{t('Continue exploring your data.', 'Tiếp tục khám phá dữ liệu của bạn.')}</h1>
      </div>
      <nav className="workspace-directory-list" aria-label={tr('Workspace sections')}>
        {shortcuts.map(({ section, Icon }, index) => <a key={section.id} {...navigationProps(section)}
          className="workspace-directory-link workspace-directory-icon" aria-label={tr(section.title)} title={tr(section.title)}
          style={{ '--shortcut-index': index } as CSSProperties}>
          <span className="workspace-directory-icon-surface"><Icon size={26} strokeWidth={1.55} aria-hidden="true" /></span>
        </a>)}
      </nav>
    </section>
    <footer className="workspace-directory-footer">
      <a {...navigationProps(about)} className="workspace-directory-link workspace-directory-about"><span data-transition-title>{tr(about.title)}</span></a>
    </footer>
  </>;
}
