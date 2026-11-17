import { parseAnalysisTask, type AnalysisTask, type AnalysisTaskResult } from '@dimension-lab/algorithms/analysisTasks';
import { isRecord } from '../../shared/api/typeGuards';

type AnomalyResult = Extract<AnalysisTaskResult, { kind: 'anomaly' }>;
type SavedAnalysisResult = Exclude<AnalysisTaskResult, AnomalyResult>
  | (Omit<AnomalyResult, 'preprocessing'> & Partial<Pick<AnomalyResult, 'preprocessing'>>);

export interface SavedRun {
  dataset: string;
  createdAt: string;
  task: AnalysisTask;
  result: SavedAnalysisResult;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isScore = (value: unknown): value is number => isFiniteNumber(value) && value >= 0 && value <= 1;
const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

export function isAnalysisResult(result: unknown, task: AnalysisTask): result is SavedAnalysisResult {
  if (!isRecord(result) || result.kind !== task.kind) return false;
  const rowCount = task.rows.length;
  if (task.kind === 'anomaly') {
    return isScore(result.threshold)
      && Array.isArray(result.scores) && result.scores.length === rowCount && result.scores.every(isScore)
      && Array.isArray(result.anomalies) && result.anomalies.length === rowCount
      && result.anomalies.every(flag => typeof flag === 'boolean')
      && (result.preprocessing === undefined || (Array.isArray(result.preprocessing)
        && result.preprocessing.every((column: unknown) => isRecord(column) && typeof column.feature === 'string'
          && isFiniteNumber(column.missing) && isFiniteNumber(column.mean))));
  }
  return isFiniteNumber(result.frequentItemsets) && isFiniteNumber(result.candidates) && typeof result.truncated === 'boolean'
    && Array.isArray(result.transactions) && result.transactions.length === rowCount && result.transactions.every(isStringList)
    && Array.isArray(result.binning) && result.binning.every((bin: unknown) => isRecord(bin)
      && typeof bin.feature === 'string' && isFiniteNumber(bin.bins)
      && (bin.range === null || (isRecord(bin.range) && isFiniteNumber(bin.range.min) && isFiniteNumber(bin.range.max))))
    && Array.isArray(result.rules) && result.rules.every((rule: unknown) => isRecord(rule)
      && isStringList(rule.antecedent) && isStringList(rule.consequent)
      && isScore(rule.support) && isScore(rule.confidence) && isFiniteNumber(rule.lift) && isFiniteNumber(rule.count));
}

export function readSavedAnalysisRuns(value: unknown): SavedRun[] {
  if (!Array.isArray(value)) return [];
  const entries: unknown[] = value;
  const runs: SavedRun[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.dataset !== 'string' || typeof entry.createdAt !== 'string') continue;
    try {
      const task = parseAnalysisTask(entry.task);
      if (!isAnalysisResult(entry.result, task)) continue;
      runs.push({ dataset: entry.dataset, createdAt: entry.createdAt, task, result: entry.result });
      if (runs.length === 5) break;
    } catch { /* Skip invalid saved configurations. */ }
  }
  return runs;
}
