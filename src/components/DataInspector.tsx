import { useAppLanguage } from "./WelcomeLanguage";
import React, { useState } from 'react';
import { DataPoint } from '../types';
import { X, Search, FileText, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';

interface DataInspectorProps {
  embedded?: boolean;
  hasClustering?: boolean;
  point: DataPoint | null;
  onClose: () => void;
  onDeletePoint?: (pointId: string | number | boolean, rowIndex?: number) => void;
  theme?: 'dark' | 'light';
}

export const DataInspector: React.FC<DataInspectorProps> = ({ point, onClose, onDeletePoint, embedded = false, hasClustering = true }) => {
  const { tr } = useAppLanguage();
  const [searchTerm, setSearchTerm] = useState('');

  if (!point) return null;

  const isOutlierPoint = point.isOutlier || point.cluster === -1;

  const features = Object.entries(point.originalFeatures).filter(([key]) =>
    !key.startsWith('__') && key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={`${embedded ? 'point-inspector-inline' : 'absolute top-4 right-16 z-30 w-84 max-h-[calc(100%-2rem)] shadow-2xl'} flex flex-col border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-panel)] text-[var(--text-main)] overflow-hidden text-xs`}>
      {/* Header */}
      <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-interactive)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-[var(--accent-primary)]" />
          <span className="font-semibold text-xs text-[var(--text-main)]">
            {tr("Point ID")} {String(point.id)}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr("Close point details")}
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-subtle)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Outlier Alert Banner & Instant Action */}
      {isOutlierPoint && (
        <div className="p-2.5 bg-[var(--danger-bg)] border-b border-[var(--danger-border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--danger-text)]">
            <AlertTriangle size={15} className="shrink-0 animate-pulse text-[#ef4444]" />
            <span>{tr("Outlier")}</span>
          </div>
          {onDeletePoint && (
            <button
              type="button"
              onClick={() => onDeletePoint(point.id, point.rowIndex)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#ef4444] hover:bg-[#dc2626] text-white text-[10px] font-bold transition-all shadow-sm active:scale-95"
              title={tr("Remove this outlier from the 3D view")}
            >
              <Trash2 size={11} />
              <span>{tr("Remove point")}</span>
            </button>
          )}
        </div>
      )}

      {point.anomalyScore !== undefined && <p className="p-2.5">{tr("Isolation Forest score:")} <strong>{point.anomalyScore.toFixed(4)}</strong> · {point.isOutlier ? tr("Anomaly") : tr("Normal")}</p>}
      {point.analysisMatch !== undefined && <p className="p-2.5">{tr("Association rule:")} <strong>{point.analysisMatch ? tr("Matches selected condition") : tr("Does not match")}</strong></p>}
      {/* Summary Badges */}
      <div className="p-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-main)] flex flex-wrap gap-1.5 text-[11px]">
        {point.label !== undefined && (
          <span className="px-2 py-0.5 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[var(--text-main)]">
            {tr("Label:")} <strong className="text-[var(--accent-primary)]">{String(point.label)}</strong>
          </span>
        )}
        <span className="px-2 py-0.5 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[var(--text-main)]">
          {tr("Cluster:")} <strong className="text-[var(--success-text)]">{!hasClustering ? tr("Not clustered") : point.cluster === -1 ? tr("Noise (−1)") : point.cluster}</strong>
        </span>
        <span className="px-2 py-0.5 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] font-mono text-[var(--text-muted)]">
          3D: ({point.x.toFixed(2)}, {point.y.toFixed(2)}, {point.z.toFixed(2)})
        </span>
      </div>

      {/* Search Filter */}
      <div className="p-2 border-b border-[var(--border-subtle)]">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder={tr("Search features…")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] pl-7 pr-2 py-1 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
      </div>

      {/* Feature Attributes Table */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar max-h-72">
        {features.length === 0 ? (
          <div className="text-center py-4 text-[var(--text-muted)] italic">{tr("No matching features")}</div>
        ) : (
          features.map(([key, val]) => (
            <div
              key={key}
              className="flex items-center justify-between px-2 py-1 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)]/50 hover:border-[var(--border-subtle)]"
            >
              <span className="font-mono text-[11px] text-[var(--text-muted)] truncate mr-2" title={key}>
                {key}
              </span>
              <span className="font-mono text-[11px] font-medium text-[var(--accent-primary)]">
                {val ?? '—'}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Action Footer */}
      <div className="p-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-interactive)] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-main)] text-[11px] font-medium transition-colors"
        >
          <CheckCircle size={12} className="text-[var(--success-text)]" />
          <span>{tr("Keep point")}</span>
        </button>
        {onDeletePoint && !isOutlierPoint && (
          <button
            type="button"
            onClick={() => onDeletePoint(point.id, point.rowIndex)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[var(--danger-bg)] hover:bg-[#3d242a] border border-[var(--danger-border)] text-[var(--danger-text)] text-[11px] font-medium transition-colors"
            title={tr("Remove this point")}
          >
            <Trash2 size={12} />
            <span>{tr("Remove")}</span>
          </button>
        )}
      </div>
    </div>
  );
};
