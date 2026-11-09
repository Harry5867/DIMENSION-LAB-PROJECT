export function isNumberMatrix(value: unknown): value is number[][] {
  if (!Array.isArray(value) || !Array.isArray(value[0]) || value[0].length === 0) return false;
  const width = value[0].length;
  return value.every((row) => Array.isArray(row)
    && row.length === width
    && row.every((item) => typeof item === 'number' && Number.isFinite(item)));
}
