export const portalSections = [
  { id: 'theory', number: '01', title: 'Theory', subtitle: 'Understand the algorithms.', href: '#/theory' },
  { id: 'model', number: '02', title: 'Model', subtitle: 'Practice with your data.', href: '#/explore' },
  { id: 'about', number: '03', title: 'About us', subtitle: 'Meet the people behind the lab.', href: '#/about' },
  { id: 'guide', number: '04', title: 'User Guide', subtitle: 'Find your way, step by step.', href: '#/guide' },
  { id: 'library', number: '05', title: 'Datasets', subtitle: 'Explore prepared data stories.', href: '#/library' },
] as const;
export type PortalSection = typeof portalSections[number];
export const modelRoutes = ['explore', 'datasets', 'methods', 'experiments'] as const;
export type PortalRoute = 'overview' | 'theory' | 'about' | 'guide' | 'library' | typeof modelRoutes[number];
export function isWelcomeRoute(hash: string) {
  const path = hash.split('?')[0];
  return path === '' || path === '#' || path === '#/';
}
export function portalRoute(hash: string): PortalRoute {
  const value = hash.replace(/^#\//, '').split('?')[0];
  return ['overview', ...portalSections.filter(s => s.id !== 'model').map(s => s.id), ...modelRoutes].includes(value) ? value as PortalRoute : 'overview';
}
export function isModelRoute(route: PortalRoute): route is typeof modelRoutes[number] { return (modelRoutes as readonly string[]).includes(route); }
