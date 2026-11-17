export function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '')) return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
