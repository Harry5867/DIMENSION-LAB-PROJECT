export const MIN_NUMERIC_FEATURES = 3;
export type DataValue = string | number | boolean | null;
export type DatasetRow = Record<string, DataValue>;

export interface DatasetDocument {
  id: string;
  name: string;
  filename: string;
  totalRows: number;
  features: string[];
  labelColumn: string | null;
  idColumn: string | null;
  rawRows: DatasetRow[];
  createdAt: string;
}

export interface DatasetSummary {
  id: string;
  name: string;
  filename: string;
  total_rows: number;
  features_count?: number;
  label_column: string | null;
  id_column: string | null;
  created_at: string;
  is_preloaded?: boolean;
  is_local?: boolean;
}

export interface ParsedDataset {
  id?: string;
  name: string;
  totalRows: number;
  headers: string[];
  idColumn: string | null;
  labelColumn: string | null;
  featureColumns: string[];
  rawRows: DatasetRow[];
}
