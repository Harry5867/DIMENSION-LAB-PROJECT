import { DatasetRow } from '../types';
import { integer } from './unsupervised';
export interface AprioriOptions { support: number; confidence: number; lift: number; maxSize: number; bins: number }
export interface AssociationRule { antecedent: string[]; consequent: string[]; support: number; confidence: number; lift: number; count: number }
export function transactionsFromRows(rows: DatasetRow[], features: string[], bins = 3) {
  integer(bins, 2, 10, 'Bins');
  const ranges = features.map(feature => {
    const values = rows.map(r => r[feature]).filter(v => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === ''));
    if (!values.length || !values.every(v => typeof v !== 'boolean' && Number.isFinite(Number(v)))) return null;
    let min = Infinity, max = -Infinity; values.forEach(v => { min = Math.min(min, Number(v)); max = Math.max(max, Number(v)); });
    return { min, max };
  });
  const transactions = rows.map(row => features.flatMap((f, j) => {
    const v = row[f]; if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return [];
    const r = ranges[j];
    return [JSON.stringify([f, r ? `bin ${r.max === r.min ? 1 : Math.min(bins, 1 + Math.floor((Number(v) - r.min) / (r.max - r.min) * bins))}/${bins}` : String(v)])];
  }));
  return { transactions, binning: features.map((feature, j) => ({ feature, range: ranges[j], bins })) };
}
export function computeApriori(transactions: string[][], options: AprioriOptions) {
  if (!transactions.length) throw new Error('Transactions are empty.');
  if (![options.support, options.confidence].every(v => Number.isFinite(v) && v > 0 && v <= 1) || !Number.isFinite(options.lift) || options.lift < 0) throw new Error('Support/confidence must be in (0, 1]; lift must be nonnegative.');
  integer(options.maxSize, 2, 4, 'Maximum itemset size');
  const sets = transactions.map(t => new Set(t)), items = [...new Set(transactions.flat())].sort();
  if (items.length > 300) throw new Error('More than 300 items. Reduce columns or bin categorical values.');
  const counts = new Map<string, number>(), key = (a: string[]) => JSON.stringify(a), rules: AssociationRule[] = [];
  let level = items.map(i => [i]), candidates = 0, truncated = false;
  for (let size = 1; size <= options.maxSize && level.length; size++) {
    const frequent: string[][] = [];
    for (const itemset of level) {
      if (++candidates > 20000) throw new Error('Candidate limit (20,000) exceeded. Increase support or reduce columns.');
      const count = sets.reduce((s, t) => s + Number(itemset.every(i => t.has(i))), 0);
      if (count / sets.length + 1e-12 < options.support) continue;
      counts.set(key(itemset), count); frequent.push(itemset);
      if (size > 1) for (let mask = 1; mask < (1 << size) - 1; mask++) {
        const a = itemset.filter((_, i) => mask & (1 << i)), b = itemset.filter((_, i) => !(mask & (1 << i)));
        const confidence = count / counts.get(key(a))!, lift = confidence / (counts.get(key(b))! / sets.length);
        if (confidence >= options.confidence && lift >= options.lift) { if (rules.length < 5000) rules.push({ antecedent: a, consequent: b, support: count / sets.length, confidence, lift, count }); else truncated = true; }
      }
    }
    const next: string[][] = [];
    if (size < options.maxSize) for (let i = 0; i < frequent.length; i++) for (let j = i + 1; j < frequent.length; j++) {
      const a = frequent[i], b = frequent[j];
      if (!a.slice(0, -1).every((v, x) => v === b[x])) continue;
      const candidate = [...a, b[b.length - 1]];
      if (candidate.every((_, x) => counts.has(key(candidate.filter((_, y) => y !== x))))) next.push(candidate);
      if (next.length > 20000) throw new Error('Candidate limit exceeded. Increase support.');
    }
    level = next;
  }
  rules.sort((a, b) => b.lift - a.lift || b.confidence - a.confidence);
  return { rules, frequentItemsets: counts.size, candidates, truncated };
}
