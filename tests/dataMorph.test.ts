import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMorphDirector, createMorphPlayback, createMorphShapes, prepareMorphShapes, morphBudget, morphFrame, morphScenes, morphSettings, morphDisplayColor, poseWeight, type MorphBlend, type MorphMotion } from '../src/visuals/dataMorph';
import { morphCameraDistance } from '../src/visuals/dataMorphRuntime';
import { Euler, PerspectiveCamera, Vector3 } from 'three';

test('enlarged algorithm scenes stay inside the camera at full pointer tilt and responsive aspect ratios', () => {
  const { shapes } = prepareMorphShapes(morphSettings.desktopPoints);
  const point = new Vector3(), rotation = new Euler();
  const maxPitch = morphSettings.idlePitch + morphSettings.pointerPitch;
  const maxYaw = morphSettings.idleYaw + morphSettings.pointerYaw;
  for (const aspect of [.65, 1.2, 2.2]) {
    const camera = new PerspectiveCamera(36, aspect, .1, 100);
    camera.position.z = morphCameraDistance(shapes, aspect); camera.updateMatrixWorld();
    for (const x of [-.1 - maxPitch, -.1, -.1 + maxPitch]) for (const y of [-maxYaw, 0, maxYaw]) for (const z of [-.035, .035]) {
      rotation.set(x, y, z);
      for (const shape of shapes) for (let i = 0; i < shape.positions.length; i += 3) {
        point.fromArray(shape.positions, i).applyEuler(rotation).multiplyScalar(1 + morphSettings.breathe);
        point.y += .1 + morphSettings.bob + .025; point.project(camera);
        assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, 'data must not be cropped by the illustration viewport');
      }
    }
  }
});

test('every illustrative shape retains point identities, finite bounded positions and stable seeds', () => {
  const shapes = createMorphShapes(480);
  assert.equal(shapes.length, 12);
  for (const shape of shapes) {
    assert.equal(shape.positions.length, 480 * 3);
    assert.equal(shape.colors.length, 480);
    assert.ok(shape.positions.every(value => Number.isFinite(value) && Math.abs(value) < 3.5));
  }
  assert.deepEqual(createMorphShapes(480), shapes);
  const smaller = createMorphShapes(360);
  shapes.forEach((shape, i) => assert.deepEqual(shape.positions.slice(0, 360 * 3), smaller[i].positions));
  // The PCA preview is a plane, not another sphere; anomalies include isolated red points.
  for (let i = 2; i < shapes[0].positions.length; i += 3) assert.ok(Math.abs(shapes[0].positions[i]) < .15);
  assert.ok(shapes[6].colors.some(color => color === '#ca5a4c'));
});

test('the morph timeline closes the final-to-first seam without a positional jump', () => {
  const shapes = createMorphShapes(40), duration = morphSettings.sceneSeconds;
  for (let scene = 0; scene < morphScenes.length; scene++) {
    const before = morphFrame((scene + 1) * duration - .000001), after = morphFrame((scene + 1) * duration);
    assert.equal(before.next, after.scene);
    assert.ok(before.blend > .99999); assert.equal(after.blend, 0);
    assert.deepEqual(shapes[before.next].positions, shapes[after.scene].positions);
  }
  assert.equal(morphFrame(1).blend, 0);
  assert.equal(morphFrame(Number.NaN).scene, 0);
});

test('a shortcut can interrupt another preview and return to neutral without snapping', () => {
  const director = createMorphDirector();
  const weights = ({ from, to, blend }: MorphBlend) => morphScenes.map((_, i) =>
    poseWeight(from, i) * (1 - blend) + poseWeight(to, i) * blend);
  const neutral = weights(director.advance(0));
  director.select('kmeans', false);
  const mid = weights(director.advance(.22));
  assert.notDeepEqual(mid, neutral);
  director.select('pca', false);
  assert.deepEqual(weights(director.advance(0)), mid);
  const pca = weights(director.advance(.5));
  assert.equal(pca[0], 1);
  assert.deepEqual(weights(director.advance(4)), pca);
  director.select(undefined, false);
  assert.deepEqual(weights(director.advance(0)), pca);
  assert.deepEqual(weights(director.advance(.5)), neutral);
  director.select('association', true);
  assert.equal(weights(director.advance(0)).at(-1), 1);
});

