import Papa from 'papaparse';
import {
  DatasetRow,
  DataValue,
  MIN_NUMERIC_FEATURES,
  ParsedDataset,
  NormalizationMethod,
} from '../types';

export function parseCSVString(csvContent: string, fileName: string = 'Uploaded Dataset'): ParsedDataset {
  if (!csvContent.trim()) {
    throw new Error('The CSV file is empty.');
  }

  const result = Papa.parse<Record<string, unknown>>(csvContent.replace(/^\uFEFF/, '').trim(), {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const structuralError = result.errors.find((error) => error.code !== 'TooFewFields');
  if (structuralError) {
    const row = structuralError.row === undefined ? '' : ` on row ${structuralError.row + 1}`;
    throw new Error(`Invalid CSV${row}: ${structuralError.message}`);
  }

  const rawRows: DatasetRow[] = result.data.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]): [string, DataValue] => [
        key.trim(),
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? value
          : null,
      ])
    )
  );
  if (rawRows.length < 2) {
    throw new Error('The CSV needs a header and at least two data rows.');
  }

  // Ignore an unnamed padding column only when it contains no data (e.g. WDBC).
  // An unnamed column with a value must still fail header validation below.
  for (const header of Object.keys(rawRows[0])) {
    if (!header.trim() && rawRows.every((row) => row[header] == null || row[header] === '')) {
      rawRows.forEach((row) => { delete row[header]; });
    }
  }

  const headers = Object.keys(rawRows[0]).map(h => h.trim());
  if (headers.length < MIN_NUMERIC_FEATURES || headers.some((header) => !header)) {
    throw new Error(`The CSV needs valid column names and at least ${MIN_NUMERIC_FEATURES} data columns.`);
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('The CSV contains duplicate column names. Give each column a unique name.');
  }

  return describeDatasetRows(rawRows, headers, fileName);
}

export function isDatasetIdColumn(column: string): boolean {
  const name = column.toLowerCase();
  return name === 'id' || name.endsWith('_id') || name === 'index';
}

export function describeDatasetRows(rawRows: DatasetRow[], headers: string[], name: string): ParsedDataset {
  // Heuristic detection for ID, Label, and Numerical Features
  let idColumn: string | null = null;
  let labelColumn: string | null = null;
  const featureColumns: string[] = [];

  for (const col of headers) {
    const lowerCol = col.toLowerCase();
    
    // Check if ID column
    if (!idColumn && isDatasetIdColumn(col)) {
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

    // If explicit label naming
    const isLikelyLabel = (
      lowerCol === 'diagnosis' ||
      lowerCol === 'target' ||
      lowerCol === 'label' ||
      lowerCol === 'class' ||
      lowerCol === 'category' ||
      lowerCol === 'species' ||
      lowerCol === 'outcome'
    );

    if (isLikelyLabel && !labelColumn) {
      labelColumn = col;
    } else if (!isNumeric && uniqueValues.size <= 30 && !labelColumn) {
      // Categorical with few classes -> candidate for label
      labelColumn = col;
    } else if (isNumeric) {
      // Only treat as numerical feature if it's not ID or single-constant
      if (uniqueValues.size > 1) {
        featureColumns.push(col);
      }
    }
  }

  // Fallback: If no label found, but there is a column with <= 10 unique values, use it as label
  if (!labelColumn) {
    for (const col of headers) {
      if (col === idColumn) continue;
      const values = new Set(rawRows.map(r => r[col]));
      if (values.size >= 2 && values.size <= 10) {
        labelColumn = col;
        // remove from features if it was there
        const idx = featureColumns.indexOf(col);
        if (idx >= 0) featureColumns.splice(idx, 1);
        break;
      }
    }
  }

  if (featureColumns.length < MIN_NUMERIC_FEATURES) {
    throw new Error(
      `Found only ${featureColumns.length} valid numeric features. At least ${MIN_NUMERIC_FEATURES} numeric columns are needed. Check the delimiter, header, and column values.`
    );
  }

  return {
    name,
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
      const val = Number(row[featureColumns[j]]);
      if (!isNaN(val) && isFinite(val)) {
        rowVec[j] = val;
        colSums[j] += val;
        colValidCounts[j]++;
      } else {
        rowVec[j] = 0; // Temporary placeholder
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
      const val = Number(rows[i][featureColumns[j]]);
      if (isNaN(val) || !isFinite(val)) {
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
