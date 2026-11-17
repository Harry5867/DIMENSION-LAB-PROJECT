import type { DataPoint } from '@dimension-lab/contracts';

export const MAX_STATIC_POINT_LABELS = 180;

function hasLabel(point: DataPoint): boolean {
  return point.label !== undefined && point.label !== null && String(point.label).trim().length > 0;
}

function matchesPoint(point: DataPoint, candidate: DataPoint): boolean {
  if (point.rowIndex !== undefined || candidate.rowIndex !== undefined) {
    return point.rowIndex !== undefined && point.rowIndex === candidate.rowIndex;
  }
  return point === candidate || (typeof point.id === typeof candidate.id && point.id === candidate.id);
}

export function visiblePointLabels(
  points: DataPoint[],
  hovered: DataPoint | null,
  selected: DataPoint | null,
): DataPoint[] {
  const labeled = points.filter(hasLabel);
  if (points.length <= MAX_STATIC_POINT_LABELS) return labeled;
  return labeled.filter(point => (hovered && matchesPoint(point, hovered)) || (selected && matchesPoint(point, selected)));
}
