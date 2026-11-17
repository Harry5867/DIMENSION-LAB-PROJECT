import { MAX_CSV_COLUMNS, MAX_CSV_ROWS } from '@dimension-lab/algorithms/dataParser';
import { MIN_NUMERIC_FEATURES, type DatasetDocument, type DatasetRow } from '@dimension-lab/contracts';
import { BadRequestError } from '../http/errors';
import { isRecord } from '../http/validation';

export const DATA_QUALITY_THRESHOLDS = {
  recommendedMissingRate: 0.05,
  outlierIqrMultiplier: 1.5,
} as const;

export function assertDatasetBusinessRules(dataset: DatasetDocument, selectedFeatures: unknown = dataset.features): asserts selectedFeatures is string[] {
  if (!Array.isArray(dataset.rawRows) || dataset.rawRows.length < 2 || dataset.rawRows.length > MAX_CSV_ROWS
    || dataset.totalRows !== dataset.rawRows.length) {
    throw new BadRequestError(`A dataset must contain 2–${MAX_CSV_ROWS} rows, and its row count must match its records.`);
  }
  if (!Array.isArray(dataset.features) || dataset.features.length < MIN_NUMERIC_FEATURES || dataset.features.length > MAX_CSV_COLUMNS
    || dataset.features.some(feature => typeof feature !== 'string' || !feature.trim())
    || new Set(dataset.features).size !== dataset.features.length) {
    throw new BadRequestError(`A dataset must contain ${MIN_NUMERIC_FEATURES}–${MAX_CSV_COLUMNS} unique numeric feature columns.`);
  }
  if (!Array.isArray(selectedFeatures) || selectedFeatures.length < MIN_NUMERIC_FEATURES
    || selectedFeatures.some(feature => typeof feature !== 'string' || !dataset.features.includes(feature))
    || new Set(selectedFeatures).size !== selectedFeatures.length) {
    throw new BadRequestError(`Select at least ${MIN_NUMERIC_FEATURES} unique numeric feature columns from this dataset version.`);
  }
  if (dataset.labelColumn !== null && dataset.features.includes(dataset.labelColumn)
    || dataset.idColumn !== null && dataset.features.includes(dataset.idColumn)
    || dataset.labelColumn !== null && dataset.labelColumn === dataset.idColumn) {
    throw new BadRequestError('Dataset feature, label, and identifier columns must be distinct.');
  }

  for (const feature of selectedFeatures) {
    let usableValues = 0;
    for (let index = 0; index < dataset.rawRows.length; index++) {
      const row: unknown = dataset.rawRows[index];
      if (!isRecord(row)) throw new BadRequestError(`Row ${index + 1} is not a valid data record.`);
      const value = row[feature];
      if (value === null || value === undefined || value === '') continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestError(`Feature "${feature}" contains a non-numeric value at row ${index + 1}.`);
      }
      usableValues++;
    }
    if (usableValues === 0) throw new BadRequestError(`Feature "${feature}" has no usable numeric values.`);
  }
}

interface QualityRecommendation {
  code: string;
  severity: 'info' | 'review';
  measuredValue: number;
  suggestedThreshold: string;
  recommendation: string;
  rationale: string;
}