test('small viewports and low-power devices cap both particle count and canvas resolution', () => {
  assert.equal(morphBudget(350, 200, 3).count, 2400);
  assert.equal(morphBudget(600, 600, 3, true).count, 1600);
  assert.equal(morphBudget(600, 600, 3).count, 4800);
  const budget = morphBudget(1500, 1200, 3);
  assert.ok(budget.dpr <= 1.5);
  assert.ok(1500 * 1200 * budget.dpr ** 2 <= morphSettings.pixelBudget + .001);
});

test('animation owns one frame loop, freezes offscreen and resumes without elapsed hidden time', () => {
  const queued = new Map<number, FrameRequestCallback>(); let serial = 0;
  const paints: number[] = [];
  const runtime = createMorphPlayback(seconds => paints.push(seconds), {
    request(callback) { queued.set(++serial, callback); return serial; }, cancel(id) { queued.delete(id); },
  });
  const state: MorphMotion = { active: true, visible: true, hidden: false, reduced: false, paused: false };
  const tick = (time: number) => { const [id, callback] = queued.entries().next().value!; queued.delete(id); callback(time); };
  runtime.setMotion(state); runtime.setMotion(state); assert.equal(queued.size, 1);
  tick(0); tick(16.6667); assert.ok(Math.abs(paints.at(-1)! - .0166667) < .00001);
  const frozen = paints.at(-1)!;
  for (const disabled of [{ hidden: true }, { active: false }, { visible: false }, { paused: true }]) {
    runtime.setMotion({ ...state, ...disabled }); assert.equal(queued.size, 0);
    runtime.redraw(); assert.equal(paints.at(-1), frozen);
  }
  runtime.setMotion(state); tick(60_000); assert.equal(paints.at(-1), frozen);
  tick(60_016.6667); assert.ok(Math.abs(paints.at(-1)! - frozen - .0166667) < .00001);
  runtime.destroy(); assert.equal(queued.size, 0);
  const calls = paints.length; runtime.setMotion(state); runtime.redraw(); assert.equal(paints.length, calls);
});

test('reduced motion keeps the requested autoplay with gentler timing and still stops during navigation', () => {
  let frame: FrameRequestCallback | null = null, elapsed = 0;
  const playback = createMorphPlayback(time => { elapsed = time; }, { request(callback) { frame = callback; return 1; }, cancel() { frame = null; } });
  const state = { active: true, visible: true, hidden: false, reduced: true, paused: false };
  playback.setMotion(state);
  frame!(0); frame!(50);
  assert.ok(Math.abs(elapsed - .0225) < .000001);
  playback.setMotion({ ...state, active: false }); assert.equal(frame, null);
  playback.destroy();
});

test('dark preview colors improve visibility without changing light colors or semantic point identities', () => {
  assert.equal(morphDisplayColor('#347db0', 'light'), '#347db0');
  const dark = morphDisplayColor('#347db0', 'dark');
  assert.match(dark, /^#[0-9a-f]{6}$/);
  for (let i = 1; i < 7; i += 2) assert.ok(parseInt(dark.slice(i, i + 2), 16) > parseInt('#347db0'.slice(i, i + 2), 16));
});

test('delta-time animation advances equally at 60 Hz and 120 Hz', () => {
  function simulate(hz: number) {
    let callback: FrameRequestCallback | null = null, elapsed = 0;
    const runtime = createMorphPlayback(seconds => { elapsed = seconds; }, { request(next) { callback = next; return 1; }, cancel() { callback = null; } });
    runtime.setMotion({ active: true, visible: true, hidden: false, reduced: false, paused: false });
    for (let frame = 0; frame <= hz * 2; frame++) callback!(frame * 1000 / hz);
    runtime.destroy(); return elapsed;
  }
  assert.ok(Math.abs(simulate(60) - simulate(120)) < .000001);
});
