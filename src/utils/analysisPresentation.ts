import type { DatasetRow } from '../types';
import type { AssociationRule } from '../algorithms/apriori';

export interface BinDescription { feature: string; range: { min: number; max: number } | null; bins: number }
export function describeItem(item: string, binning: BinDescription[] = []): string {
  try {
    const [feature, value] = JSON.parse(item) as string[];
    const bin = /^bin (\d+)\/(\d+)$/.exec(value);
    const spec = binning.find(b => b.feature === feature);
    if (!bin || !spec?.range) return `${feature} = ${value}`;
    const { min, max } = spec.range, index = Number(bin[1]);
    const format = (n: number) => Number(n.toPrecision(6)).toString();
    if (min === max) return `${feature} = ${format(min)}`;
    const width = (max - min) / spec.bins;
    return `${feature} ∈ [${format(min + (index - 1) * width)}, ${format(index === spec.bins ? max : min + index * width)}${index === spec.bins ? ']' : ')'}`;
  } catch { return item; }
}
export function ruleRows(transactions: string[][], rule: AssociationRule, scope: 'antecedent' | 'both' | 'exceptions') {
  return transactions.flatMap((items, row) => {
    const a = rule.antecedent.every(item => items.includes(item));
    const b = rule.consequent.every(item => items.includes(item));
    return a && (scope === 'antecedent' || (scope === 'both' ? b : !b)) ? [row] : [];
  });
}
export function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '')) return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
export function compareRow(rows: DatasetRow[], index: number, features: string[]) {
  return features.map(feature => {
    const values = rows.map(row => numericValue(row[feature])).filter((v): v is number => v !== null);
    const value = numericValue(rows[index]?.[feature]);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const std = mean === null ? 0 : Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    return { feature, value, mean, deviation: value === null || mean === null || !std ? null : (value - mean) / std };
  }).sort((a, b) => Math.abs(b.deviation ?? 0) - Math.abs(a.deviation ?? 0));
}
