import { useAppLanguage } from "../../shared/providers/WelcomeLanguage";
import { lazy, Suspense } from 'react';
import { guideChapter, guideChapters, type PortalRoute } from '../../shared/navigation/portalNavigation';
import type { TeamMember } from './data/teamMembers';
import { TeamBrowser, TeamProfile } from './pages/TeamProfile';
import { GuideSlides, type OpenGuideChapter } from './GuideSlides';

const DatasetStories = lazy(() => import('./pages/DatasetStories'));
const Theory = lazy(() => import('./pages/Theory').then(module => ({ default: module.Theory })));
function Guide({ hash, onOpenChapter }: { hash: string; onOpenChapter: OpenGuideChapter }) {
  const chapter = guideChapter(hash);
  if (chapter) {
    const startAtLast = new URLSearchParams(hash.split('?')[1]).get('slide') === 'last';
    return <GuideSlides key={hash} chapter={chapter} startAtLast={startAtLast} onOpenChapter={onOpenChapter} />;
  }

  return (
    <nav className="portal-prose" aria-label="User Guide chapters">
      <ol className="portal-guide-contents">
        {guideChapters.map(item => (
          <li key={item.slug}>
            <a className="portal-reference" href={'#/guide/' + item.slug} data-guide-chapter={item.slug}
              onClick={event => onOpenChapter(item, event)}>{item.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PortalContent({ route, hash, profile, onOpenMember, onChangeProfile, onOpenGuideChapter, onImportsHost }: {
  route: PortalRoute; hash: string; profile?: TeamMember | null;
  onOpenMember: (member: TeamMember, source: HTMLAnchorElement) => void;
  onChangeProfile: (member: TeamMember) => void;
  onOpenGuideChapter: OpenGuideChapter;
  onImportsHost?: (host: HTMLDivElement | null) => void;
}) {
  const { tr } = useAppLanguage();
  if (route === 'theory') return <Suspense fallback={<p role="status">{tr("Loading theory…")}</p>}><Theory /></Suspense>;
  if (route === 'guide') return <Guide hash={hash} onOpenChapter={onOpenGuideChapter} />;
  if (route === 'about') return profile === undefined ? <TeamBrowser key={hash} hash={hash} onOpenMember={onOpenMember} /> : <TeamProfile member={profile} onChangeProfile={onChangeProfile} />;
  if (route === 'library') return <Suspense fallback={<p role="status">{tr("Loading data stories…")}</p>}><DatasetStories {...(onImportsHost && { onImportsHost })} /></Suspense>;
  return null;
}
