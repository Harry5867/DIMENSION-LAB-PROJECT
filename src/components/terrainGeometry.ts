import * as THREE from 'three';
import { earthPosition } from './atlasLines';
import { densityColors, maxTerrainElevation, sourceCell, type TerrainData, type TerrainView } from './terrainData';
import { createTerrainSurface, pickTerrainSurface, type TerrainSurface } from './terrainSurface';

const vertexShader = `
  attribute float rawHeight;
  attribute float smoothHeight;
  attribute float coverage;
  attribute vec3 rawNormal;
  attribute vec3 smoothNormal;
  uniform float smoothing;
  uniform float elevation;
  varying float value;
  varying float valid;
  varying vec3 world;
  varying vec3 baseNormal;
  varying vec3 surfaceNormal;
  void main() {
    value = mix(rawHeight, smoothHeight, smoothing);
    valid = coverage;
    baseNormal = normalize(mat3(modelMatrix) * position);
    surfaceNormal = normalize(mat3(modelMatrix) * normalize(mix(position, mix(rawNormal, smoothNormal, smoothing), elevation / ${maxTerrainElevation.toFixed(4)})));
    vec4 displaced = modelMatrix * vec4(position * (1.0 + value * elevation), 1.0);
    world = displaced.xyz;
    gl_Position = projectionMatrix * viewMatrix * displaced;
  }
`;
export function createTerrainLayer(globe: THREE.Group) {
  const uniforms = {
    smoothing: { value: 0 }, elevation: { value: 0 }, opacity: { value: 0 }, contrast: { value: 1 },
    colors: { value: densityColors.map(color => new THREE.Color(color)) },
    highlight: { value: new THREE.Vector3(0, 0, -2) }, highlighting: { value: 0 },
  };
  function material(wire: boolean) {
    return new THREE.ShaderMaterial({ uniforms, vertexShader, transparent: true, depthWrite: !wire,
      polygonOffset: !wire, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      fragmentShader: `
        uniform float opacity;
        uniform float contrast;
        uniform vec3 colors[6];
        uniform vec3 highlight;
        uniform float highlighting;
        varying float value;
        varying float valid;
        varying vec3 world;
        varying vec3 baseNormal;
        varying vec3 surfaceNormal;
        void main() {
          float t = pow(clamp(value, 0.0, 1.0), 1.0 / contrast) * 5.0;
          vec3 color = mix(colors[0], colors[1], clamp(t, 0.0, 1.0));
          color = mix(color, colors[2], clamp(t - 1.0, 0.0, 1.0));
          color = mix(color, colors[3], clamp(t - 2.0, 0.0, 1.0));
          color = mix(color, colors[4], clamp(t - 3.0, 0.0, 1.0));
          color = mix(color, colors[5], clamp(t - 4.0, 0.0, 1.0));
          float spot = highlighting * (1.0 - smoothstep(0.008, 0.036, distance(baseNormal, highlight)));
          ${wire ? `
            if (baseNormal.z <= 0.0) discard;
            color = mix(vec3(0.35, 0.43, 0.37), color * .48, clamp(value * .8 + valid * .15, 0.0, 1.0));
            gl_FragColor = vec4(color, opacity * mix(.34, .65, value) * smoothstep(0.0, .16, baseNormal.z));
          ` : `
            vec3 n = normalize(surfaceNormal);
            float light = .89 + .14 * max(0.0, dot(n, normalize(vec3(-.45, .70, .85))));
            color = mix(vec3(.965, .973, .962), color, smoothstep(0.0, .8, valid));
            color = mix(color, vec3(.40, .62, .51), spot * .28);
            gl_FragColor = vec4(color * light, opacity);
          `}
          #include <colorspace_fragment>
        }
      ` });
  }
  const surface = new THREE.Mesh(new THREE.BufferGeometry(), material(false));
  const wire = new THREE.LineSegments(new THREE.BufferGeometry(), material(true));
  surface.renderOrder = 2; wire.renderOrder = 3;
  surface.visible = wire.visible = false;
  globe.add(surface, wire);
  let data: TerrainData | undefined, compact: boolean | undefined, field: TerrainSurface;
  const cache = new Map<boolean, TerrainSurface>();
  function prepare(view: TerrainView, width: number) {
    const narrow = width < 520;
    if (data === view.data && compact === narrow) return;
    if (data !== view.data) cache.clear();
    data = view.data; compact = narrow;
    field = cache.get(narrow) ?? createTerrainSurface(data, narrow ? 180 : 360, narrow ? 90 : 180);
    cache.set(narrow, field);
    // Dispose replaced attributes/index buffers on LOD changes, never during ordinary frames.
    surface.geometry.dispose(); wire.geometry.dispose();
    const attrs = { position: new THREE.BufferAttribute(field.positions, 3), rawHeight: new THREE.BufferAttribute(field.raw, 1),
      smoothHeight: new THREE.BufferAttribute(field.smooth, 1), coverage: new THREE.BufferAttribute(field.valid, 1),
      rawNormal: new THREE.BufferAttribute(field.rawNormals, 3), smoothNormal: new THREE.BufferAttribute(field.smoothNormals, 3) };
    for (const object of [surface, wire]) {
      object.geometry = new THREE.BufferGeometry();
      for (const [key, attribute] of Object.entries(attrs)) object.geometry.setAttribute(key, attribute);
      object.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1 + maxTerrainElevation);
    }
    surface.geometry.setIndex(field.indices); wire.geometry.setIndex(field.lines);
  }
  return {
    draw(view: TerrainView | null, blend: number, width: number) {
      surface.visible = !!view && blend > 0; wire.visible = surface.visible && !!view?.wireframe;
      if (!view) return;
      prepare(view, width);
      uniforms.smoothing.value = view.smoothing;
      uniforms.elevation.value = maxTerrainElevation * view.intensity * blend;
      uniforms.opacity.value = blend;
      uniforms.contrast.value = view.contrast;
      uniforms.highlighting.value = view.highlight === null ? 0 : 1;
      if (view.highlight !== null) {
        const sample = sourceCell(view.data, view.highlight);
        uniforms.highlight.value.copy(earthPosition(sample.latitude, sample.longitude)).applyQuaternion(globe.quaternion);
      }
    },
    pick(view: TerrainView, blend: number, orientation: THREE.Quaternion, x: number, y: number, width: number) {
      prepare(view, width);
      return pickTerrainSurface(field, view, blend, orientation, x, y);
    },
    dispose() {
      for (const object of [surface, wire]) { object.geometry.dispose(); object.material.dispose(); globe.remove(object); }
      cache.clear();
    },
  };
}
