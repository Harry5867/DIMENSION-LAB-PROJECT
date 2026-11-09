import { integer, randomSource, validateMatrix } from './unsupervised';
export interface IsolationOptions { trees: number; sampleSize: number; contamination: number; seed: number }
type Tree = { size: number; feature?: number; split?: number; left?: Tree; right?: Tree };
const adjustment = (n: number): number => n <= 1 ? 0 : n === 2 ? 1 : 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n;
export function computeIsolationForest(data: number[][], options: IsolationOptions) {
  validateMatrix(data); integer(options.trees, 1, 500, 'Trees'); integer(options.sampleSize, 2, 4096, 'Sample size');
  if (!Number.isFinite(options.contamination) || options.contamination <= 0 || options.contamination > 0.5) throw new Error('Contamination must be in (0, 0.5].');
  if (data.length < 2) throw new Error('Isolation Forest requires at least two rows.');
  const random = randomSource(options.seed), size = Math.min(data.length, options.sampleSize), depthLimit = Math.ceil(Math.log2(size));
  const build = (rows: number[][], depth: number): Tree => {
    if (rows.length <= 1 || depth >= depthLimit) return { size: rows.length };
    const ranges = rows[0].map((_, j) => { let min = Infinity, max = -Infinity; rows.forEach(row => { min = Math.min(min, row[j]); max = Math.max(max, row[j]); }); return { j, min, max }; }).filter(r => r.max > r.min);
    if (!ranges.length) return { size: rows.length };
    const r = ranges[Math.floor(random() * ranges.length)], split = r.min + random() * (r.max - r.min);
    const left = rows.filter(row => row[r.j] < split), right = rows.filter(row => row[r.j] >= split);
    if (!left.length || !right.length) return { size: rows.length };
    return { size: rows.length, feature: r.j, split, left: build(left, depth + 1), right: build(right, depth + 1) };
  };
  const path = (row: number[], tree: Tree, depth = 0): number => tree.feature === undefined ? depth + adjustment(tree.size) : path(row, row[tree.feature] < tree.split! ? tree.left! : tree.right!, depth + 1);
  const sums = data.map(() => 0);
  for (let t = 0; t < options.trees; t++) {
    const indices = data.map((_, i) => i);
    for (let i = 0; i < size; i++) { const j = i + Math.floor(random() * (indices.length - i)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
    const tree = build(indices.slice(0, size).map(i => data[i]), 0);
    data.forEach((row, i) => sums[i] += path(row, tree));
  }
  const scores = sums.map(s => 2 ** (-s / options.trees / adjustment(size)));
  const sorted = [...scores].sort((a, b) => b - a), threshold = sorted[Math.max(0, Math.ceil(data.length * options.contamination) - 1)];
  // Ties at the threshold are included, so the observed proportion can exceed the requested proportion.
  return { scores, anomalies: scores.map(s => s >= threshold), threshold };
}
