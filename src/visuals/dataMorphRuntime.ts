import * as THREE from 'three';
import {
  associationCenters, associationEdges, createMorphDirector, createMorphPlayback, prepareMorphShapes,
  morphBudget, morphScenes, morphSettings, morphDisplayColor, poseWeight,
  type MorphBlend, type MorphMotion, type MorphPose, type MorphSceneId, type MorphShape,
} from './dataMorph';
interface Surface {
  setTheme(theme: 'light' | 'dark'): void;
  resize(width: number, height: number, dpr: number, lowPower: boolean): void;
  draw(seconds: number, dt: number, frame: MorphBlend, pointer: { x: number; y: number }): void;
  destroy(): void;
}

function writePose(buffer: Float32Array, sources: readonly Float32Array[], pose: MorphPose) {
  if (typeof pose === 'number') {
    buffer.set(sources[pose]);
    return;
  }
  buffer.fill(0);
  pose.forEach((weight, scene) => {
    if (!weight) return;
    const source = sources[scene];
    for (let i = 0; i < buffer.length; i++) buffer[i] += source[i] * weight;
  });
}

function colorBuffers(shapes: MorphShape[], theme: 'light' | 'dark') {
  const color = new THREE.Color();
  return shapes.map(shape => {
    const buffer = new Float32Array(shape.positions.length);
    shape.colors.forEach((hex, index) => color.set(morphDisplayColor(hex, theme)).toArray(buffer, index * 3));
    return buffer;
  });
}

function associationOpacity({ from, to, blend }: MorphBlend) {
  const association = morphScenes.length - 1;
  return poseWeight(from, association) * (1 - blend) + poseWeight(to, association) * blend;
}

// Fit all scene points across the full gentle rotation range, rather than
// zooming a fixed camera until wide PCA or GMM previews get cropped.
export function morphCameraDistance(shapes: MorphShape[], aspect: number) {
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), rotation = new THREE.Euler();
  const tan = Math.tan(Math.PI / 10), ratio = Math.max(.1, aspect);
  const pitch = morphSettings.idlePitch + morphSettings.pointerPitch;
  const yaw = morphSettings.idleYaw + morphSettings.pointerYaw;
  let distance = 3.8;
  for (const x of [-.1 - pitch, -.1 + pitch]) for (const y of [-yaw, 0, yaw]) for (const z of [-.04, 0, .04]) {
    matrix.makeRotationFromEuler(rotation.set(x, y, z));
    for (const shape of shapes) for (let i = 0; i < shape.positions.length; i += 3) {
      point.fromArray(shape.positions, i).applyMatrix4(matrix).multiplyScalar(1 + morphSettings.breathe);
      const dx = Math.abs(point.x) + .035, dy = Math.abs(point.y + .1) + .035 + morphSettings.bob;
      distance = Math.max(distance, point.z + Math.max(dx * 1.075 / (tan * ratio), dy * 1.1 / tan));
    }
  }
  return distance;
}

const vertexShader = `
  attribute vec3 destination;
  attribute vec3 destinationColor;
  attribute float seed;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float blend;
  uniform float time;
  uniform float pixelRatio;
  uniform float pointSize;
  void main() {
    vec3 p = mix(position, destination, blend);
    p *= 1.0 + sin(time * 1.06) * ${morphSettings.breathe};
    p += vec3(sin(time * .46 + seed * 38.0), cos(time * .8 + floor(seed * 4.0) * 1.57), sin(time * .41 + seed * 16.0)) * .025;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(pointSize * (.72 + seed * .5) * pixelRatio * 7.0 / -view.z, 1.3, 9.0 * pixelRatio);
    vColor = mix(color, destinationColor, blend);
    vAlpha = clamp(.92 - (view.z * -.025), .55, .9);
  }
`;
const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - vec2(.5)) * 2.0;
    if (r > 1.0) discard;
    float alpha = (1.0 - smoothstep(.66, 1.0, r)) * vAlpha;
    gl_FragColor = vec4(vColor * (1.0 + (1.0-r) * .12), alpha);
    #include <colorspace_fragment>
  }
