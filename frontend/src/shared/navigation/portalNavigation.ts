export const portalSections = [
  { id: 'theory', number: '01', title: 'Theory', subtitle: 'Understand the algorithms.', href: '#/theory' },
  { id: 'model', number: '02', title: 'Model', subtitle: 'Practice with your data.', href: '#/explore' },
  { id: 'about', number: '03', title: 'About us', subtitle: 'Meet the people behind the lab.', href: '#/about' },
  { id: 'guide', number: '04', title: 'User Guide', subtitle: 'Find your way, step by step.', href: '#/guide' },
  { id: 'library', number: '05', title: 'Datasets', subtitle: 'Explore prepared data stories.', href: '#/library' },
] as const;
export type PortalSection = typeof portalSections[number];
export const guideChapters = [
  { slug: 'quick-start', title: 'Quick Start with Wholesale Customers' },
  { slug: 'import-csv', title: 'Analyze Your Own CSV' },
  { slug: 'understand-results', title: 'Understand Results and Try Other Features' },
  { slug: 'save-and-export', title: 'Save and Export Results' },
  { slug: 'troubleshooting', title: 'Troubleshooting' },
] as const;
export type GuideChapter = typeof guideChapters[number];

export function guideChapter(hash: string): GuideChapter | undefined {
  const path = hash.split('?')[0];
  return guideChapters.find(chapter => path === '#/guide/' + chapter.slug);
}

export const modelRoutes = ['explore', 'datasets', 'methods', 'experiments'] as const;
export type PortalRoute = 'overview' | 'theory' | 'about' | 'guide' | 'library' | typeof modelRoutes[number];
export function isWelcomeRoute(hash: string) {
  const path = hash.split('?')[0];
  return path === '' || path === '#' || path === '#/';
}
export function portalRoute(hash: string): PortalRoute {
  const [value = ''] = hash.replace(/^#\//, '').split('?');
  if (hash.startsWith('#/about/')) return 'about';
  if (hash.startsWith('#/guide/')) return 'guide';
  return ['overview', ...portalSections.filter(s => s.id !== 'model').map(s => s.id), ...modelRoutes].includes(value) ? value as PortalRoute : 'overview';
}
export function isModelRoute(route: PortalRoute): route is typeof modelRoutes[number] { return (modelRoutes as readonly string[]).includes(route); }

export function aboutProfileSlug(hash: string): string | null | undefined {
  const [path = ''] = hash.split('?');
  if (!path.startsWith('#/about/')) return undefined;
  try {
    const slug = decodeURIComponent(path.slice('#/about/'.length));
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

export function aboutTeamHref(slug: string) {
  return '#/about?' + new URLSearchParams({ member: slug }).toString();
}

export function aboutTeamSelection(hash: string) {
  const [path, query] = hash.split('?');
  return path === '#/about' ? new URLSearchParams(query).get('member') : null;
}

export function signInDestination(hash: string) {
  return hash.startsWith('#/about') && portalRoute(hash) === 'about' ? hash : '#/overview';
}