export function inspectDatasetQuality(dataset: DatasetDocument) {
  assertDatasetBusinessRules(dataset);
  const rows = dataset.rawRows as DatasetRow[];
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const row of rows) {
    const key = JSON.stringify(columns.map(column => row[column] ?? null));
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  let missingValues = 0;
  const recommendations: QualityRecommendation[] = [];
  const columnResults = columns.map(name => {
    const values = rows.map(row => row[name]);
    const present = values.filter(value => value !== null && value !== undefined && value !== '');
    const missingCount = values.length - present.length;
    const missingRate = values.length ? missingCount / values.length : 0;
    missingValues += missingCount;
    const kinds = new Set(present.map(value => typeof value));
    if (kinds.size > 1) {
      recommendations.push({
        code: 'MIXED_TYPES',
        severity: 'review',
        measuredValue: kinds.size,
        suggestedThreshold: 'One consistent non-missing value type per column',
        recommendation: `Review the mixed value types in "${name}" and decide whether it is numeric, categorical, or a label.`,
        rationale: 'Mixed types can cause values to be misclassified or silently excluded from numerical analysis.',
      });
    }
    const numeric = present.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const sorted = [...numeric].sort((a, b) => a - b);
    const quantile = (fraction: number) => sorted.length
      ? sorted[Math.floor((sorted.length - 1) * fraction)] : null;
    const q1 = quantile(0.25), q3 = quantile(0.75);
    const spread = q1 === null || q3 === null ? 0 : q3 - q1;
    const outliers = q1 === null || q3 === null ? 0
      : numeric.filter(value => value < q1 - DATA_QUALITY_THRESHOLDS.outlierIqrMultiplier * spread
        || value > q3 + DATA_QUALITY_THRESHOLDS.outlierIqrMultiplier * spread).length;
    const distinctCount = new Set(present.map(value => JSON.stringify(value))).size;

    if (missingCount > 0) {
      const aboveSuggestedRate = missingRate > DATA_QUALITY_THRESHOLDS.recommendedMissingRate;
      recommendations.push({
        code: 'MISSING_VALUES',
        severity: aboveSuggestedRate ? 'review' : 'info',
        measuredValue: missingRate,
        suggestedThreshold: `At most ${DATA_QUALITY_THRESHOLDS.recommendedMissingRate * 100}% missing values per feature`,
        recommendation: aboveSuggestedRate
          ? `Review "${name}" for removal or domain-approved imputation before analysis.`
          : `Consider imputing missing values in "${name}" before analysis.`,
        rationale: 'Mean imputation can shrink variance and bias PCA or distance-based clustering; higher missing rates increase that risk. The 5% value is a conservative review trigger, not a universal scientific limit.',
      });
    }
    if (dataset.features.includes(name) && distinctCount < 2) {
      recommendations.push({
        code: 'CONSTANT_FEATURE',
        severity: 'review',
        measuredValue: distinctCount,
        suggestedThreshold: 'At least 2 distinct observed values per selected feature',
        recommendation: `Consider excluding "${name}" from analysis.`,
        rationale: 'A constant feature adds no information for dimensionality reduction or clustering.',
      });
    }
    if (outliers > 0) {
      recommendations.push({
        code: 'POTENTIAL_OUTLIERS',
        severity: 'review',
        measuredValue: outliers / Math.max(1, numeric.length),
        suggestedThreshold: `Review values outside Q1 − ${DATA_QUALITY_THRESHOLDS.outlierIqrMultiplier}×IQR or Q3 + ${DATA_QUALITY_THRESHOLDS.outlierIqrMultiplier}×IQR`,
        recommendation: `Review ${outliers} potential outlier(s) in "${name}"; do not remove them automatically.`,
        rationale: 'The 1.5×IQR fence is a common exploratory screen. Outliers may be valid observations and need domain context before removal.',
      });
    }

    return {
      name,
      inferredType: kinds.size > 1 ? 'mixed' : kinds.values().next().value ?? 'empty',
      missingCount,
      missingRate,
      distinctCount,
      ...(numeric.length > 0 && {
        min: Math.min(...numeric),
        max: Math.max(...numeric),
        mean: numeric.reduce((sum, value) => sum + value, 0) / numeric.length,
        outlierCount: outliers,
      }),
    };
  });

  const duplicateRate = duplicateRows / rows.length;
  if (duplicateRows > 0) {
    recommendations.push({
      code: 'DUPLICATE_ROWS',
      severity: 'review',
      measuredValue: duplicateRate,
      suggestedThreshold: 'Target 0% duplicates when each row is intended to be a unique observation',
      recommendation: `Review ${duplicateRows} duplicate row(s); keep them if repeated observations are meaningful.`,
      rationale: 'Duplicate observations receive extra weight in PCA and clustering, but repetition can be intentional in some datasets.',
    });
  }

  const totalCells = rows.length * columns.length;
  return {
    status: recommendations.some(item => item.severity === 'review') ? 'review' : 'passed',
    totalRows: rows.length,
    totalColumns: columns.length,
    missingValues,
    missingValueRate: totalCells ? missingValues / totalCells : 0,
    duplicateRows,
    duplicateRate,
    columns: columnResults,
    recommendations,
  };
}