`;

function createWebGLSurface(host: HTMLElement): Surface {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), group = new THREE.Group(); group.position.y = .1; scene.add(group);
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, vertexColors: true,
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { blend: { value: 0 }, time: { value: 0 }, pixelRatio: { value: 1 }, pointSize: { value: morphSettings.pointSize } },
  });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; group.add(points);
  const linePositions = new Float32Array(associationEdges.length * 6);
  associationEdges.forEach(([from, to], i) => {
    linePositions.set(associationCenters[from], i * 6); linePositions.set(associationCenters[to], i * 6 + 3);
  });
  const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#719087', transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial); group.add(lines);
  let shapes: MorphShape[] = [], positionArrays: Float32Array[] = [], colorArrays: Float32Array[] = [];
  let count = 0, yaw = 0, pitch = 0;
  let fromPose: MorphPose | undefined, toPose: MorphPose | undefined;
  let theme: 'light' | 'dark' = 'light';
  function updateColors() {
    colorArrays = colorBuffers(shapes, theme);
    fromPose = toPose = undefined;
  }
  function bind(frame: MorphBlend) {
    if (!count) return;
    const update = (name: string, sources: Float32Array[], pose: MorphPose) => {
      const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
      writePose(attribute.array as Float32Array, sources, pose);
      attribute.needsUpdate = true;
    };
    if (frame.from !== fromPose) {
      fromPose = frame.from;
      update('position', positionArrays, fromPose);
      update('color', colorArrays, fromPose);
    }
    if (frame.to !== toPose) {
      toPose = frame.to;
      update('destination', positionArrays, toPose);
      update('destinationColor', colorArrays, toPose);
    }
  }
  host.appendChild(canvas);
  return {
    setTheme(next) { theme = next; lineMaterial.color.set(theme === 'dark' ? '#a2c8b2' : '#719087'); updateColors(); },
    resize(width, height, dpr, lowPower) {
      const budget = morphBudget(width, height, dpr, lowPower);
      renderer.setPixelRatio(budget.dpr); renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      material.uniforms.pixelRatio.value = budget.dpr;
      camera.aspect = width / Math.max(1, height);
      if (count !== budget.count) {
        // Release the previous buffers before a responsive particle-count change.
        geometry.dispose();
        count = budget.count;
        const prepared = prepareMorphShapes(count); shapes = prepared.shapes;
        positionArrays = shapes.map(shape => shape.positions);
        const associationScale = prepared.scales[prepared.scales.length - 1];
        associationEdges.forEach(([from, to], i) => {
          for (let axis = 0; axis < 3; axis++) {
            linePositions[i * 6 + axis] = associationCenters[from][axis] * associationScale;
            linePositions[i * 6 + 3 + axis] = associationCenters[to][axis] * associationScale;
          }
        });
        lineGeometry.getAttribute('position').needsUpdate = true;
        updateColors();
        for (const name of ['position', 'destination', 'color', 'destinationColor']) {
          geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
        }
        geometry.setAttribute('seed', new THREE.BufferAttribute(Float32Array.from({ length: count }, (_, i) => ((i * 73 + 19) % 997) / 997), 1));
      }
      camera.position.set(0, 0, morphCameraDistance(shapes, camera.aspect));
      camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    },
    draw(seconds, dt, frame, pointer) {
      bind(frame); if (!count) return;
      const ease = 1 - Math.exp(-dt * morphSettings.pointerFollow);
      yaw += (pointer.x * morphSettings.pointerYaw - yaw) * ease;
      pitch += (pointer.y * morphSettings.pointerPitch - pitch) * ease;
      group.rotation.set(-.1 + Math.sin(seconds * .17) * morphSettings.idlePitch + pitch,
        Math.sin(seconds * .14) * morphSettings.idleYaw + yaw, Math.sin(seconds * .1) * .035);
      group.position.y = .1 + Math.sin(seconds * .85) * morphSettings.bob;
      material.uniforms.time.value = seconds; material.uniforms.blend.value = frame.blend;
      lineMaterial.opacity = associationOpacity(frame) * .34;
      lines.visible = lineMaterial.opacity > .005;
      lines.scale.setScalar(1 + Math.sin(seconds * 1.06) * morphSettings.breathe);
      renderer.render(scene, camera);
    },
    destroy() {
      geometry.dispose(); material.dispose(); lineGeometry.dispose(); lineMaterial.dispose();
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      shapes = []; positionArrays = []; colorArrays = [];
    },
  };
}

/** Same shapes and timeline on machines where WebGL is unavailable. */
function createCanvasSurface(host: HTMLElement): Surface {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { alpha: true });
  host.appendChild(canvas);
  const prepared = prepareMorphShapes(morphSettings.fallbackPoints);
  const shapes = prepared.shapes;
  const positions = shapes.map(shape => shape.positions);
  let width = 0, height = 0, lineColor = '#719087', yaw = 0, pitch = 0;
  let palette = shapes.map(shape => shape.colors), colors = colorBuffers(shapes, 'light');
  type CanvasPose = MorphShape & { linearColors: Float32Array };
  const paintColor = new THREE.Color();
  let cached = new WeakMap<readonly number[], CanvasPose>();
  const lookup = (pose: MorphPose): CanvasPose => {
    if (typeof pose === 'number') return { positions: positions[pose], colors: palette[pose], linearColors: colors[pose] };
    const existing = cached.get(pose);
    if (existing) return existing;
    const projected = new Float32Array(morphSettings.fallbackPoints * 3), blended = new Float32Array(projected.length);
    writePose(projected, positions, pose);
    writePose(blended, colors, pose);
    const shape = { positions: projected, linearColors: blended, colors: Array.from({ length: morphSettings.fallbackPoints },
      (_, i) => paintColor.fromArray(blended, i * 3).getStyle()) };
    cached.set(pose, shape);
    return shape;
  };
  return {
    setTheme(theme) {
      palette = shapes.map(shape => shape.colors.map(hex => morphDisplayColor(hex, theme)));
      colors = colorBuffers(shapes, theme);
      cached = new WeakMap();
      lineColor = theme === 'dark' ? '#a2c8b2' : '#719087';
    },
    resize(w, h, dpr) {
      width = w; height = h;
      const ratio = morphBudget(w, h, dpr, true).dpr;
      canvas.width = Math.max(1, Math.round(w * ratio)); canvas.height = Math.max(1, Math.round(h * ratio));
      ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    },
    draw(seconds, dt, frame, pointer) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const source = lookup(frame.from), target = lookup(frame.to), scale = Math.min(width / 4.55, height / 3.7);
      const bob = Math.sin(seconds * .85) * morphSettings.bob;
      const t = frame.blend, breathe = 1 + Math.sin(seconds * 1.06) * morphSettings.breathe;
      const ease = 1 - Math.exp(-dt * morphSettings.pointerFollow);
      yaw += (pointer.x * morphSettings.pointerYaw - yaw) * ease;
      pitch += (pointer.y * morphSettings.pointerPitch - pitch) * ease;
      const angle = Math.sin(seconds * .14) * morphSettings.idleYaw + yaw;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const lineAlpha = associationOpacity(frame) * .3;
      if (lineAlpha > .001) {
        ctx.strokeStyle = lineColor; ctx.lineWidth = .8; ctx.globalAlpha = lineAlpha; ctx.beginPath();
        associationEdges.forEach(([a, b]) => {
          const from = associationCenters[a], to = associationCenters[b];
          const factor = scale * breathe * prepared.scales[prepared.scales.length - 1];
          ctx.moveTo(width/2 + (from[0] * cos + from[2] * sin) * factor, height/2 - (from[1] - from[2] * pitch) * factor - scale * (.1 + bob));
          ctx.lineTo(width/2 + (to[0] * cos + to[2] * sin) * factor, height/2 - (to[1] - to[2] * pitch) * factor - scale * (.1 + bob));
        });
        ctx.stroke();
      }
      ctx.globalAlpha = .8;
      for (let i = 0; i < morphSettings.fallbackPoints; i++) {
        const k = i * 3;
        const x = (source.positions[k] * (1-t) + target.positions[k] * t) * breathe;
        const y = (source.positions[k+1] * (1-t) + target.positions[k+1] * t) * breathe + Math.cos(seconds * .8 + (i % 4) * 1.57) * .025;
        const z = source.positions[k+2] * (1-t) + target.positions[k+2] * t;
        ctx.beginPath(); ctx.arc(width/2 + (x * cos + z * sin) * scale, height/2 - (y - z * pitch + .1 + bob) * scale, 1.7, 0, Math.PI * 2);
        if (t === 0) ctx.fillStyle = source.colors[i];
        else if (t === 1) ctx.fillStyle = target.colors[i];
        else {
          const a = source.linearColors, b = target.linearColors;
          ctx.fillStyle = paintColor.setRGB(a[k] + (b[k] - a[k]) * t,
            a[k+1] + (b[k+1] - a[k+1]) * t, a[k+2] + (b[k+2] - a[k+2]) * t).getStyle();
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    destroy() { canvas.width = canvas.height = 1; canvas.remove(); },
  };
}

export function createDataMorphRuntime(host: HTMLElement) {
  let surface: Surface;
  try { surface = createWebGLSurface(host); } catch { surface = createCanvasSurface(host); }
  let destroyed = false;
  const director = createMorphDirector();
  const pointer = { x: 0, y: 0 };
  const playback = createMorphPlayback((seconds, dt) => {
    const frame = director.advance(dt);
    surface.draw(seconds, dt, frame, pointer);
  }, { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) });
  return {
    setTheme(theme: 'light' | 'dark') { if (!destroyed) { surface.setTheme(theme); playback.redraw(); } },
    resize(width: number, height: number, dpr: number, lowPower: boolean) {
      if (destroyed) return;
      surface.resize(width, height, dpr, lowPower); playback.redraw();
    },
    setPointer(x: number, y: number) { pointer.x = x; pointer.y = y; },
    setPreview(scene: MorphSceneId | undefined, immediate = false) {
      if (destroyed) return;
      director.select(scene, immediate);
      playback.redraw();
    },
    setMotion(state: MorphMotion) { if (!destroyed) playback.setMotion(state); },
    destroy() { if (destroyed) return; destroyed = true; playback.destroy(); surface.destroy(); },
  };
}
