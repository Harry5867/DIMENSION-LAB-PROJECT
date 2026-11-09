import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { Euler, MathUtils, Quaternion } from 'three';
import { earthPosition } from '../src/components/atlasLines';
import { filterStories, groupStories, parseStories, projectStoryGroups, storyCategories } from '../src/components/storyData';
import collection from '../src/data/stories-demo.json';
import geography from '../src/data/globe-data.json';
const stories = parseStories(collection);

test('demo collection has 21 disclosed stories, three per topic, using existing geographic records', () => {
  assert.equal(stories.length, 21);
  assert.equal(new Set(stories.map(story => story.id)).size, 21);
  for (const category of storyCategories) assert.equal(filterStories(stories, category).length, 3);
  for (const story of stories) {
    assert.equal(story.demo, true);
    assert.equal(story.source.label, 'Dimension Lab original demonstration');
    const place = geography.cities.find(place => place.id === story.placeId)!;
    assert.equal(story.latitude, place.latitude); assert.equal(story.longitude, place.longitude);
    assert.ok(Math.abs(story.position.length() - 1) < 1e-12);
    assert.match(story.description, /no measured results/);
    assert.match(story.datasetReference, /No linked measurement dataset/);
  }
});

test('every story photograph is a local WebP with explicit source and license attribution', async () => {
  for (const story of stories) {
    const bytes = await fs.readFile(new URL(`../public/${story.imageUrl}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.ok(bytes.length > 10_000 && bytes.length < 180_000);
    assert.ok(story.photo.author.length > 0);
    assert.match(story.photo.url, /^https:\/\/commons.wikimedia.org\/wiki\/File:/);
    assert.match(story.photo.licenseUrl, /^https:\/\//);
    assert.doesNotMatch(story.photo.title, /\.svg$/i);
  }
});

test('validation rejects duplicate IDs, absent disclosure, unsupported topics and unsafe assets/sources', () => {
  assert.throws(() => parseStories([collection[0], collection[0]]), /Duplicate/);
  for (const patch of [{ latitude: 91 }, { longitude: Infinity }, { category: 'Invented' }, { demo: undefined }, { imageUrl: '../outside.svg' }, { imageUrl: 'https://example.com/a.svg' }, { source: { label: 'Test', url: 'javascript:alert(1)' } }, { demo: false }, { photo: undefined }, { photo: { ...collection[0].photo, url: 'javascript:alert(1)' } }]) {
    assert.throws(() => parseStories([{ ...collection[0], ...patch }]));
  }
  assert.deepEqual(parseStories([]), []);
  const real = parseStories([{ ...collection[0], demo: false, source: { label: 'Verified source', url: 'https://example.org/source' } }]);
  assert.equal(real[0].demo, false);
});

test('topic filtering does not mutate data and supports empty categories', () => {
  assert.equal(filterStories(stories, 'All'), stories);
  const healthcare = filterStories(stories, 'Healthcare');
  assert.equal(healthcare.length, 3); assert.deepEqual(filterStories(healthcare, 'Finance'), []);
  assert.equal(stories.length, 21);
});

test('far clusters preserve every story once, zoom separates them, selected records stay individually accessible', () => {
  const far = groupStories(stories, false, false, null);
  assert.ok(far.some(group => group.members.length > 1));
  assert.equal(new Set(far.flatMap(group => group.members.map(story => story.id))).size, 21);
  assert.equal(far.reduce((sum, group) => sum + group.members.length, 0), 21);
  const near = groupStories(stories, true, false, null);
  assert.equal(near.length, 21); assert.ok(near.every(group => group.members.length === 1));
  const london = stories.find(story => story.city === 'London')!;
  const selected = groupStories(stories, false, true, london.id).find(group => group.members.some(story => story.id === london.id))!;
  assert.equal(selected.members.length, 1);
});

test('clustering across the date line keeps the marker near the actual places', () => {
  const a = { ...stories[0], id: 'east', latitude: 0, longitude: 179, position: earthPosition(0, 179) };
  const b = { ...stories[1], id: 'west', latitude: 0, longitude: -179, position: earthPosition(0, -179) };
  const groups = groupStories([a, b], false, false, null);
  assert.equal(groups.length, 1);
  assert.ok(groups[0].position.z < -.99);
});

test('projection hides the back face, obeys screen bounds, and keeps a mobile marker budget', () => {
  const orientation = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(20), MathUtils.degToRad(-102), 0));
  const frame = { width: 820, height: 900, centerX: 492, radius: 500, left: 100, top: 90, bottom: 800, compact: false };
  const groups = groupStories(stories, true, false, null);
  const visible = projectStoryGroups(groups, orientation, frame, null, null);
  assert.ok(visible.length > 0 && visible.length < stories.length);
  for (const item of visible) {
    assert.ok(item.group.position.clone().applyQuaternion(orientation).z > .12);
    assert.ok(item.x >= 124 && item.x <= 796 && item.y >= 114 && item.y <= 776);
  }
  const crowd = Array.from({ length: 25 }, (_, index) => ({ key: String(index), members: [{ ...stories[0], id: String(index) }], position: earthPosition(0, index * .2) }));
  const mobile = projectStoryGroups(crowd, new Quaternion(), { ...frame, centerX: 410, compact: true }, '24', null);
  assert.equal(mobile.length, 6); assert.ok(mobile.some(item => item.group.members[0].id === '24'));
  const rear = { key: 'rear', members: [stories[0]], position: earthPosition(0, 180) };
  assert.equal(projectStoryGroups([rear], new Quaternion(), frame, stories[0].id, 'rear').length, 0);
});

test('nearby mobile thumbnails separate while retaining their exact geographic anchors', () => {
  const groups = Array.from({ length: 3 }, (_, index) => ({ key: String(index), members: [{ ...stories[0], id: String(index) }], position: earthPosition(0, index) }));
  const frame = { width: 390, height: 380, centerX: 195, radius: 150, left: 8, top: 14, bottom: 340, compact: true };
  const visible = projectStoryGroups(groups, new Quaternion(), frame, null, null);
  assert.equal(visible.length, 3);
  for (const item of visible) assert.ok(Math.abs(item.anchorX - (195 + item.group.position.x * 150)) < 1e-10);
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    assert.ok(Math.abs(visible[i].x - visible[j].x) >= 44 || Math.abs(visible[i].y - visible[j].y) >= 44);
  }
  assert.ok(visible.some(item => item.x !== item.anchorX || item.y !== item.anchorY));
});
