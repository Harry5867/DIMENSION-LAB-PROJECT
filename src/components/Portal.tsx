import { useAppLanguage } from "./WelcomeLanguage";
import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LabMark } from './LabMark';
import { portalSections, type PortalRoute, type PortalSection } from '../utils/portalNavigation';
import { PortalContent } from './PortalContent';
import { WorkspaceMap } from './WorkspaceMap';
import { WorkspaceDataMorph } from './WorkspaceDataMorph';
import { ThemeToggle } from './ThemeToggle';
import { DataAtmosphere } from './DataAtmosphere';
import type { AtmosphereSignal } from '../visuals/atmosphere';
import './portal.css';

export function Portal({ route, onSignOut, entering = false, interactive = true, onOpenSection, openingId,
  sectionEntering = false, titleInTransit = false, returning = false }: {
  route: PortalRoute; onSignOut: () => void; entering?: boolean; interactive?: boolean;
  onOpenSection?: (section: PortalSection, link: HTMLAnchorElement) => void; openingId?: PortalSection['id'];
  sectionEntering?: boolean; titleInTransit?: boolean; returning?: boolean;
}) {
  const { tr } = useAppLanguage();
  const main = useRef<HTMLElement>(null);
  const backgroundSignal = useRef<AtmosphereSignal>({ focusX: .74, focusY: .52, slow: false });
  const overview = route === 'overview';
  const section = portalSections.find(section => section.id === route);
  useEffect(() => { document.title = `Dimension Lab — ${tr(section?.title ?? 'Workspace')}`; }, [section?.title, tr]);
  useEffect(() => {
    if (!interactive) return;
    main.current?.focus({ preventScroll: true });
    main.current?.closest('.portal-page')?.scrollTo(0, 0);
  }, [route, interactive]);
  return <div data-opening-section={openingId} className={`portal-page${route === 'theory' ? ' portal-page--theory' : ''}${overview ? ' portal-page--workspace' : ''}${overview && entering ? ' portal-page--entering' : ''}${openingId ? ' portal-page--opening' : ''}${sectionEntering ? ' portal-page--section-arriving' : ''}${titleInTransit ? ' portal-page--title-in-transit' : ''}${overview && returning ? ' portal-page--returning' : ''}`}>
    {overview && <DataAtmosphere variant="workspace" signal={backgroundSignal} active={interactive} />}
    <a className="portal-skip" href="#portal-main" onClick={e => { e.preventDefault(); main.current?.focus(); }}>{tr("Skip to content")}</a>
    {overview && <header className="portal-header">
      <a className="portal-brand" href="#/overview" aria-label={tr("Dimension Lab workspace")}><LabMark /> <span>DIMENSION / LAB</span></a>
      <span className="portal-location">{tr("Workspace")}</span>
      <div className="portal-header-actions"><ThemeToggle /><button className="portal-signout" onClick={onSignOut}>{tr("Sign out")}</button></div>
    </header>}
    <main ref={main} id="portal-main" tabIndex={-1} className={overview ? 'portal-overview' : 'portal-content' + (route === 'theory' ? ' portal-content--theory' : '')}>
      {overview ? <>
        <div className="portal-intro"><h1 className="workspace-data-morph-heading">{tr("Choose your dimension.")}</h1><WorkspaceDataMorph active={interactive} /></div>
        <WorkspaceMap backgroundSignal={backgroundSignal} onOpenSection={onOpenSection} openingId={openingId} active={interactive} />
      </> : <>
        {route !== 'theory' && <><div className="portal-page-tools"><a className="portal-back" href="#/overview"><ArrowLeft size={16} /> {tr("Go back")}</a><ThemeToggle /></div>
        <div className="portal-content-heading"><p className="portal-eyebrow"><span data-section-number>{section?.number}</span> / DIMENSION LAB</p><h1>{tr(section?.title ?? '')}</h1><p>{tr(section?.subtitle ?? '')}</p></div>
        </>}
        <PortalContent route={route} />
      </>}
    </main>
    {!overview && <footer className="portal-footer"><span>{tr("UNSUPERVISED LEARNING / INTERACTIVE EXPLORATION")}</span><span>{tr("Learn. Explore. Understand.")}</span></footer>}
  </div>;
}
