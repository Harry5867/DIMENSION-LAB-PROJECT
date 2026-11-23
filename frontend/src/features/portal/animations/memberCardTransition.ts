const motionPreference = '(prefers-reduced-motion: reduce)';
const easing = 'cubic-bezier(.22,1,.36,1)';

export function canAnimateMembers() {
  return typeof HTMLElement.prototype.animate === 'function' && !window.matchMedia(motionPreference).matches;
}

function cloneWithoutIds(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
  return clone;
}

function makeLayer(page: Element) {
  const layer = document.createElement('div');
  layer.className = 'member-transition-layer portal-page--team';
  layer.inert = true;
  layer.setAttribute('aria-hidden', 'true');
  const style = getComputedStyle(page);
  for (const property of ['--portal-paper', '--portal-ink', '--portal-muted', '--portal-accent', '--portal-line']) {
    layer.style.setProperty(property, style.getPropertyValue(property));
  }
  layer.style.fontFamily = style.fontFamily;
  return layer;
}

function positionClone(clone: HTMLElement, bounds: DOMRect) {
  Object.assign(clone.style, {
    position: 'absolute', margin: '0', left: bounds.left + 'px', top: bounds.top + 'px',
    width: bounds.width + 'px', height: bounds.height + 'px',
  });
}

const cardSelector = '.member-gallery-card > .member-card';

function initialClip(gallery: Element, slot: HTMLElement, card: DOMRect) {
  const clip = gallery.getBoundingClientRect();
  let { left, right } = clip;
  let front = slot;
  const depth = (element: HTMLElement) => Number.parseFloat(element.style.getPropertyValue('--member-z'));
  for (const candidate of gallery.querySelectorAll<HTMLElement>('.member-gallery-slot:not([inert])')) {
    if (depth(candidate) > depth(front)) front = candidate;
  }
  const cover = front !== slot && front.querySelector(cardSelector)?.getBoundingClientRect();
  if (cover && card.top < cover.bottom && card.bottom > cover.top) {
    if (card.left + card.right < cover.left + cover.right) right = Math.min(right, cover.left);
    else left = Math.max(left, cover.right);
  }
  return `inset(${Math.max(0, clip.top)}px ${Math.max(0, innerWidth - right)}px ${Math.max(0, innerHeight - clip.bottom)}px ${Math.max(0, left)}px)`;
}

export function captureMemberCard(link: HTMLAnchorElement) {
  if (!canAnimateMembers() || !link.isConnected) return null;
  const gallery = link.closest('.member-gallery');
  const slot = link.closest<HTMLElement>('.member-gallery-slot');
  const main = link.closest('main');
  const page = link.closest('.portal-page');
  const surface = link.querySelector<HTMLElement>('.member-card');
  if (!gallery || !slot || !page || !main || !surface) return null;
  const bounds = surface.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;

  const layer = makeLayer(page);
  const clone = cloneWithoutIds(surface);
  const avatar = clone.querySelector<HTMLElement>('.portal-team-avatar');
  if (!avatar) return null;
  // Size the moving copy from the already-rendered card, even if its photo is still loading.
  const style = getComputedStyle(surface);
  Object.assign(clone.style, {
    width: surface.offsetWidth + 'px', height: surface.offsetHeight + 'px', margin: '0',
    borderRadius: style.borderRadius, color: style.color,
  });
  clone.style.setProperty('--member-focus', style.getPropertyValue('--member-focus'));
  const plane = document.createElement('div');
  plane.className = 'member-transition-plane';
  plane.append(clone);
  const frame = document.createElement('div');
  frame.className = 'member-transition-frame';
  frame.append(plane);

  const backdrop = document.createElement('div');
  backdrop.className = 'member-transition-backdrop';
  const scene = cloneWithoutIds(main);
  positionClone(scene, main.getBoundingClientRect());
  const index = [...main.querySelectorAll(cardSelector)].indexOf(surface);
  const selected = scene.querySelectorAll<HTMLElement>(cardSelector)[index];
  if (selected) selected.style.visibility = 'hidden';
  backdrop.append(scene);
  layer.append(backdrop, frame);

  const start = `translate3d(${bounds.left}px, ${bounds.top}px, 0) scale(${bounds.width / surface.offsetWidth}, ${bounds.height / surface.offsetHeight})`;
  return { start, clip: initialClip(gallery, slot, bounds), opacity: getComputedStyle(slot).opacity, avatar, plane, frame, layer, backdrop };
}

export type MemberCardSnapshot = NonNullable<ReturnType<typeof captureMemberCard>>;

function moveCardToPortrait(source: MemberCardSnapshot, destination: DOMRect, duration: number) {
  document.body.append(source.layer);
  const avatar = source.avatar.getBoundingClientRect();
  const scale = destination.width / avatar.width;
  // Match the portrait position and crop before swapping to the live profile.
  const left = destination.left - avatar.left * scale;
  const top = destination.top - avatar.top * scale;
  return [
    source.plane.animate([
      { transform: source.start },
      { transform: `translate3d(${left}px, ${top}px, 0) scale(${scale}, ${scale})` },
    ], { duration, easing, fill: 'both' }),
    source.avatar.animate([
      { height: avatar.height + 'px' },
      { height: destination.height / scale + 'px' },
    ], { duration, easing, fill: 'both' }),
    source.plane.animate([
      { opacity: source.opacity },
      { opacity: 1, offset: .25 },
      { opacity: 1, offset: .7 },
      { opacity: 0 },
    ], { duration, fill: 'both' }),
    source.frame.animate([{ clipPath: source.clip }, { clipPath: 'inset(0px)' }], {
      duration: duration * .45, easing: 'ease-out', fill: 'both',
    }),
    source.backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: duration * .5, easing: 'ease-in-out', fill: 'both',
    }),
  ];
}

export function animateMemberProfile(host: HTMLElement, source?: MemberCardSnapshot) {
  if (!canAnimateMembers()) return;
  const page = host.closest('.portal-page');
  const portrait = host.querySelector<HTMLElement>('.member-profile-portrait');
  const copy = host.querySelector<HTMLElement>('.member-profile-copy');
  if (!portrait || !copy || !page) return;
  const destination = portrait.querySelector('.portal-team-avatar')?.getBoundingClientRect();
  const movingCard = destination?.width ? source : undefined;
  const duration = movingCard ? 480 : 360;
  const animations = movingCard && destination ? moveCardToPortrait(movingCard, destination, duration) : [];

  const motion = portrait.animate(movingCard ? [
    { opacity: 0 }, { opacity: 0, offset: .7 }, { opacity: 1 },
  ] : [
    { opacity: 0, transform: 'translateX(16px) scale(.98)' },
    { opacity: 1, transform: 'none' },
  ], { duration, easing: movingCard ? 'linear' : easing, fill: 'both' });
  animations.push(motion, copy.animate([
    { opacity: 0, transform: 'translateX(16px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 300, delay: duration - 300, easing, fill: 'both' }));

  const preference = window.matchMedia(motionPreference);
  const scrollTop = page.scrollTop;
  const onScroll = () => {
    if (Math.abs(page.scrollTop - scrollTop) > 1) stop();
  };
  const stop = () => {
    motion.onfinish = null;
    animations.forEach(animation => animation.cancel());
    movingCard?.layer.remove();
    page.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', stop);
    preference.removeEventListener('change', stop);
  };
  motion.onfinish = stop;
  page.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', stop);
  preference.addEventListener('change', stop);
  return stop;
}
