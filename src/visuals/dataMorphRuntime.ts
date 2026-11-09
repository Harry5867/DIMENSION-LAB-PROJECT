import * as THREE from 'three';
import { associationCenters, associationEdges, createMorphPlayback, prepareMorphShapes, morphBudget, morphFrame, morphScenes, morphSettings, morphDisplayColor, type MorphMotion, type MorphShape } from './dataMorph';

type Frame = ReturnType<typeof morphFrame>;
interface Surface {
  setTheme(theme: 'light' | 'dark'): void;
  resize(width: number, height: number, dpr: number, lowPower: boolean): void;
  draw(seconds: number, dt: number, frame: Frame, pointer: { x: number; y: number }): void;
  destroy(): void;
}

// Fit all scene points across the full gentle rotation range, rather than
// zooming a fixed camera until wide PCA or GMM previews get cropped.
export function morphCameraDistance(shapes: MorphShape[], aspect: number) {
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), rotation = new THREE.Euler();
  const tan = Math.tan(Math.PI / 10), ratio = Math.max(.1, aspect);
  let distance = 3.8;
  for (const x of [-.2, 0]) for (const y of [-.3, 0, .3]) for (const z of [-.04, 0, .04]) {
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
    float t = smoothstep(0.0, 1.0, clamp((blend - seed * .16) / .84, 0.0, 1.0));
    vec3 p = mix(position, destination, t);
    p *= 1.0 + sin(time * 1.06) * ${morphSettings.breathe};
    p += vec3(sin(time * .46 + seed * 38.0), cos(time * .8 + floor(seed * 4.0) * 1.57), sin(time * .41 + seed * 16.0)) * .025;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(pointSize * (.72 + seed * .5) * pixelRatio * 7.0 / -view.z, 1.3, 9.0 * pixelRatio);
    vColor = mix(color, destinationColor, t);
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
  let shapes: MorphShape[] = [], colorArrays: Float32Array[] = [];
  let count = 0, current = -1, yaw = 0, pitch = 0;
  let theme: 'light' | 'dark' = 'light';
  function updateColors() {
    const color = new THREE.Color();
    colorArrays = shapes.map(shape => {
      const colors = new Float32Array(count * 3);
      shape.colors.forEach((hex, index) => color.set(morphDisplayColor(hex, theme)).toArray(colors, index * 3)); return colors;
    });
    current = -1;
  }
  function bind(frame: Frame) {
    if (current === frame.scene || !count) return;
    current = frame.scene;
    const update = (name: string, data: Float32Array) => {
      const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
      (attribute.array as Float32Array).set(data); attribute.needsUpdate = true;
    };
    update('position', shapes[frame.scene].positions); update('destination', shapes[frame.next].positions);
    update('color', colorArrays[frame.scene]); update('destinationColor', colorArrays[frame.next]);
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
        current = -1;
      }
      camera.position.set(0, 0, morphCameraDistance(shapes, camera.aspect));
      camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    },
    draw(seconds, dt, frame, pointer) {
      bind(frame); if (!count) return;
      const ease = 1 - Math.exp(-dt * 3.4);
      yaw += (pointer.x * .085 - yaw) * ease; pitch += (pointer.y * .055 - pitch) * ease;
      group.rotation.set(-.1 + Math.sin(seconds * .17) * .035 + pitch, Math.sin(seconds * .14) * .2 + yaw, Math.sin(seconds * .1) * .035);
      group.position.y = .1 + Math.sin(seconds * .85) * morphSettings.bob;
      material.uniforms.time.value = seconds; material.uniforms.blend.value = frame.blend;
      const association = morphScenes.length - 1;
      lineMaterial.opacity = (frame.scene === association ? 1 - frame.blend : frame.next === association ? frame.blend : 0) * .34;
      lines.visible = lineMaterial.opacity > .005;
      lines.scale.setScalar(1 + Math.sin(seconds * 1.06) * morphSettings.breathe);
      renderer.render(scene, camera);
    },
    destroy() {
      geometry.dispose(); material.dispose(); lineGeometry.dispose(); lineMaterial.dispose();
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
      shapes = []; colorArrays = [];
    },
  };
}

