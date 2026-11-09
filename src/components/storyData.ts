import { Quaternion, Vector3 } from 'three';
import { earthPosition } from './atlasLines';
import { fetchWithTimeout } from '../utils/network';

export const storyCategories = ['Healthcare', 'Education', 'Finance', 'Economy', 'Sports', 'Environment', 'Technology'] as const;
export type StoryCategory = typeof storyCategories[number];
export type StoryFilter = 'All' | StoryCategory;
export interface StoryRecord {
  id: string; title: string; category: StoryCategory; city: string; country: string; placeId: number;
  latitude: number; longitude: number; position: Vector3;
  imageUrl: string; imageAlt: string; description: string; year: number;
  source: { label: string; url: string | null }; datasetReference: string; demo: boolean;
  photo: { author: string; title: string; url: string; license: string; licenseUrl: string; changes: string };
}
export interface StoryGroup { key: string; members: StoryRecord[]; position: Vector3 }
export function parseStories(input: unknown): StoryRecord[] {
  if (!Array.isArray(input) || input.length > 60) throw new Error('Invalid story collection');
  const ids = new Set<string>();
  return input.map(value => {
    if (!value || typeof value !== 'object') throw new Error('Invalid story');
    const s = value as Record<string, unknown>;
    const required = ['id', 'title', 'city', 'country', 'imageUrl', 'imageAlt', 'description', 'datasetReference'];
    if (required.some(key => typeof s[key] !== 'string' || !(s[key] as string).trim())) throw new Error('Missing story fields');
    if (!/^[-a-z0-9]+$/.test(s.id as string) || ids.has(s.id as string)) throw new Error('Duplicate or invalid story ID');
    ids.add(s.id as string);
    if (!(storyCategories as readonly unknown[]).includes(s.category) || typeof s.demo !== 'boolean') throw new Error('Invalid story category or disclosure');
    if (typeof s.latitude !== 'number' || !Number.isFinite(s.latitude) || Math.abs(s.latitude) > 90 || typeof s.longitude !== 'number' || !Number.isFinite(s.longitude) || Math.abs(s.longitude) > 180) throw new Error('Invalid story coordinates');
    if (!Number.isInteger(s.year) || Number(s.year) < 1 || !Number.isInteger(s.placeId)) throw new Error('Invalid story year or place');
    if (!/^stories\/[a-z0-9-]+\.(svg|png|jpe?g|webp|avif)$/.test(s.imageUrl as string)) throw new Error('Story images must be local assets');
    const source = s.source as Record<string, unknown> | null;
    if (!source || typeof source.label !== 'string' || !source.label.trim() || (source.url !== null && (typeof source.url !== 'string' || !/^https:\/\//.test(source.url)))) throw new Error('Invalid story source');
    if (!s.demo && !source.url) throw new Error('A real story needs a linked source');
    const photo = s.photo as Record<string, unknown> | null;
    if (!photo || ['author', 'title', 'license', 'changes'].some(key => typeof photo[key] !== 'string' || !(photo[key] as string).trim())
      || ['url', 'licenseUrl'].some(key => typeof photo[key] !== 'string' || !/^https:\/\//.test(photo[key] as string))) throw new Error('Invalid photo credit');
    return { ...s, source, position: earthPosition(s.latitude, s.longitude) } as unknown as StoryRecord;
  });
}
export async function loadStories(signal?: AbortSignal) {
  const response = await fetchWithTimeout(new URL('../data/stories-demo.json', import.meta.url).href, { signal }, 12000);
  if (!response.ok) throw new Error('Story collection unavailable');
  return parseStories(await response.json());
}
export const filterStories = (stories: StoryRecord[], category: StoryFilter) => category === 'All' ? stories : stories.filter(story => story.category === category);
export function groupStories(stories: StoryRecord[], detailed: boolean, compact: boolean, selected: string | null): StoryGroup[] {
  const groups: StoryGroup[] = [];
  const threshold = Math.cos(compact ? .34 : .20);
  for (const story of stories) {
    const target = !detailed && story.id !== selected ? groups.find(group => !group.members.some(member => member.id === selected) && group.members.every(member => member.position.dot(story.position) >= threshold)) : undefined;
    if (target) {
      target.members.push(story);
      target.position.set(0, 0, 0);
      target.members.forEach(member => target.position.add(member.position));
      target.position.normalize();
      target.key = target.members.map(member => member.id).sort().join(':');
    } else groups.push({ key: story.id, members: [story], position: story.position.clone() });
  }
  return groups;
}
export function projectStoryGroups(groups: StoryGroup[], orientation: Quaternion, frame: { width: number; height: number; centerX: number; radius: number; left: number; top: number; bottom: number; compact: boolean }, selected: string | null, hovered: string | null) {
  const projected = new Vector3();
  const visible = groups.flatMap(group => {
    projected.copy(group.position).applyQuaternion(orientation);
    const x = frame.centerX + projected.x * frame.radius, y = frame.height / 2 - projected.y * frame.radius;
    if (projected.z <= .12 || x < frame.left + 24 || x > frame.width - 24 || y < frame.top + 24 || y > frame.bottom - 24) return [];
    const priority = group.members.some(member => member.id === selected) ? 3 : group.key === hovered ? 2 : projected.z;
    return [{ group, x, y, anchorX: x, anchorY: y, priority }];
  }).sort((a, b) => b.priority - a.priority).slice(0, frame.compact ? 6 : 10)
    .sort((a, b) => a.group.key.localeCompare(b.group.key));
  const size = frame.compact ? 40 : 48, step = size + 8;
  const placed: Array<{ x: number; y: number }> = [];
  const offsets = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -1], [2, -1], [-2, 1], [2, 1]];
  for (const item of visible) {
    for (const [dx, dy] of offsets) {
      const x = item.anchorX + dx * step, y = item.anchorY + dy * step;
      if (x < frame.left + 24 || x > frame.width - 24 || y < frame.top + 24 || y > frame.bottom - 24) continue;
      if (placed.some(other => Math.abs(x - other.x) < size + 4 && Math.abs(y - other.y) < size + 4)) continue;
      item.x = x; item.y = y; break;
    }
    placed.push(item);
  }
  return visible;
}
