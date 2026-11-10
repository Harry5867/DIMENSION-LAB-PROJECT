import * as THREE from 'three';
import type { ColorMode, DataPoint } from '../types';
import { particleStyle } from '../visuals/particleStyle';

export const clusterColors = ['#547da5', '#b77542', '#bd6269', '#3e8e87', '#598551', '#a48743', '#906e9e', '#ae7188', '#906c59', '#817d80'];
export const ruleColors = ['#557294', '#b96d43'] as const;

export function makePlotColors(points: DataPoint[], mode: ColorMode, feature: string | undefined, dark: boolean) {
  const tint = (hex: string) => {
    const color = new THREE.Color(hex);
    if (dark) color.lerp(new THREE.Color('#ffffff'), .22);
    return '#' + color.getHexString();
  };
  const missing = tint('#7e8996'), noise = tint('#687783');
  const clusters = clusterColors.map(tint), rules = ruleColors.map(tint);
  const low = tint('#4c75b4'), mid = tint('#438a73'), high = tint('#bd6554');
  const labels = [...new Set(points.map(point => String(point.label ?? '').trim()).filter(Boolean))].sort();
  const byLabel = new Map(labels.map((label, index) => [label,
    label === 'M' || label === '1' ? tint('#bd6269')
      : label === 'B' || label === '0' ? tint('#598551') : clusters[index % clusters.length],
  ]));
  let min = Infinity, max = -Infinity;
  if (mode === 'feature' && feature) {
    for (const point of points) {
      const value = point.originalFeatures[feature];
      if (value == null || !Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  const a = new THREE.Color(low), b = new THREE.Color(mid), c = new THREE.Color(high);
  const color = new THREE.Color();
  return {
    low, mid, high, rules, missing, noise, clusters, byLabel,
    forPoint(point: DataPoint): string {
      if (mode === 'ground-truth') return byLabel.get(String(point.label ?? '').trim()) ?? missing;
      if (mode === 'cluster') return point.cluster === -1 ? noise : clusters[point.cluster % clusters.length] ?? missing;
      if (!feature) return missing;
      if (feature === '__rule_match') return rules[Number(Boolean(point.analysisMatch))];
      const value = point.originalFeatures[feature];
      if (value == null || !Number.isFinite(value)) return missing;
      const t = THREE.MathUtils.clamp((value - min) / (max - min || 1), 0, 1);
      color.lerpColors(t < .5 ? a : b, t < .5 ? b : c, t < .5 ? t * 2 : (t - .5) * 2);
      return '#' + color.getHexString();
    },
  };
}

export function normalizePlotPoints(dataPoints: DataPoint[]) {
  if (!dataPoints.length) return { points: [], groundY: -36 };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const point of dataPoints) {
    [point.x, point.y, point.z].forEach((value, axis) => {
      const coordinate = Number.isFinite(value) ? value : 0;
      min[axis] = Math.min(min[axis], coordinate);
      max[axis] = Math.max(max[axis], coordinate);
    });
  }
  const [x, y, z] = min.map((value, axis) => value + (max[axis] - value) / 2);
  const scale = 72 / (Math.max(...min.map((value, axis) => max[axis] - value)) || 1);
  const points = dataPoints.map(point => ({
    ...point, x: ((Number.isFinite(point.x) ? point.x : 0) - x) * scale,
    y: ((Number.isFinite(point.y) ? point.y : 0) - y) * scale,
    z: ((Number.isFinite(point.z) ? point.z : 0) - z) * scale,
  }));
  return { points, groundY: (min[1] - y) * scale - 3, center: [x, y, z], scale };
}

/** Return target indices in the currently displayed order, using source row identity. */
export function matchPlotRows(before: DataPoint[], after: DataPoint[]): number[] | null {
  if (!before.length || before.length !== after.length) return null;
  const indices = new Map<number, number>();
  for (const [index, point] of after.entries()) {
    if (point.rowIndex === undefined || !Number.isSafeInteger(point.rowIndex) || point.rowIndex < 0 || indices.has(point.rowIndex)) return null;
    indices.set(point.rowIndex, index);
  }
  const order: number[] = [];
  for (const point of before) {
    if (point.rowIndex === undefined) return null;
    const index = indices.get(point.rowIndex);
    if (index === undefined) return null;
    order.push(index);
    indices.delete(point.rowIndex);
  }
  return order;
}

export type PlotTransition = (
  points: DataPoint[], mode: ColorMode, feature: string | undefined, sameDataset: boolean, signal: AbortSignal,
) => Promise<void>;

type Cloud = { mesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; capacity: number };

export function createPlotCloud(scene: THREE.Scene) {
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  const matrix = new THREE.Matrix4(), color = new THREE.Color();
  let primary: Cloud | undefined;
  let pickingCloud: Cloud | undefined;
  let settled: { points: DataPoint[]; colors: Float32Array; scale: number } | undefined;
  let motion: { advance: (time: number) => void; stop: () => void } | undefined;
  const make = (count: number): Cloud => {
    const capacity = 2 ** Math.ceil(Math.log2(Math.max(1, count)));
    const material = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false });
    material.onBeforeCompile = shader => {
      const varyings = 'varying vec3 particleNormal;\nvarying vec3 particleView;\n';
      shader.vertexShader = varyings + shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        particleNormal = normalMatrix * normal;
        particleView = -mvPosition.xyz;
      `);
      shader.fragmentShader = varyings + shader.fragmentShader.replace('#include <opaque_fragment>', `
        float facing = clamp(dot(normalize(particleNormal), normalize(particleView)), 0.0, 1.0);
        float radius = sqrt(1.0 - facing * facing);
        diffuseColor.a *= 0.92 * (1.0 - smoothstep(${particleStyle.edgeStart}, 1.0, radius));
        outgoingLight *= 1.0 + (1.0 - radius) * ${particleStyle.coreLift};
        #include <opaque_fragment>
      `);
    };
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    // Blend the particle edge over the grid and marker layers.
    mesh.renderOrder = 1;
    scene.add(mesh);
    return { mesh, capacity };
  };
  const remove = ({ mesh }: Cloud) => {
    scene.remove(mesh);
    mesh.dispose();
    mesh.material.dispose();
  };
  const packColors = (colors: string[]) => {
    const values = new Float32Array(colors.length * 3);
    colors.forEach((hex, i) => color.set(hex).toArray(values, i * 3));
    return values;
  };
  function write(cloud: Cloud, points: DataPoint[], colors: Float32Array, scale: number, selected: DataPoint | null,
    destination?: DataPoint[], destinationColors = colors, t = 0) {
    const { mesh } = cloud;
    mesh.count = points.length;
    for (let i = 0; i < points.length; i++) {
      const point = points[i], next = destination?.[i] ?? point;
      const isSelected = selected && (selected.rowIndex ?? selected.id) === (point.rowIndex ?? point.id);
      const r = scale * (isSelected ? 1.65 : 1);
      matrix.makeScale(r, r, r).setPosition(THREE.MathUtils.lerp(point.x, next.x, t),
        THREE.MathUtils.lerp(point.y, next.y, t), THREE.MathUtils.lerp(point.z, next.z, t));
      mesh.setMatrixAt(i, matrix);
      const k = i * 3;
      color.setRGB(THREE.MathUtils.lerp(colors[k], destinationColors[k], t),
        THREE.MathUtils.lerp(colors[k + 1], destinationColors[k + 1], t),
        THREE.MathUtils.lerp(colors[k + 2], destinationColors[k + 2], t));
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (!motion) mesh.computeBoundingSphere();
  }
  function sync(points: DataPoint[], colors: string[], scale: number, selected: DataPoint | null) {
    if (motion) return;
    settled = { points, colors: packColors(colors), scale };
    if (!primary || primary.capacity < points.length) {
      if (primary) remove(primary);
      primary = make(points.length);
    }
    write(primary, points, settled.colors, scale, selected);
    pickingCloud = primary;
  }
  const fade = (cloud: Cloud, opacity: number) => {
    cloud.mesh.material.opacity = opacity;
  };
  return {
    sync,
    get mesh() { return primary?.mesh; },
    get pickMesh() { return pickingCloud && pickingCloud.mesh.material.opacity >= .3 ? pickingCloud.mesh : undefined; },
    get transitioning() { return Boolean(motion); },
    tick(time: number) { motion?.advance(time); },
    cancel() { motion?.stop(); },
    stage(points: DataPoint[], colors: string[], sameDataset: boolean, signal: AbortSignal,
      getSelection: () => DataPoint | null, onProgress?: (eased: number) => void) {
      motion?.stop();
      const current = settled, source = primary;
      if (!source || !current?.points.length || signal.aborted) return Promise.resolve();
      const order = sameDataset ? matchPlotRows(current.points, points) : null;
      const destination = order?.map(index => points[index]);
      const destinationColors = packColors(order ? order.map(index => colors[index]) : colors);
      const next = order ? undefined : make(points.length);
      if (next) {
        write(next, points, destinationColors, current.scale, null);
        fade(next, 0);
      }
      const start = performance.now(), duration = order ? 850 : 250;
      // Bounds of either endpoint enclose each interpolated point.
      source.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 72);
      return new Promise<void>(resolve => {
        function finish(cancelled: boolean) {
          signal.removeEventListener('abort', stop);
          motion = undefined;
          if (cancelled) {
            if (next) remove(next);
            fade(source!, 1);
            write(source!, current!.points, current!.colors, current!.scale, getSelection());
            onProgress?.(0);
          } else if (next) {
            pickingCloud = undefined;
            remove(source!);
            primary = next;
            fade(next, 1);
          }
          resolve();
        }
        function stop() { finish(true); }
        motion = {
          stop,
          advance(time) {
            const progress = THREE.MathUtils.clamp((time - start) / duration, 0, 1);
            const t = progress * progress * (3 - 2 * progress);
            onProgress?.(t);
            if (next) {
              fade(source, 1 - t);
              fade(next, t);
            } else {
              write(source, current.points, current.colors, current.scale, getSelection(), destination, destinationColors, t);
            }
            if (progress === 1) finish(false);
          },
        };
        signal.addEventListener('abort', stop, { once: true });
      });
    },
    destroy() {
      motion?.stop();
      if (primary) remove(primary);
      geometry.dispose();
    },
  };
}
