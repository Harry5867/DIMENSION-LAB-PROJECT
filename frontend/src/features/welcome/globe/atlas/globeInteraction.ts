import { Quaternion, Vector3 } from 'three';

export interface GlobeHover { x: number; y: number }
export function constellationGraph(samples: readonly { position: Vector3 }[], orientation: Quaternion,
  hover: GlobeHover | null, radius: number, count = samples.length) {
  const nodes: Array<{ index: number; x: number; y: number; distance: number }> = [];
  const edges: Array<[number, number]> = [];
  if (!hover || radius <= 0 || hover.x * hover.x + hover.y * hover.y > 1.05) return { nodes, edges };
  const projected = new Vector3(), range = Math.min(76, radius * .35);
  for (let index = 0; index < Math.min(count, samples.length); index++) {
    projected.copy(samples[index].position).applyQuaternion(orientation);
    if (projected.z < .12) continue;
    const distance = Math.hypot(projected.x - hover.x, projected.y - hover.y) * radius;
    if (distance > range) continue;
    nodes.push({ index, x: projected.x, y: projected.y, distance });
    nodes.sort((a, b) => a.distance - b.distance || a.index - b.index);
    if (nodes.length > 8) nodes.pop();
  }
  // A small local graph on genuine map samples, never invented screen-space dots.
  const used = new Set<string>();
  nodes.forEach((node, a) => {
    nodes.map((other, b) => ({ b, distance: Math.hypot(node.x - other.x, node.y - other.y) * radius }))
      .filter(item => item.b !== a && item.distance < range).sort((a, b) => a.distance - b.distance).slice(0, 2)
      .forEach(({ b }) => {
        const key = Math.min(a, b) + ':' + Math.max(a, b);
        if (!used.has(key) && edges.length < 12) { used.add(key); edges.push([a, b]); }
      });
  });
  return { nodes, edges };
}
