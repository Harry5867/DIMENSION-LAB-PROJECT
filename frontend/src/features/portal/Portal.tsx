import { useAppLanguage } from "../../shared/providers/WelcomeLanguage";
import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { aboutProfileSlug, aboutTeamHref, aboutTeamSelection, guideChapter, portalSections, type GuideChapter, type PortalRoute, type PortalSection } from '../../shared/navigation/portalNavigation';
import { teamMembers, type TeamMember } from './data/teamMembers';
import { shouldAnimateLink } from './navigation/sectionTransition';
import { animateMemberProfile, canAnimateMembers, captureMemberCard, type MemberCardSnapshot } from './animations/memberCardTransition';
import { PortalContent } from './PortalContent';
import { WorkspaceOverview } from './WorkspaceOverview';
import { ThemeToggle } from '../../shared/ui/ThemeToggle';
import { isRecord } from '../../shared/api/typeGuards';
import './styles/portal.css';

const profileHistoryKey = 'dimensionLabMemberFromTeam';
const guideIndexHistoryKey = 'dimensionLabGuideIndex';
const guideChapterHistoryKey = 'dimensionLabChapterFromGuide';
const zoomedOut: Keyframe = { transform: 'scale(.92)', opacity: 0 };
const zoomedIn: Keyframe = { transform: 'scale(1)', opacity: 1 };

function historyValue(key: string): unknown {
  const state: unknown = window.history.state;
  return isRecord(state) ? state[key] : undefined;
}

function centerMemberZoom(content: HTMLElement) {
  const card = content.querySelector('.member-gallery-open');
  if (!card) return;
  const bounds = content.getBoundingClientRect();
  const center = card.getBoundingClientRect();
  content.style.transformOrigin = `${center.left + center.width / 2 - bounds.left}px ${center.top + center.height / 2 - bounds.top}px`;
}

