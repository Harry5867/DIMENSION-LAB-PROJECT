export function randomSource(seed = 42) {
  integer(seed, 0, 4294967295, 'Seed');
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function validateMatrix(data: number[][]) {
  if (!data.length || !data[0].length || data.some(r => r.length !== data[0].length || r.some(v => !Number.isFinite(v)))) throw new Error('Expected a nonempty rectangular finite matrix.');
}
export function integer(value: number, min: number, max: number, name: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}.`);
}
