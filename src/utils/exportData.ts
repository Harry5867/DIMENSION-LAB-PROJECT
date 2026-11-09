import Papa from 'papaparse';
import { DataPoint, DatasetRow, EvaluationMetrics, ParsedDataset } from '../types';
import { AnalysisSnapshot } from './exploration';

export function safeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 80) || 'dataset';
}

export function resultRows(dataset: ParsedDataset, points: DataPoint[], hasClusters: boolean): DatasetRow[] {
  const reserved = ['id', 'label_ground_truth', 'predicted_cluster', 'coord_x_3d', 'coord_y_3d', 'coord_z_3d', 'source_row', 'cluster_confidence'];
  const used = new Set(reserved);
  const mapping = new Map(dataset.headers.map(name => {
    let output = name;
    while (used.has(output)) output = 'source_' + output;
    used.add(output);
    return [name, output];
  }));
  return points.map(point => {
    const original = point.rowIndex === undefined ? point.originalFeatures : dataset.rawRows[point.rowIndex] ?? {};
    const row: DatasetRow = {};
    mapping.forEach((output, input) => { row[output] = original[input] ?? null; });
    return { ...row, id: point.id, source_row: point.rowIndex === undefined ? null : point.rowIndex + 1,
      label_ground_truth: point.label ?? null, predicted_cluster: hasClusters ? (point.cluster === -1 ? 'Noise' : point.cluster) : null,
      cluster_confidence: point.clusterConfidence ?? null, coord_x_3d: point.x, coord_y_3d: point.y, coord_z_3d: point.z };
  });
}

export function csvText(rows: DatasetRow[], columns?: string[]): string {
  return '\uFEFF' + Papa.unparse(rows, { escapeFormulae: true, ...(columns ? { columns } : {}) });
}

export function analysisReport(dataset: ParsedDataset, points: DataPoint[], run: AnalysisSnapshot, metrics: EvaluationMetrics) {
  return { formatVersion: 1, exportedAt: new Date().toISOString(), dataset: { id: run.datasetId, name: dataset.name,
    sourceRows: dataset.totalRows, resultRows: points.length }, configuration: run, metrics,
    clusteringSpace: '3D embedding', scope: 'Complete current result; cluster focus does not filter exports',
    retainedSourceRows: points.map(point => point.rowIndex === undefined ? null : point.rowIndex + 1) };
}

export function downloadText(text: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor);
  anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
