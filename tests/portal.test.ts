import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { portalSections, portalRoute, isModelRoute, isWelcomeRoute } from '../src/utils/portalNavigation';
import caseStudies from '../src/data/case-studies.json';
import { parseCSVString, extractFeatureMatrix } from '../src/utils/dataParser';
import { computePCA } from '../src/algorithms/pca';
import { computeGMM } from '../src/algorithms/gmm';
import { angleForSection, CAROUSEL_STEP, coastCarousel, dampCarousel, dragAngle, dragIntent, frontSection, orbitPoint, spinVelocity } from '../src/utils/carousel';
import { advanceAtmosphereParticle, atmosphereBudget, atmosphereEase, atmosphereMask, atmosphereParticleExpired, atmosphereSettings, createAtmosphereParticle, projectAtmosphereParticle, type AtmosphereParticle } from '../src/visuals/atmosphere';
import { createAtmosphereRuntime } from '../src/visuals/atmosphereRuntime';
import { shouldAnimateLink } from '../src/utils/sectionTransition';
import { Quaternion, Vector3 } from 'three';
import { constellationGraph } from '../src/components/globeInteraction';
import { associationExample, exampleTransactions, theoryChapters, theoryHref, theorySelection } from '../src/data/theory';
import { computeApriori } from '../src/algorithms/apriori';
import { parseWelcomePreferences, resolveWelcomeTheme } from '../src/utils/welcomePreferences';
import { readThemeMode, resolveTheme, themePreferenceKey } from '../src/utils/themePreferences';
import { shouldWaitForGenesis, genesisDuration, genesisFrame, genesisImpact, genesisScanEnd, genesisSignalStart, genesisProjection } from '../src/visuals/welcomeGenesis';
import { createEarthRenderer } from '../src/components/globeScene';

test('a fresh Welcome waits for activation while in-page returns and workspace links stay separate', () => {
  assert.ok(['', '#', '#/'].every(isWelcomeRoute));
  assert.ok(['#/overview', '#/explore', '#/theory'].every(hash => !isWelcomeRoute(hash)));
  assert.equal(shouldWaitForGenesis(false, false), true);
  assert.equal(shouldWaitForGenesis(true, false), false);
  assert.equal(shouldWaitForGenesis(false, true), false);
});

