import { MAX_CSV_COLUMNS, MAX_CSV_ROWS } from '@dimension-lab/algorithms/dataParser';

export function isNumberMatrix(value: unknown): value is number[][] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CSV_ROWS
    || !Array.isArray(value[0]) || value[0].length === 0 || value[0].length > MAX_CSV_COLUMNS) return false;
  const width = value[0].length;
  return value.every((row) => Array.isArray(row)
    && row.length === width
    && row.every((item) => typeof item === 'number' && Number.isFinite(item)));
}
