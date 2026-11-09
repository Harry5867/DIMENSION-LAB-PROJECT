import { useAppLanguage } from "./WelcomeLanguage";
import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { portalSections, type PortalRoute, type PortalSection } from '../utils/portalNavigation';
import { PortalContent } from './PortalContent';
import { WorkspaceOverview } from './WorkspaceOverview';
import { ThemeToggle } from './ThemeToggle';
import './portal.css';

export function Portal({ route, onSignOut, entering = false, interactive = true, onOpenSection, openingId,
  sectionEntering = false, titleInTransit = false, returning = false }: {
  route: PortalRoute; onSignOut: () => void; entering?: boolean; interactive?: boolean;
  onOpenSection?: (section: PortalSection, link: HTMLAnchorElement) => void; openingId?: PortalSection['id'];
  sectionEntering?: boolean; titleInTransit?: boolean; returning?: boolean;
}) {
  const { tr } = useAppLanguage();
  const main = useRef<HTMLElement>(null);
  const overview = route === 'overview';
  const section = portalSections.find(section => section.id === route);
  useEffect(() => { document.title = tr(section?.title ?? 'Workspace'); }, [section?.title, tr]);
  useEffect(() => {
    if (!interactive) return;
    main.current?.focus({ preventScroll: true });
    main.current?.closest('.portal-page')?.scrollTo(0, 0);
  }, [route, interactive]);
  return <div data-opening-section={openingId} className={`portal-page${route === 'theory' ? ' portal-page--theory' : ''}${overview ? ' portal-page--workspace' : ''}${overview && entering ? ' portal-page--entering' : ''}${openingId ? ' portal-page--opening' : ''}${sectionEntering ? ' portal-page--section-arriving' : ''}${titleInTransit ? ' portal-page--title-in-transit' : ''}${overview && returning ? ' portal-page--returning' : ''}`}>
    <a className="portal-skip" href="#portal-main" onClick={e => { e.preventDefault(); main.current?.focus(); }}>{tr("Skip to content")}</a>
    {overview && <header className="portal-header">
      <div className="portal-header-actions">
        <ThemeToggle />
        <button className="portal-signout" onClick={onSignOut}>{tr("Sign out")}</button>
      </div>
    </header>}
    <main ref={main} id="portal-main" tabIndex={-1} className={overview ? 'portal-overview' : 'portal-content' + (route === 'theory' ? ' portal-content--theory' : '')}>
      {overview ? <WorkspaceOverview active={interactive} onOpenSection={onOpenSection} openingId={openingId} /> : <>
        {route !== 'theory' && <><div className="portal-page-tools"><a className="portal-back" href="#/overview"><ArrowLeft size={16} /> {tr("Go back")}</a><ThemeToggle /></div>
        <div className="portal-content-heading"><p className="portal-eyebrow"><span data-section-number>{section?.number}</span></p><h1>{tr(section?.title ?? '')}</h1><p>{tr(section?.subtitle ?? '')}</p></div>
        </>}
        <PortalContent route={route} />
      </>}
    </main>
    {!overview && <footer className="portal-footer"><span>{tr("UNSUPERVISED LEARNING / INTERACTIVE EXPLORATION")}</span><span>{tr("Learn. Explore. Understand.")}</span></footer>}
  </div>;
}