test('the Canvas fallback reveals the live points in place and preserves their appearance at handoff', () => {
  const dots: number[][] = [];
  const context = {
    setTransform() {}, clearRect() { dots.length = 0; }, beginPath() {}, stroke() {}, fill() {},
    createImageData(w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    globalAlpha: 1,
    arc(x: number, y: number, size: number) { dots.push([x, y, size, this.globalAlpha]); },
  };
  const canvas = { getContext: () => context, remove() {} };
  const moved: unknown[] = [];
  const atlas = { append: (node: unknown) => moved.push(node) } as unknown as HTMLElement;
  const overrides = {
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ ...canvas }) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } });
  try {
    const renderer = createEarthRenderer(atlas, true);
    assert.equal(renderer.kind, 'canvas');
    renderer.resize(400, 300, 200);
    const orientation = new Quaternion();
    const layers = { particles: true, grid: false, borders: false, labels: false, flags: false };
    const drawIntro = (time: number) => renderer.draw(orientation, 120, null, layers, false, null, 0, null, 'light', false, genesisFrame(time));
    drawIntro(1);
    const silhouette = dots.slice();
    assert.ok(silhouette.length > 1000);
    drawIntro(2.7);
    assert.deepEqual(dots.map(dot => dot.slice(0, 2)), silhouette.map(dot => dot.slice(0, 2)));
    assert.ok(dots.some(([x, , , alpha], i) => x < 185 && alpha > silhouette[i][3] * 2));
    assert.ok(dots.some(([x, , , alpha], i) => x > 280 && alpha === silhouette[i][3]));
    drawIntro(genesisDuration);
    const revealed = dots.slice();
    renderer.draw(orientation, 120, null, layers, false, null, 0);
    assert.deepEqual(dots, revealed);
    assert.deepEqual(moved, [renderer.canvas]);
    renderer.dispose();
  } finally {
    for (const key of ['document', 'window'] as const) {
      const descriptor = overrides[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('Welcome intro starts blank, reveals the globe before the signal, and shows the header after the scan', () => {
  const opening = genesisFrame(.12);
  assert.equal(opening.phase, 'empty');
  for (const value of [opening.silhouette, opening.atmosphere, opening.scanGlow, opening.navigation, opening.headline]) assert.equal(value, 0);
  const globe = genesisFrame(.54);
  assert.equal(globe.phase, 'globe');
  assert.ok(globe.silhouette > 0 && globe.silhouette < 1);
  const signal = genesisFrame(genesisSignalStart);
  assert.equal(signal.phase, 'signal');
  assert.equal(signal.silhouette, 1);
  const impact = genesisFrame(genesisImpact);
  assert.equal(impact.phase, 'scan');
  assert.equal(impact.scan, -1);
  const middle = genesisFrame(2.55);
  assert.ok(middle.scan > -1 && middle.scan < 1 && middle.scanGlow > 0);
  assert.equal(middle.hanoi, 0);
  assert.equal(genesisFrame(genesisScanEnd - .01).navigation, 0);
  assert.equal(genesisFrame(genesisScanEnd).phase, 'welcome');
  assert.ok(genesisFrame(4).hanoi > 0 && genesisFrame(4).action > 0 && genesisFrame(4).navigation > 0);
  const completed = genesisFrame(genesisDuration + 1);
  assert.equal(completed.phase, 'complete');
  for (const value of [completed.grid, completed.borders, completed.hanoi, completed.controls]) assert.equal(value, 1);
  assert.equal(completed.scanGlow, 0);
});

test('the overlay targets the live Atlas in desktop and stacked layouts', () => {
  const host = { left: 6, top: 8, width: 1520, height: 850 };
  const globeFrames = [
    { left: 660, top: 110, width: 860, height: 670 },
    { left: 0, top: 420, width: 390, height: 330 },
  ];
  for (const globe of globeFrames) {
    const centerX = globe.width / 2;
    const radius = Math.min(globe.width * .46, globe.height * .43);
    const projection = genesisProjection(host, globe, centerX, radius);
    assert.equal(projection.radius, radius);
    assert.equal(host.left + projection.x, globe.left + centerX);
    assert.equal(host.top + projection.y, globe.top + globe.height / 2);
  }
});

test('one appearance preference migrates legacy values without letting Model force a light theme', () => {
  const read = (values: Record<string, string>) => readThemeMode({ getItem: key => values[key] ?? null });
  assert.equal(read({ [themePreferenceKey]: 'dark', 'dimension-lab:welcome-theme': 'light', theme: 'light' }), 'dark');
  assert.equal(read({ 'dimension-lab:welcome-theme': 'dark', theme: 'light' }), 'dark');
  assert.equal(read({ [themePreferenceKey]: 'stale', 'dimension-lab:welcome-theme': 'system' }), 'system');
  assert.equal(read({ theme: 'dark' }), 'dark');
  assert.equal(read({}), 'light');
  assert.equal(readThemeMode({ getItem() { throw new Error('blocked'); } }), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
});

test('welcome preferences recover safely from unavailable or stale values', () => {
  assert.deepEqual(parseWelcomePreferences(null, null), { theme: 'light', language: 'en' });
  assert.deepEqual(parseWelcomePreferences('old-theme', 'fr'), { theme: 'light', language: 'en' });
  assert.deepEqual(parseWelcomePreferences('dark', 'vi'), { theme: 'dark', language: 'vi' });
  assert.deepEqual(parseWelcomePreferences('system', 'en'), { theme: 'system', language: 'en' });
});

test('only system appearance follows the OS preference', () => {
  for (const systemDark of [false, true]) {
    assert.equal(resolveWelcomeTheme('light', systemDark), 'light');
    assert.equal(resolveWelcomeTheme('dark', systemDark), 'dark');
    assert.equal(resolveWelcomeTheme('system', systemDark), systemDark ? 'dark' : 'light');
  }
});

test('theory deep links retain the portal route and restrict algorithms to their own chapter', () => {
  for (const chapter of theoryChapters) {
    for (const method of chapter.methods) {
      const hash = theoryHref(chapter.id, method.id);
      assert.equal(portalRoute(hash), 'theory');
      assert.equal(theorySelection(hash)?.chapter.id, chapter.id);
      assert.equal(theorySelection(hash)?.method.id, method.id);
    }
  }
  assert.equal(theorySelection('#/theory'), null);
  assert.equal(theorySelection('#/theory?chapter=missing'), null);
  assert.equal(theorySelection('#/overview?chapter=reduction'), null);
  assert.equal(theorySelection('#/theory?chapter=clustering&method=pca')?.method.id, 'kmeans');
  assert.equal(theorySelection('#/theory?chapter=reduction&method=%3Cscript%3E')?.method.id, 'pca');
});

test('the worked association example agrees with the actual Apriori implementation', () => {
  const result = computeApriori(exampleTransactions, { support: .1, confidence: .1, lift: 0, maxSize: 2, bins: 3 });
  const rule = result.rules.find(rule => rule.antecedent.join() === 'Bread' && rule.consequent.join() === 'Milk');
  assert.ok(rule);
  assert.equal(rule.count, 3);
  assert.equal(rule.support, .5);
  assert.equal(rule.confidence, .75);
  assert.equal(rule.lift, 1.125);
  assert.equal(associationExample.support, rule.support);
  assert.equal(associationExample.confidence, rule.confidence);
  assert.equal(associationExample.lift, rule.lift);
});

test('globe hover connects nearby visible source samples with a bounded graph and never changes geography', () => {
  const samples = Array.from({ length: 24 }, (_, index) => ({ position: new Vector3((index - 12) * .012, .03 * (index % 3), .95).normalize() }));
  samples.push({ position: new Vector3(0, 0, -1) });
  const before = samples.map(sample => sample.position.toArray());
  const graph = constellationGraph(samples, new Quaternion(), { x: 0, y: 0 }, 300);
  assert.equal(graph.nodes.length, 8); assert.ok(graph.edges.length > 0 && graph.edges.length <= 12);
  assert.ok(graph.nodes.every(node => node.index < 24));
  assert.equal(new Set(graph.edges.map(([a,b]) => [a,b].sort().join(':'))).size, graph.edges.length);
  assert.deepEqual(samples.map(sample => sample.position.toArray()), before);
  assert.equal(constellationGraph(samples, new Quaternion(), null, 300).nodes.length, 0);
  assert.equal(constellationGraph(samples, new Quaternion(), { x: 2, y: 2 }, 300).nodes.length, 0);
  assert.ok(constellationGraph(samples, new Quaternion(), { x: 0, y: 0 }, 300, 3).nodes.every(node => node.index < 3));
});

test('card navigation preserves native modified clicks, alternate targets, downloads and prevented gestures', () => {
  const click = { defaultPrevented: false, button: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
  assert.equal(shouldAnimateLink(click), true);
  assert.equal(shouldAnimateLink(click, '_self'), true);
  for (const key of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'defaultPrevented'] as const) {
    assert.equal(shouldAnimateLink({ ...click, [key]: true }), false);
  }
  for (const button of [1, 2]) assert.equal(shouldAnimateLink({ ...click, button }), false);
  for (const target of ['_blank', '_parent', 'other-window']) assert.equal(shouldAnimateLink(click, target), false);
  assert.equal(shouldAnimateLink(click, '', true), false);
});

test('atmosphere budgets cap particle count and backing resolution on mobile and high-DPI screens', () => {
  for (const variant of ['welcome', 'workspace'] as const) {
    for (const [width, height] of [[375, 812], [1440, 900], [3840, 2160]]) {
      const budget = atmosphereBudget(variant, width, height, 4);
      assert.ok(budget.count <= atmosphereSettings[variant].maxCount);
      assert.ok(budget.dpr <= atmosphereSettings[variant].maxDpr);
      assert.ok(width * height * budget.dpr ** 2 <= atmosphereSettings[variant].pixelBudget + .01);
      assert.ok(atmosphereBudget(variant, width, height, 4, true).count <= budget.count);
    }
  }
});

test('atmosphere projection protects text and globe while capping foreground streaks', () => {
  assert.equal(atmosphereMask('workspace', 200, 400, 1440, 900), 0);
  assert.equal(atmosphereMask('welcome', .79 * 1440, .52 * 900, 1440, 900), 0);
  assert.equal(atmosphereMask('workspace', 200, 100, 375, 812), 0);
  assert.ok(atmosphereMask('workspace', 1200, 400, 1440, 900) > .8);
  const particle: AtmosphereParticle = { x: 4000, y: 1000, z: 180, speed: 120, size: 1, phase: .2 };
  const point = projectAtmosphereParticle(particle, 1440, 900, 1050, 450, 1);
  assert.ok(Math.hypot(point.x - point.tailX, point.y - point.tailY) <= atmosphereSettings.workspace.maxTrail + 1e-8);
});

test('atmosphere motion and hover easing are frame-rate independent', () => {
  const initial: AtmosphereParticle = { x: 200, y: 100, z: 1000, speed: 90, size: 1, phase: .4 };
  function simulate(hz: number) {
    const particle = { ...initial }; let speed = 1;
    for (let i = 0; i < hz; i++) {
      advanceAtmosphereParticle(particle, 'workspace', 1 / hz, 1, 1440, 900);
      speed = atmosphereEase(speed, .55, 1 / hz);
    }
    return { particle, speed };
  }
  const a = simulate(30), b = simulate(144);
  assert.ok(Math.abs(a.particle.z - b.particle.z) < 1e-8);
  assert.ok(Math.abs(a.speed - b.speed) < 1e-8);
  assert.ok(a.speed > .55 && a.speed < 1);
});

test('particle budgets are spent in the visible field instead of outside the canvas or inside the globe mask', () => {
  let seed = 7331;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (const [width, height, focusX, focusY] of [[1440, 900, .74, .52], [375, 812, .5, .68]]) {
    let visible = 0;
    for (let i = 0; i < 200; i++) {
      const particle = createAtmosphereParticle('workspace', width, height, random, true, { focusX, focusY });
      const point = projectAtmosphereParticle(particle, width, height, width * focusX, height * focusY, 1);
      assert.ok(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height);
      if (point.opacity * atmosphereSettings.workspace.opacity > .15) visible++;
    }
    assert.ok(visible > 130, `At least 65% of the field must be visible, got ${visible}/200`);
  }
  let visibleEdges = 0;
  for (let i = 0; i < 100; i++) {
    const particle = createAtmosphereParticle('welcome', 1440, 900, random, true);
    if (atmosphereMask('welcome', particle.x, particle.y, 1440, 900) >= .2) visibleEdges++;
  }
  assert.ok(visibleEdges > 85);
  const outside: AtmosphereParticle = { x: 6000, y: 100, z: 400, speed: 100, size: 1, phase: 0 };
  assert.equal(atmosphereParticleExpired(outside, 1440, 900, .74, .52), true);
  assert.equal(atmosphereParticleExpired({ ...outside, x: 0 }, 1440, 900, .74, .52), false);
});

test('atmosphere runtime uses transparent clears and exactly one RAF, pauses and disposes cleanly', () => {
  const scheduled = new Map<number, FrameRequestCallback>(); let serial = 0, clears = 0;
  let positions: number[][] = [];
  const context = {
    clearRect() { clears++; positions = []; }, setTransform() {}, beginPath() {}, arc() {}, fill() {},
    moveTo(x: number, y: number) { positions.push([x, y]); }, lineTo() {}, stroke() {},
    fillRect() { throw new Error('Opaque/fading rectangle must not be painted over the UI'); },
  };
  const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  const clock = { request(callback: FrameRequestCallback) { scheduled.set(++serial, callback); return serial; }, cancel(id: number) { scheduled.delete(id); } };
  const run = (time: number) => { const pending = [...scheduled.values()]; scheduled.clear(); pending.forEach(callback => callback(time)); };
  const signal = { current: { focusX: .74, focusY: .52, slow: false } };
  const engine = createAtmosphereRuntime(canvas, 'workspace', signal, clock);
  const running = { active: true, visible: true, hidden: false, reduced: false };
  engine.resize(1440, 900, 2);
  assert.equal(scheduled.size, 0);
  for (let i = 0; i < 10; i++) engine.setMotion(running);
  assert.equal(scheduled.size, 1);
  run(0); run(16); run(34);
  assert.equal(scheduled.size, 1); assert.ok(clears > 1);
  engine.setMotion({ ...running, hidden: true });
  assert.equal(scheduled.size, 0);
  const pausedClears = clears; run(10000); assert.equal(clears, pausedClears);
  engine.setMotion({ ...running, reduced: true });
  assert.equal(scheduled.size, 1);
  const gentleClears = clears; run(10034);
  const gentlePositions = positions.map(point => [...point]); run(10084);
  assert.ok(clears > gentleClears, 'Reduced-motion mode must still render the requested continuous field');
  assert.notDeepEqual(positions, gentlePositions, 'Particles must advance rather than repaint a static field');
  engine.setMotion({ ...running, reduced: true, hidden: true }); assert.equal(scheduled.size, 0);
  engine.setMotion(running); assert.equal(scheduled.size, 1);
  engine.setMotion({ ...running, visible: false }); assert.equal(scheduled.size, 0);
  engine.setMotion(running); engine.setMotion({ ...running, active: false }); assert.equal(scheduled.size, 0);
  engine.setMotion(running); engine.destroy(); engine.destroy();
  assert.equal(scheduled.size, 0); assert.equal(canvas.width, 1);
});

test('faster drag releases create stronger signed momentum', () => {
  const gentle = spinVelocity(0, 20, 800, 100);
  const fast = spinVelocity(0, 100, 800, 20);
  assert.ok(fast > gentle * 5);
  assert.equal(spinVelocity(0, -100, 800, 20), -fast);
  assert.equal(spinVelocity(0, 0, 800, 20), 0);
  assert.ok(Number.isFinite(spinVelocity(0, 100, 0, 0)));
});

test('inertial spin continues after a flick and naturally decays independent of frame rate', () => {
  function simulate(dt: number) {
    let state = { position: 0, velocity: 600 };
    for (let i = 0; i < Math.round(2 / dt); i++) state = coastCarousel(state.position, state.velocity, dt);
    return state;
  }
  const first = coastCarousel(0, 600, 1 / 60);
  const second = coastCarousel(first.position, first.velocity, 1 / 60);
  assert.ok(first.position > 0 && second.position > first.position);
  assert.ok(second.velocity > 0 && second.velocity < first.velocity && first.velocity < 600);
  const sixty = simulate(1 / 60), fast = simulate(1 / 120);
  assert.ok(Math.abs(sixty.position - fast.position) < 1e-8);
  assert.ok(sixty.velocity < 1);
  assert.ok(coastCarousel(0, 300, 1 / 60, 5.5).velocity < coastCarousel(0, 300, 1 / 60).velocity);
  assert.equal(coastCarousel(17.3, 0, 1 / 60).position, 17.3);
});

test('carousel cycles in both directions and focuses every section through the shortest turn', () => {
  assert.equal(frontSection(0), 1);
  for (const angle of [-1440, -288, -72, 0, 72, 288, 1440]) {
    assert.equal(frontSection(angle + 360), frontSection(angle));
    assert.equal(frontSection(angle - CAROUSEL_STEP), (frontSection(angle) + 1) % 5);
    for (let index = 0; index < 5; index++) {
      const target = angleForSection(index, angle);
      assert.equal(frontSection(target), index);
      assert.ok(Math.abs(target - angle) <= 180);
    }
  }
});

test('carousel distinguishes clicks, touch scrolling and direct dragging without snapping', () => {
  assert.equal(dragIntent(3, 3, true), 'pending');
  assert.equal(dragIntent(4, 20, true), 'scroll');
  assert.equal(dragIntent(20, 4, true), 'rotate');
  assert.equal(dragIntent(20, 4, false), 'rotate');
  assert.equal(dragAngle(17.3, 0, 800), 17.3);
  assert.equal(dragAngle(0, 100, 800), 22.5);
  assert.equal(dragAngle(0, -100, 800), -22.5);
  assert.equal(dragAngle(22.5, -100, 800), 0);
  assert.ok(Number.isFinite(dragAngle(0, 10, 0)));
  for (let angle = 0; angle < 360; angle++) {
    const position = orbitPoint(angle);
    assert.ok(position.x > 14 && position.x < 86);
    assert.ok(position.y > 23 && position.y < 69);
    assert.ok(position.scale >= .62 && position.scale <= 1);
    assert.ok(Math.abs(position.tilt) <= 9);
  }
});

test('carousel arrow easing remains continuous across frame rates and rapid direction changes', () => {
  function simulate(step: number) {
    let state = { position: 0, velocity: 0 };
    for (let elapsed = 0; elapsed < 1; elapsed += step) state = dampCarousel(state.position, state.velocity, 72, step);
    return state;
  }
  const sixty = simulate(1 / 60), fast = simulate(1 / 120);
  assert.ok(Math.abs(sixty.position - 72) < .001);
  assert.ok(Math.abs(sixty.position - fast.position) < .001);
  const moving = dampCarousel(0, 0, 72, 1 / 60);
  const reverse = dampCarousel(moving.position, moving.velocity, -72, 1 / 120);
  assert.ok(Math.abs(reverse.position - moving.position) < 2);
  assert.ok(Number.isFinite(reverse.velocity));
  assert.deepEqual(dampCarousel(17.3, 0, 17.3, 1 / 60), { position: 17.3, velocity: 0 });
});

test('portal separates content pages and legacy workspace routes, with a safe overview fallback', () => {
  assert.equal(portalSections.length, 5);
  assert.equal(new Set(portalSections.map(section => section.href)).size, 5);
  assert.deepEqual(portalSections.map(section => isModelRoute(portalRoute(section.href))), [false, true, false, false, false]);
  for (const route of ['explore', 'datasets', 'methods', 'experiments']) assert.equal(isModelRoute(portalRoute('#/' + route)), true);
  for (const hash of ['', '#/', '#/missing', '#portal-main', '#/overview/extra']) assert.equal(portalRoute(hash), 'overview');
  assert.equal(portalRoute('#/library?example=1'), 'library');
});

test('prepared data stories reproduce PCA and seeded GMM from the exact bundled source files', () => {
  assert.deepEqual(caseStudies.map(story => story.rowCount), [569, 440]);
  for (const story of caseStudies) {
    const csv = readFileSync(new URL('../public/' + story.file, import.meta.url), 'utf8');
    assert.equal(createHash('sha256').update(csv).digest('hex'), story.sourceHash);
    const dataset = parseCSVString(csv);
    const pca = computePCA(extractFeatureMatrix(dataset.rawRows, story.features, 'z-score'));
    const gmm = computeGMM(pca.coordinates, story.configuration);
    assert.equal(story.points.length, dataset.totalRows);
    assert.equal(story.clusterCounts.reduce((sum, value) => sum + value, 0), dataset.totalRows);
    assert.deepEqual(story.variance, pca.explainedVariance);
    assert.deepEqual(story.points.map(p => p.cluster), gmm.clusters);
    story.points.forEach((point, index) => {
      assert.equal(point.row, index + 1);
      assert.ok(Math.abs(point.x - pca.coordinates[index][0]) <= 0.000001);
      assert.ok(Math.abs(point.y - pca.coordinates[index][1]) <= 0.000001);
    });
  }
});
