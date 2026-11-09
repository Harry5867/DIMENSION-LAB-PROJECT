import { numericValue } from '../utils/analysisPresentation';
import { DatasetRow, NormalizationMethod } from '../types';
import { extractFeatureMatrix } from '../utils/dataParser';
import { computeIsolationForest, IsolationOptions } from './isolationForest';
import { AprioriOptions, computeApriori, transactionsFromRows } from './apriori';
export type AnalysisTask = { kind: 'anomaly'; rows: DatasetRow[]; features: string[]; normalization: NormalizationMethod; options: IsolationOptions }
  | { kind: 'association'; rows: DatasetRow[]; features: string[]; options: AprioriOptions };
export function runAnalysisTask(task: AnalysisTask) {
  task = parseAnalysisTask(task);
  if (task.rows.length > 20000 || !task.features.length || task.features.length > 100) throw new Error('Select 1–100 columns and at most 20,000 rows.');
  if (task.kind === 'anomaly') {
    const preprocessing = task.features.map(feature => {
      const values = task.rows.map(row => numericValue(row[feature])).filter((v): v is number => v !== null);
      if (!values.length) throw new Error(`Column ${feature} has no valid numeric values.`);
      return { feature, missing: task.rows.length - values.length, mean: values.reduce((a, b) => a + b, 0) / values.length };
    });
    const rows = task.rows.map(row => Object.fromEntries(preprocessing.map(p => [p.feature, numericValue(row[p.feature]) ?? p.mean])));
    return { kind: 'anomaly' as const, preprocessing, ...computeIsolationForest(extractFeatureMatrix(rows, task.features, task.normalization), task.options) };
  }
  const prepared = transactionsFromRows(task.rows, task.features, task.options.bins);
  return { kind: 'association' as const, ...computeApriori(prepared.transactions, task.options), ...prepared };
}
export type AnalysisTaskResult = ReturnType<typeof runAnalysisTask>;

/** Runtime boundary shared by API callers and saved configurations. */
export function parseAnalysisTask(value: unknown): AnalysisTask {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid task.');
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.rows) || !v.rows.length || v.rows.length > 20000 || !v.rows.every(row => typeof row === 'object' && row !== null && !Array.isArray(row) && Object.values(row).every(x => x === null || (typeof x === 'number' ? Number.isFinite(x) : ['string', 'boolean'].includes(typeof x))))
    || !Array.isArray(v.features) || !v.features.length || v.features.length > 100 || !v.features.every(f => typeof f === 'string')
    || typeof v.options !== 'object' || v.options === null) throw new Error('Invalid rows, columns or options.');
  if (new Set(v.features).size !== v.features.length || !v.features.every(f => (v.rows as DatasetRow[]).some(row => Object.hasOwn(row, f)))) throw new Error('Select unique columns present in the dataset.');
  const o = v.options as Record<string, unknown>;
  const keys = v.kind === 'anomaly' ? ['trees', 'sampleSize', 'contamination', 'seed'] : ['support', 'confidence', 'lift', 'maxSize', 'bins'];
  if (!keys.every(k => typeof o[k] === 'number' && Number.isFinite(o[k]))) throw new Error('Options must be finite numbers.');
  if (v.kind === 'anomaly' && !['z-score', 'min-max', 'none'].includes(String(v.normalization))) throw new Error('Invalid normalization.');
  if (v.kind !== 'anomaly' && v.kind !== 'association') throw new Error('Unknown task.');
  return v as unknown as AnalysisTask;
}