/** Same shapes and timeline on machines where WebGL is unavailable. */
function createCanvasSurface(host: HTMLElement): Surface {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { alpha: true });
  host.appendChild(canvas);
  const prepared = prepareMorphShapes(morphSettings.fallbackPoints);
  let width = 0, height = 0, shapes = prepared.shapes;
  let palette = shapes.map(shape => shape.colors), lineColor = '#719087';
  return {
    setTheme(theme) { palette = shapes.map(shape => shape.colors.map(hex => morphDisplayColor(hex, theme))); lineColor = theme === 'dark' ? '#a2c8b2' : '#719087'; },
    resize(w, h, dpr) {
      width = w; height = h;
      const ratio = morphBudget(w, h, dpr, true).dpr;
      canvas.width = Math.max(1, Math.round(w * ratio)); canvas.height = Math.max(1, Math.round(h * ratio));
      ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    },
    draw(seconds, _dt, frame) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const source = shapes[frame.scene], target = shapes[frame.next], scale = Math.min(width / 4.55, height / 3.7);
      const bob = Math.sin(seconds * .85) * morphSettings.bob;
      const t = frame.blend * frame.blend * (3 - 2 * frame.blend), breathe = 1 + Math.sin(seconds * 1.06) * morphSettings.breathe;
      const angle = Math.sin(seconds * .14) * .2;
      const association = morphScenes.length - 1;
      const lineAlpha = (frame.scene === association ? 1-t : frame.next === association ? t : 0) * .3;
      if (lineAlpha > .001) {
        ctx.strokeStyle = lineColor; ctx.lineWidth = .8; ctx.globalAlpha = lineAlpha; ctx.beginPath();
        associationEdges.forEach(([a, b]) => {
          const from = associationCenters[a], to = associationCenters[b];
          const factor = scale * breathe * prepared.scales[prepared.scales.length - 1];
          ctx.moveTo(width/2 + (from[0] * Math.cos(angle) + from[2] * Math.sin(angle)) * factor, height/2 - from[1] * factor - scale * (.1 + bob));
          ctx.lineTo(width/2 + (to[0] * Math.cos(angle) + to[2] * Math.sin(angle)) * factor, height/2 - to[1] * factor - scale * (.1 + bob));
        });
        ctx.stroke();
      }
      for (let i = 0; i < morphSettings.fallbackPoints; i++) {
        const k = i * 3;
        const x = (source.positions[k] * (1-t) + target.positions[k] * t) * breathe;
        const y = (source.positions[k+1] * (1-t) + target.positions[k+1] * t) * breathe + Math.cos(seconds * .8 + (i % 4) * 1.57) * .025;
        const z = source.positions[k+2] * (1-t) + target.positions[k+2] * t;
        ctx.beginPath(); ctx.arc(width/2 + (x * Math.cos(angle) + z * Math.sin(angle)) * scale, height/2 - (y + .1 + bob) * scale, 1.7, 0, Math.PI * 2);
        ctx.fillStyle = palette[frame.scene][i]; ctx.globalAlpha = .8 * (1-t); ctx.fill();
        ctx.fillStyle = palette[frame.next][i]; ctx.globalAlpha = .8 * t; ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    destroy() { shapes = []; canvas.width = canvas.height = 1; canvas.remove(); },
  };
}

export function createDataMorphRuntime(host: HTMLElement) {
  let surface: Surface;
  try { surface = createWebGLSurface(host); } catch { surface = createCanvasSurface(host); }
  let destroyed = false;
  const pointer = { x: 0, y: 0 };
  const playback = createMorphPlayback((seconds, dt) => {
    const frame = morphFrame(seconds);
    surface.draw(seconds, dt, frame, pointer);
  }, { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) });
  return {
    setTheme(theme: 'light' | 'dark') { if (!destroyed) { surface.setTheme(theme); playback.redraw(); } },
    resize(width: number, height: number, dpr: number, lowPower: boolean) {
      if (destroyed) return;
      surface.resize(width, height, dpr, lowPower); playback.redraw();
    },
    setPointer(x: number, y: number) { pointer.x = x; pointer.y = y; },
    setMotion(state: MorphMotion) { if (!destroyed) playback.setMotion(state); },
    destroy() { if (destroyed) return; destroyed = true; playback.destroy(); surface.destroy(); },
  };
}
