import Papa from 'papaparse';
import { numericValue } from './analysisPresentation';
import {
  DatasetRow,
  DataValue,
  MIN_NUMERIC_FEATURES,
  ParsedDataset,
  NormalizationMethod,
} from '../types';

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 10_000;
export const MAX_CSV_COLUMNS = 128;

function isIdHeader(header: string) {
  const name = header.toLowerCase();
  return name === 'id' || name.endsWith('_id') || name === 'index';
}

const labelHeaders = new Set(['diagnosis', 'target', 'label', 'class', 'channel', 'category', 'species', 'outcome']);
const decimal = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function parseCell(value: string | undefined, header: string): DataValue {
  if (value === undefined || !value.trim()) return null;
  if (isIdHeader(header) || labelHeaders.has(header.toLowerCase())) return value;
  const trimmed = value.trim();
  if (trimmed === 'true' || trimmed === 'TRUE') return true;
  if (trimmed === 'false' || trimmed === 'FALSE') return false;
  const number = Number(trimmed);
  return decimal.test(trimmed) && Math.abs(number) < 2 ** 53 ? number : value;
}

export function parseCSVString(csvContent: string, fileName: string = 'Uploaded Dataset'): ParsedDataset {
  if (new TextEncoder().encode(csvContent).byteLength > MAX_CSV_BYTES) {
    throw new Error('The CSV exceeds the 5 MiB file limit.');
  }
  if (!csvContent.trim()) {
    throw new Error('The CSV file is empty.');
  }

  const result = Papa.parse<Record<string, string>>(csvContent.replace(/^\uFEFF/, ''), {
    header: true,
    transformHeader: (header) => header.trim(),
    skipEmptyLines: true,
    preview: MAX_CSV_ROWS + 1,
  });

  const fields = result.meta.fields ?? [];
  if (result.data.length > MAX_CSV_ROWS || fields.length > MAX_CSV_COLUMNS) {
    throw new Error(`The CSV limit is ${MAX_CSV_ROWS} rows and ${MAX_CSV_COLUMNS} columns.`);
  }
  if (result.meta.renamedHeaders && Object.keys(result.meta.renamedHeaders).length) {
    throw new Error('The CSV contains duplicate column names. Give each column a unique name.');
  }
  // WDBC has an unused delimiter at the end of the header.
  const trailingPadding = fields.at(-1) === '' && !fields.slice(0, -1).includes('')
    && result.data.every((row) => row[''] == null || row[''] === '');
  const structuralError = result.errors.find((error) => !(error.code === 'TooFewFields' && trailingPadding
    && error.row !== undefined && Object.keys(result.data[error.row] ?? {}).length === fields.length - 1));
  if (structuralError) {
    const row = structuralError.row === undefined ? '' : ` on row ${structuralError.row + 1}`;
    throw new Error(`Invalid CSV${row}: ${structuralError.message}`);
  }

  const headers = trailingPadding ? fields.slice(0, -1) : fields;
  if (headers.length < MIN_NUMERIC_FEATURES || headers.some((header) =>
    !header || header === '__parsed_extra' || Object.hasOwn(Object.prototype, header))) {
    throw new Error(`The CSV needs valid column names and at least ${MIN_NUMERIC_FEATURES} data columns.`);
  }
  const rawRows: DatasetRow[] = result.data.map((row) => Object.fromEntries(
    headers.map(key => [key, parseCell(row[key], key)]),
  ));
  if (rawRows.length < 2) {
    throw new Error('The CSV needs a header and at least two data rows.');
  }
  // Heuristic detection for ID, Label, and Numerical Features
  let idColumn: string | null = null;
  let labelColumn = headers.find(header => labelHeaders.has(header.toLowerCase())) ?? null;
  const featureColumns: string[] = [];

  for (const col of headers) {
    // Check if ID column
    if (!idColumn && isIdHeader(col)) {
      idColumn = col;
      continue;
    }

    // Check data types of values in this column
    let numCount = 0;
    let validCount = 0;
    const uniqueValues = new Set<DataValue>();

    for (let i = 0; i < rawRows.length; i++) {
      const val = rawRows[i][col];
      if (val !== undefined && val !== null && val !== '') {
        validCount++;
        uniqueValues.add(val);
        if (typeof val === 'number' && !isNaN(val)) {
          numCount++;
        }
      }
    }

    const isNumeric = validCount > 0 && (numCount / validCount >= 0.85);

    if (col === labelColumn) continue;
    if (!isNumeric && uniqueValues.size <= 30 && !labelColumn) {
      // Categorical with few classes -> candidate for label
      labelColumn = col;
    } else if (isNumeric) {
      // Only treat as numerical feature if it's not ID or single-constant
      if (uniqueValues.size > 1) {
        featureColumns.push(col);
      }
    }
  }

  if (featureColumns.length < MIN_NUMERIC_FEATURES) {
    throw new Error(
      `Found only ${featureColumns.length} valid numeric features. At least ${MIN_NUMERIC_FEATURES} numeric columns are needed. Check the delimiter, header, and column values.`
    );
  }

  return {
    name: fileName,
    totalRows: rawRows.length,
    headers,
    idColumn,
    labelColumn,
    featureColumns,
    rawRows,
  };
}

export function extractFeatureMatrix(
  rows: DatasetRow[],
  featureColumns: string[],
  normalization: NormalizationMethod
): number[][] {
  const n = rows.length;
  const d = featureColumns.length;

  if (d === 0) return [];

  // 1. Build raw matrix and compute column statistics for imputation
  const matrix: number[][] = [];
  const colSums = new Float64Array(d);
  const colValidCounts = new Int32Array(d);

  for (let i = 0; i < n; i++) {
    const row = rows[i];
    const rowVec: number[] = new Array(d);
    for (let j = 0; j < d; j++) {
      const val = numericValue(row[featureColumns[j]]);
      rowVec[j] = val ?? NaN;
      if (val !== null) {
        colSums[j] += val;
        colValidCounts[j]++;
      }
    }
    matrix.push(rowVec);
  }

  // Calculate means for imputation
  const colMeans = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    colMeans[j] = colValidCounts[j] > 0 ? colSums[j] / colValidCounts[j] : 0;
  }

  // Impute missing values
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      if (Number.isNaN(matrix[i][j])) {
        matrix[i][j] = colMeans[j];
      }
    }
  }

  // 2. Normalization
  if (normalization === 'none') {
    return matrix;
  }

  if (normalization === 'z-score') {
    // Compute standard deviation
    const colStd = new Float64Array(d);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < d; j++) {
        const diff = matrix[i][j] - colMeans[j];
        colStd[j] += diff * diff;
      }
    }
    for (let j = 0; j < d; j++) {
      colStd[j] = Math.sqrt(colStd[j] / (n > 1 ? n - 1 : 1));
      if (colStd[j] === 0) colStd[j] = 1; // Avoid divide by zero
    }

    // Standardize
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < d; j++) {
        matrix[i][j] = (matrix[i][j] - colMeans[j]) / colStd[j];
      }
    }
    return matrix;
  }

  if (normalization === 'min-max') {
    const colMin = new Float64Array(d).fill(Infinity);
    const colMax = new Float64Array(d).fill(-Infinity);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < d; j++) {
        const v = matrix[i][j];
        if (v < colMin[j]) colMin[j] = v;
        if (v > colMax[j]) colMax[j] = v;
      }
    }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < d; j++) {
        const range = colMax[j] - colMin[j];
        matrix[i][j] = range === 0 ? 0 : (matrix[i][j] - colMin[j]) / range;
      }
    }
    return matrix;
  }

  return matrix;
}