export function Portal({ route, hash, onReturnToWelcome, entering = false, interactive = true, onOpenSection, openingId,
  sectionEntering = false, titleInTransit = false, returning = false }: {
  route: PortalRoute; hash: string; onReturnToWelcome: () => void; entering?: boolean; interactive?: boolean;
  onOpenSection?: (section: PortalSection, link: HTMLAnchorElement) => void; openingId?: PortalSection['id'];
  sectionEntering?: boolean; titleInTransit?: boolean; returning?: boolean;
}) {
  const { tr } = useAppLanguage();
  const main = useRef<HTMLElement>(null);
  const memberContent = useRef<HTMLDivElement>(null);
  const memberZoom = useRef<Animation | null>(null);
  const visitedProfile = useRef(false);
  const pendingCard = useRef<{ hash: string; source: MemberCardSnapshot } | null>(null);
  const returningToTeam = useRef(false);
  const returningToGuide = useRef(false);
  const overview = route === 'overview';
  const section = portalSections.find(section => section.id === route);
  const sharedBack = route === 'library' || route === 'guide';
  const chapter = route === 'guide' ? guideChapter(hash) : undefined;
  const slug = route === 'about' ? aboutProfileSlug(hash) : undefined;
  const profilePage = slug !== undefined;
  const member = teamMembers.find(item => item.slug === slug) ?? null;
  const hasMember = member !== null;
  const galleryPage = route === 'about' && (!profilePage || hasMember);
  const teamPage = galleryPage && !profilePage;
  const memberPageKey = galleryPage ? member?.slug ?? '#/about' : null;
  const title = profilePage ? member?.name ?? tr('Team member not found') : tr(chapter?.title ?? section?.title ?? 'Workspace');
  const backHref = chapter ? '#/guide' : profilePage ? member ? aboutTeamHref(member.slug) : '#/about' : '#/overview';
  const backLabel = chapter ? 'Back to User Guide' : profilePage ? 'Back to team' : 'Go back';
  const teamSelection = route === 'about' ? aboutTeamSelection(hash) : null;
  useLayoutEffect(() => {
    if (profilePage) {
      visitedProfile.current = true;
      return;
    }
    const content = memberContent.current;
    if (!content || !canAnimateMembers()) return;
    if (visitedProfile.current) {
      memberZoom.current = content.animate([{ opacity: .4 }, { opacity: 1 }], {
        duration: 180, easing: 'ease-out', fill: 'backwards',
      });
    } else {
      centerMemberZoom(content);
      memberZoom.current = content.animate([zoomedOut, zoomedIn], { duration: 350, easing: 'ease-out', fill: 'backwards' });
    }
    return () => {
      memberZoom.current?.cancel();
      memberZoom.current = null;
    };
  }, [memberPageKey, profilePage]);

  function openMember(next: TeamMember, source: HTMLAnchorElement) {
    if (aboutProfileSlug(window.location.hash) !== undefined || memberContent.current?.inert) return;
    const snapshot = captureMemberCard(source);
    pendingCard.current = snapshot ? { hash: source.hash, source: snapshot } : null;
    // Keep the selected card on the history entry the browser's Back button restores.
    window.history.replaceState(window.history.state, '', aboutTeamHref(next.slug));
    window.location.hash = source.hash;
    window.history.replaceState({ ...window.history.state, [profileHistoryKey]: next.slug }, '');
  }

  function backToTeam(event: MouseEvent<HTMLAnchorElement>) {
    const link = event.currentTarget;
    if (!member || !shouldAnimateLink(event, link.target, link.hasAttribute('download'))) return;
    event.preventDefault();
    if (returningToTeam.current || aboutProfileSlug(window.location.hash) !== member.slug) return;
    returningToTeam.current = true;
      const state: unknown = window.history.state;
      if (isRecord(state) && state[profileHistoryKey] === member.slug) window.history.back();
    else window.location.hash = link.hash;
  }

  function changeProfile(next: TeamMember) {
    if (!member || !interactive || aboutProfileSlug(window.location.hash) !== member.slug) return;
    const fromTeam = historyValue(profileHistoryKey) === member.slug;
    window.location.replace('#/about/' + next.slug);
    if (fromTeam) window.history.replaceState({ ...window.history.state, [profileHistoryKey]: next.slug }, '');
  }

  function openGuideChapter(item: GuideChapter, event: MouseEvent<HTMLAnchorElement>) {
    const link = event.currentTarget;
    if (!shouldAnimateLink(event, link.target, link.hasAttribute('download'))) return;
    event.preventDefault();
    const currentChapter = guideChapter(window.location.hash);
    if (currentChapter) {
      if (currentChapter === item) return;
      const fromGuide = historyValue(guideChapterHistoryKey) === currentChapter.slug;
      window.location.replace(link.hash);
      if (fromGuide) window.history.replaceState({ ...window.history.state, [guideChapterHistoryKey]: item.slug }, '');
      return;
    }
    const scrollTop = main.current?.closest('.portal-page')?.scrollTop ?? 0;
    window.history.replaceState({
      ...window.history.state,
      [guideIndexHistoryKey]: { slug: item.slug, scrollTop },
    }, '');
    window.location.hash = link.hash;
    window.history.replaceState({ ...window.history.state, [guideChapterHistoryKey]: item.slug }, '');
  }

  function backToGuide(event: MouseEvent<HTMLAnchorElement>) {
    const link = event.currentTarget;
    if (!shouldAnimateLink(event, link.target, link.hasAttribute('download'))) return;
    if (historyValue(guideChapterHistoryKey) !== chapter?.slug) return;
    event.preventDefault();
    if (returningToGuide.current) return;
    returningToGuide.current = true;
    window.history.back();
  }

  useLayoutEffect(() => {
    if (!teamPage) return;
    function captureHistoryNavigation() {
      const destination = window.location.hash;
      // Preserve the exact card already captured by a click, including duplicate slugs.
      if (pendingCard.current?.hash === destination) return;
      const activeCard = main.current?.querySelector<HTMLAnchorElement>('.member-gallery-open');
      if (activeCard?.hash !== destination) return;
      const source = captureMemberCard(activeCard);
      pendingCard.current = source ? { hash: destination, source } : null;
    }
    window.addEventListener('popstate', captureHistoryNavigation);
    window.addEventListener('hashchange', captureHistoryNavigation);
    return () => {
      window.removeEventListener('popstate', captureHistoryNavigation);
      window.removeEventListener('hashchange', captureHistoryNavigation);
    };
  }, [teamPage]);

  function backToOverview(event: MouseEvent<HTMLAnchorElement>) {
    const content = memberContent.current;
    const link = event.currentTarget;
    if (!content || !canAnimateMembers() ||
      !shouldAnimateLink(event, link.target, link.hasAttribute('download'))) return;
    event.preventDefault();
    if (content.inert) return;
    content.inert = true;
    const style = getComputedStyle(content);
    const currentPose = { transform: style.transform, opacity: style.opacity };
    if (currentPose.transform === 'none') centerMemberZoom(content);
    memberZoom.current?.cancel();
    const destination = link.hash;
    const exit = content.animate([currentPose, zoomedOut], { duration: 250, easing: 'ease-in', fill: 'forwards' });
    memberZoom.current = exit;
    exit.onfinish = () => { window.location.hash = destination; };
  }

  useEffect(() => { document.title = title; }, [title]);
  useLayoutEffect(() => {
    if (!interactive) return undefined;
    returningToTeam.current = false;
    returningToGuide.current = false;
    const page = main.current?.closest('.portal-page');
    const guideReturn = route === 'guide' && !guideChapter(hash) ? historyValue(guideIndexHistoryKey) : null;
    const guideLink = isRecord(guideReturn) && typeof guideReturn.slug === 'string' && typeof guideReturn.scrollTop === 'number' && main.current?.querySelector<HTMLAnchorElement>(`[data-guide-chapter="${CSS.escape(guideReturn.slug)}"]`);
    if (guideLink && typeof guideReturn.scrollTop === 'number') {
      page?.scrollTo({ top: guideReturn.scrollTop, behavior: 'instant' });
      guideLink.focus({ preventScroll: true });
      return;
    }
    const selectedCard = teamSelection && main.current?.querySelector<HTMLAnchorElement>('.member-gallery-open');
    if (selectedCard) {
      selectedCard.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    } else {
      page?.scrollTo({ top: 0, behavior: 'instant' });
    }
    main.current?.focus({ preventScroll: true });
    if (selectedCard) selectedCard.focus({ preventScroll: true });
    const pending = pendingCard.current;
    pendingCard.current = null;
    if (hasMember && main.current) {
      return animateMemberProfile(main.current, pending?.hash === hash ? pending.source : undefined);
    }
    return undefined;
  }, [route, hash, teamPage, hasMember, teamSelection, interactive]);
  const content = <PortalContent route={route} hash={hash} {...(profilePage && { profile: member })}
    onOpenMember={openMember} onChangeProfile={changeProfile} onOpenGuideChapter={openGuideChapter} />;
  return <div data-opening-section={openingId} className={`portal-page${route === 'theory' ? ' portal-page--theory' : ''}${teamPage ? ' portal-page--team' : hasMember ? ' portal-page--profile' : ''}${overview ? ' portal-page--workspace' : ''}${overview && entering ? ' portal-page--entering' : ''}${openingId ? ' portal-page--opening' : ''}${sectionEntering ? ' portal-page--section-arriving' : ''}${titleInTransit ? ' portal-page--title-in-transit' : ''}${overview && returning ? ' portal-page--returning' : ''}`}>
    <a className="portal-skip" href="#portal-main" onClick={e => { e.preventDefault(); main.current?.focus(); }}>{tr("Skip to content")}</a>
    {overview && <header className="portal-header">
      <div className="portal-header-actions">
        <ThemeToggle />
        <button className="portal-return-home control-glass" onClick={onReturnToWelcome}>{tr("Back to welcome")}</button>
      </div>
    </header>}
    <main ref={main} id="portal-main" tabIndex={-1} className={overview ? 'portal-overview' : 'portal-content' + (route === 'theory' ? ' portal-content--theory' : galleryPage ? ' portal-content--member' : '')}>
      {overview ? <WorkspaceOverview active={interactive}
        {...(onOpenSection && { onOpenSection })} {...(openingId !== undefined && { openingId })} /> : <>
        {route !== 'theory' && <><div className="portal-page-tools"><a className={sharedBack ? 'back-control' : 'portal-back'} href={backHref}
          onClick={chapter ? backToGuide : teamPage ? backToOverview : profilePage ? backToTeam : undefined}><ArrowLeft size={sharedBack ? 15 : 16} aria-hidden="true" /> <span>{tr(backLabel)}</span></a><ThemeToggle /></div>
        {!profilePage && !galleryPage && <div className="portal-content-heading"><p className="portal-eyebrow"><span data-section-number>{section?.number}</span></p><h1>{title}</h1>{route !== 'guide' && <p>{tr(section?.subtitle ?? '')}</p>}</div>}
        </>}
        {galleryPage ? <div key={memberPageKey} ref={memberContent} className="member-page-motion">{content}</div> : content}
      </>}
    </main>
    {!overview && route !== 'about' && route !== 'guide' && <footer className="portal-footer"><span>{tr("UNSUPERVISED LEARNING / INTERACTIVE EXPLORATION")}</span><span>{tr("Learn. Explore. Understand.")}</span></footer>}
  </div>;
}
