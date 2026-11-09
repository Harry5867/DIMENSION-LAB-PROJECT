import { useAppLanguage } from "./WelcomeLanguage";
import React, { useState } from 'react';
import { EvaluationMetrics, ReductionMethod } from '../types';
import { Activity, Database, Save, ChevronUp, ChevronDown, CheckCircle2, Clock, Layers, HelpCircle, RotateCcw, Trash2, Filter, BarChart3, Target } from 'lucide-react';
import { DataPoint } from '../types';

const CLUSTER_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
];

interface MetricsPanelProps {
  layout?: 'docked' | 'sidebar';
  resultsDirty?: boolean;
  previousResult?: boolean;
  runConfiguration?: React.ReactNode;
  focusedCluster?: number | null;
  onFocusCluster?: (cluster: number | null) => void;
  metrics: EvaluationMetrics;
  reductionMethod: ReductionMethod;
  clusteringMethod?: string;
  datasetName?: string;
  totalRows?: number;
  hasGroundTruth: boolean;
  hasResults: boolean;
  isComputing?: boolean;
  executionTimeMs?: number | null;
  onSaveExperiment?: () => void;
  onOpenHistory?: () => void;
  isSaving?: boolean;
  theme?: 'dark' | 'light';
  normalization?: string;
  onPruneOutliers?: () => void;
  onRestorePoints?: () => void;
  isPruned?: boolean;
  prunedCount?: number;
  dataPoints?: DataPoint[];
  onSelectPoint?: (point: DataPoint | null) => void;
  onDeletePoint?: (pointId: string | number | boolean, rowIndex?: number) => void;
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  layout = 'docked',
  resultsDirty = false,
  previousResult = resultsDirty,
  runConfiguration,
  focusedCluster = null,
  onFocusCluster,
  metrics,
  reductionMethod,
  clusteringMethod = 'K-Means',
  datasetName = 'No dataset',
  totalRows = 0,
  hasGroundTruth,
  hasResults,
  isComputing = false,
  executionTimeMs = null,
  onSaveExperiment,
  onOpenHistory,
  isSaving = false,
  normalization = 'standard',
  onPruneOutliers,
  onRestorePoints,
  isPruned = false,
  prunedCount = 0,
  dataPoints = [],
  onSelectPoint,
  onDeletePoint,
}) => {
  const { tr } = useAppLanguage();
  const [isExpanded, setIsExpanded] = useState(false);

  const outliers = React.useMemo(() => {
    return dataPoints.filter((p) => p.isOutlier || p.cluster === -1);
  }, [dataPoints]);

  const {
    silhouetteScore = null,
    adjustedRandIndex = null,
    explainedVariance,
    totalVarianceExplained,
    clusterCounts = {},
    noiseCount = 0,
  } = metrics || {};

  // Process status descriptor
  const statusBadge = previousResult ? (
    <span className="result-stale">{tr("Previous result")}</span>
  ) : isComputing ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--bg-interactive)] text-[var(--accent-primary)] border border-[var(--border-subtle)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-ping" />
      {tr("Analyzing…")}
    </span>
  ) : hasResults ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]">
      <CheckCircle2 size={12} />
      {tr("Complete")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--bg-interactive)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
      <Clock size={12} />
      {tr("Ready")}
    </span>
  );

  const displayTime = metrics.executionTimeMs ?? executionTimeMs;

  if (layout === 'sidebar') {
    const score = (value: number | null) => value !== null && Number.isFinite(value) ? value.toFixed(3) : '—';
    const total = Object.values(clusterCounts).reduce((sum, count) => sum + count, 0) + noiseCount;
    return (
      <div className="insights-panel">
        <div className="insights-heading"><span className="workspace-eyebrow">{tr("ANALYSIS METRICS")}</span>{statusBadge}</div>
        <section className="insights-score"><span>{tr("Silhouette score")}</span><div><strong>{score(silhouetteScore)}</strong><small>{silhouetteScore === null ? tr("NOT AVAILABLE") : tr("3D SPACE")}</small></div><div className="score-track"><span style={{ width: silhouetteScore === null || !Number.isFinite(silhouetteScore) ? '0%' : Math.max(0, Math.min(100, (silhouetteScore + 1) * 50)) + '%' }} /></div><div className="score-bounds"><span>−1.0</span><span>1.0</span></div></section>
        <dl className="insights-facts"><div><dt>{tr("Adjusted Rand Index")}</dt><dd>{hasGroundTruth ? score(adjustedRandIndex) : tr("No labels")}</dd></div><div><dt>{tr("Processing time")}</dt><dd>{displayTime == null ? '—' : (displayTime / 1000).toFixed(2) + ' s'}</dd></div><div><dt>{tr("Normalization")}</dt><dd>{normalization}</dd></div></dl>

        {runConfiguration}
        <section className="insights-clusters"><div className="insights-heading"><span className="workspace-eyebrow">{tr('CLUSTERS')}</span><span>{Object.keys(clusterCounts).length.toString().padStart(2, '0')}</span></div>{Object.entries(clusterCounts).map(([cluster, count]) => <button className="insights-cluster" key={cluster} aria-label={tr("Isolate cluster ") + cluster} aria-pressed={focusedCluster === Number(cluster)} onClick={() => onFocusCluster?.(Number(cluster))} disabled={isComputing || !onFocusCluster}><span className="cluster-dot" style={{ background: CLUSTER_COLORS[Number(cluster) % CLUSTER_COLORS.length] }} /><span>{tr("Cluster")} {cluster}</span><span>{count.toLocaleString('en-US')}</span><small>{total > 0 ? Math.round(count / total * 100) : 0}%</small></button>)}{noiseCount > 0 && <button className="insights-cluster" aria-label={tr("Isolate noise")} aria-pressed={focusedCluster === -1} onClick={() => onFocusCluster?.(-1)} disabled={isComputing || !onFocusCluster}><span className="cluster-dot" style={{ background: '#a18a7a' }} /><span>{tr("Noise")}</span><span>{noiseCount}</span></button>}{Object.keys(clusterCounts).length === 0 && <p className="insights-hint">{tr("Run clustering to see groups.")}</p>}</section>
        <p className="insights-hint">{focusedCluster === null ? tr("Select a cluster to isolate it.") : tr("Metrics and CSV cover all result points.")}</p>
        {focusedCluster !== null && <button className="focus-exit" onClick={() => onFocusCluster?.(null)}>{tr("← Show all points")}</button>}
        <details className="insights-more"><summary>{tr("More insights")}</summary>
        {reductionMethod === 'PCA' && explainedVariance && <section className="insights-variance"><p className="workspace-eyebrow">{tr("PCA VARIANCE")}</p>{explainedVariance.map((value, i) => <div key={i}><span>PC{i + 1}</span><progress max={1} value={value} aria-label={tr("Variance for PC") + (i + 1)} /><strong>{(value * 100).toFixed(1)}%</strong></div>)}</section>}
        <div className="insights-management"><button onClick={onSaveExperiment} disabled={!hasResults || isSaving || isComputing || resultsDirty}><Save size={13} />{isSaving ? tr("Saving…") : tr("Save experiment")}</button><button onClick={onOpenHistory}><Database size={13} />{tr("History")}</button></div>
        {hasResults && <div className="insights-management">{isPruned ? <button onClick={onRestorePoints} disabled={!onRestorePoints || isComputing}><RotateCcw size={13} />{tr("Restore (")}{prunedCount})</button> : <button onClick={onPruneOutliers} disabled={outliers.length === 0 || isComputing || !onPruneOutliers}><Filter size={13} />{tr("Filter outliers (")}{outliers.length})</button>}</div>}
        {outliers.length > 0 && <details className="insights-outliers"><summary>{tr("Outliers ·")} {outliers.length}</summary>{outliers.slice(0, 15).map((point, index) => <div key={index}><button onClick={() => onSelectPoint?.(point)} disabled={!onSelectPoint || isComputing}>ID {String(point.id)} ↗</button><button onClick={() => onDeletePoint?.(point.id, point.rowIndex)} disabled={isComputing || !onDeletePoint} aria-label={tr("Remove point ") + String(point.id)}><Trash2 size={12} /></button></div>)}</details>}
        </details>
      </div>
    );
  }

  return (
    <div className="w-full bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] text-[var(--text-main)] text-xs select-none">
      {/* 1. DOCKED SCIENTIFIC RESULTS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 min-h-[46px]">
        {/* Left Section: Dataset context & Pipeline Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 pr-3 border-r border-[var(--border-subtle)]">
            <Activity size={14} className="text-[var(--accent-primary)]" />
            <span className="font-semibold text-[11px] tracking-wider uppercase text-[var(--text-main)]">
              {tr("ANALYSIS RESULTS")}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <span className="text-[var(--text-main)] font-medium truncate max-w-[140px]" title={datasetName}>
              {datasetName}
            </span>
            <span className="text-[var(--border-subtle)]">|</span>
            <span className="font-mono text-[var(--text-muted)]">{totalRows.toLocaleString('en-US')} {tr("points")}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-[var(--bg-interactive)] text-[var(--accent-primary)] font-mono border border-[var(--border-subtle)]">
              {reductionMethod}
            </span>
            <span className="text-[var(--text-muted)]">+</span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--bg-interactive)] text-[var(--text-main)] font-mono border border-[var(--border-subtle)]">
              {clusteringMethod}
            </span>
          </div>

          {statusBadge}

          {displayTime !== null && displayTime !== undefined && displayTime > 0 && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-mono text-[var(--text-muted)]">
              <Clock size={11} className="text-[var(--text-muted)]" />
              {displayTime} ms
            </span>
          )}
        </div>

        {/* Center/Right Section: Key Metrics Display */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Silhouette Score Metric */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[11px]">
            <span className="text-[var(--text-muted)]">{tr('Silhouette:')}</span>
            {silhouetteScore !== null ? (
              <span className={`font-mono font-semibold ${silhouetteScore >= 0.5 ? 'text-[var(--success-text)]' : silhouetteScore >= 0.25 ? 'text-[#fbbf24]' : 'text-[var(--danger-text)]'}`}>
                {silhouetteScore.toFixed(3)}
              </span>
            ) : (
              <span className="text-[var(--text-muted)] italic text-[10px]" title={tr("Silhouette requires at least two clusters")}>
                {tr("Not clustered")}
              </span>
            )}
          </div>

          {/* Adjusted Rand Index Metric */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[11px]">
            <span className="text-[var(--text-muted)]">ARI:</span>
            {adjustedRandIndex !== null ? (
              <span className={`font-mono font-semibold ${adjustedRandIndex >= 0.6 ? 'text-[var(--success-text)]' : adjustedRandIndex >= 0.3 ? 'text-[#38bdf8]' : 'text-[var(--danger-text)]'}`}>
                {adjustedRandIndex.toFixed(3)}
              </span>
            ) : (
              <span className="text-[var(--text-muted)] italic text-[10px]" title={hasGroundTruth ? tr("Apply clustering to compare labels") : tr("This dataset has no ground-truth labels")}>
                {hasGroundTruth ? tr("Not clustered") : tr("No ground-truth labels")}
              </span>
            )}
          </div>

          {/* PCA Total Variance Explained */}
          {reductionMethod === 'PCA' && totalVarianceExplained !== undefined && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[11px]">
              <span className="text-[var(--text-muted)]">{tr("3D variance:")}</span>
              <span className="font-mono font-semibold text-[var(--accent-primary)]">
                {(totalVarianceExplained * 100).toFixed(1)}%
              </span>
            </div>
          )}

          
          {/* Outlier Pruning Button */}
          {hasResults && (
            <div className="flex items-center gap-1.5">
              {!isPruned && onPruneOutliers && ((metrics.outlierCount && metrics.outlierCount > 0) || (metrics.noiseCount && metrics.noiseCount > 0)) ? (
                <button
                  type="button"
                  onClick={onPruneOutliers}
                  title={tr("Hide outliers and noise in 3D")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--danger-bg)] hover:bg-[#3d242a] border border-[var(--danger-border)] text-[11px] font-medium text-[var(--danger-text)] transition-colors"
                >
                  <Trash2 size={12} />
                  <span>{tr("Filter outliers (")}{metrics.outlierCount || metrics.noiseCount})</span>
                </button>
              ) : isPruned && onRestorePoints ? (
                <button
                  type="button"
                  onClick={onRestorePoints}
                  title={tr("Restore all points")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--success-bg)] hover:bg-[#1f3b31] border border-[var(--success-border)] text-[11px] font-medium text-[var(--success-text)] transition-colors"
                >
                  <RotateCcw size={12} />
                  <span>{tr("Restore (")}{prunedCount})</span>
                </button>
              ) : null}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border-subtle)]">
            {onSaveExperiment && (
              <button
                type="button"
                onClick={onSaveExperiment}
                disabled={isSaving || !hasResults}
                title={hasResults ? tr("Save configuration and metrics") : tr("Run analysis before saving")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[11px] font-medium text-[var(--text-main)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save size={12} className="text-[var(--success-text)]" />
                <span>{isSaving ? tr("Saving…") : tr("Save experiment")}</span>
              </button>
            )}

            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                title={tr("Open saved experiments")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-main)] transition-colors"
              >
                <Database size={12} className="text-[var(--accent-primary)]" />
                <span className="hidden sm:inline">{tr("History")}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              title={isExpanded ? tr("Collapse details") : tr("Expand metrics")}
            >
              <span>{isExpanded ? tr("Collapse") : tr("Details")}</span>
              {isExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* 2. EXPANDED SCIENTIFIC DETAILS DRAWER */}
      {isExpanded && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-main)] p-4 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Silhouette Evaluation Card */}
            <div className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] mb-1.5">
                <span className="font-semibold uppercase tracking-wider">{tr("Silhouette score")}</span>
                <HelpCircle size={12} className="text-[var(--text-muted)]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-mono font-bold text-[var(--text-main)]">
                  {silhouetteScore !== null ? silhouetteScore.toFixed(4) : '—'}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{tr("[-1 to +1]")}</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
                {silhouetteScore !== null ? (
                  silhouetteScore > 0.5 ? tr("Clusters are well separated.") :
                  silhouetteScore > 0.25 ? tr("Clusters overlap slightly.") :
                  tr("Clusters overlap substantially or lack clear structure.")
                ) : tr("Run K-Means or DBSCAN with at least two clusters to calculate this score.")}
              </p>
            </div>

            {/* ARI Evaluation Card */}
            <div className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] mb-1.5">
                <span className="font-semibold uppercase tracking-wider">{tr("Adjusted Rand Index (ARI)")}</span>
                <HelpCircle size={12} className="text-[var(--text-muted)]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-mono font-bold text-[var(--text-main)]">
                  {adjustedRandIndex !== null ? adjustedRandIndex.toFixed(4) : '—'}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{tr("[-1 to +1]")}</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
                {hasGroundTruth && adjustedRandIndex !== null ? (
                  adjustedRandIndex > 0.7 ? tr("Strong agreement with ground-truth labels.") :
                  adjustedRandIndex > 0.3 ? tr("Moderate agreement with ground-truth labels.") :
                  tr("Clusters differ substantially from ground-truth labels.")
                ) : !hasGroundTruth ? (
                  'This dataset has no ground-truth labels for calculating ARI.'
                ) : (
                  'Apply clustering to compare clusters with ground-truth labels.'
                )}
              </p>
            </div>

            {/* PCA Variance or Cluster Count breakdown */}
            <div className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] mb-1.5">
                <span className="font-semibold uppercase tracking-wider">
                  {reductionMethod === 'PCA' ? tr("Principal component variance") : tr("Points per cluster")}
                </span>
                <Layers size={12} className="text-[var(--text-muted)]" />
              </div>

              {reductionMethod === 'PCA' && explainedVariance ? (
                <div>
                  <div className="flex items-center justify-between font-mono text-[11px] mb-2">
                    <span className="text-[var(--text-muted)]">{tr("Total 3D variance:")}</span>
                    <span className="text-[var(--accent-primary)] font-semibold">{((totalVarianceExplained || 0) * 100).toFixed(2)}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded bg-[var(--bg-interactive)] overflow-hidden flex mb-2">
                    <div style={{ width: `${(explainedVariance[0] * 100).toFixed(1)}%` }} className="bg-[var(--accent-primary)] h-full" title={`PC1: ${(explainedVariance[0] * 100).toFixed(1)}%`} />
                    <div style={{ width: `${(explainedVariance[1] * 100).toFixed(1)}%` }} className="bg-[#38bdf8] h-full" title={`PC2: ${(explainedVariance[1] * 100).toFixed(1)}%`} />
                    <div style={{ width: `${(explainedVariance[2] * 100).toFixed(1)}%` }} className="bg-[var(--success-text)] h-full" title={`PC3: ${(explainedVariance[2] * 100).toFixed(1)}%`} />
                  </div>
                  <div className="flex justify-between font-mono text-[10px] text-[var(--text-muted)]">
                    <span>PC1: {(explainedVariance[0] * 100).toFixed(1)}%</span>
                    <span>PC2: {(explainedVariance[1] * 100).toFixed(1)}%</span>
                    <span>PC3: {(explainedVariance[2] * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                    {Object.keys(clusterCounts).length > 0 ? (
                      Object.entries(clusterCounts).map(([cluster, count]) => (
                        <span key={cluster} className="px-2 py-0.5 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] font-mono text-[10px] text-[var(--text-main)]">
                          {tr("Cluster")} {cluster}: <strong className="text-[var(--accent-primary)]">{count}</strong>
                        </span>
                      ))
                    ) : (
                      <span className="text-[var(--text-muted)] italic text-[11px]">{tr("No clustering results")}</span>
                    )}
                    {noiseCount !== undefined && noiseCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-[var(--danger-bg)] border border-[var(--danger-border)] font-mono text-[10px] text-[var(--danger-text)]">
                        {tr("Noise:")} {noiseCount}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Pipeline & Outlier Management Card */}
            <div className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] mb-1.5">
                  <span className="font-semibold uppercase tracking-wider">{tr("Preprocessing and outliers")}</span>
                  <Filter size={12} className="text-[var(--accent-primary)]" />
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">{tr("Normalization:")}</span>
                    <span className="text-[var(--accent-primary)] uppercase">{normalization}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">{tr("3D space:")}</span>
                    <span className="text-[#38bdf8]">{reductionMethod} (XYZ)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">{tr("Outliers:")}</span>
                    <span className={(metrics.outlierCount || metrics.noiseCount) ? 'text-[var(--danger-text)] font-semibold' : 'text-[var(--success-text)]'}>
                      {metrics.outlierCount || metrics.noiseCount || 0} {tr("points")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)]">
                {!isPruned && onPruneOutliers && ((metrics.outlierCount && metrics.outlierCount > 0) || (metrics.noiseCount && metrics.noiseCount > 0)) ? (
                  <button
                    type="button"
                    onClick={onPruneOutliers}
                    className="w-full py-1.5 rounded bg-[var(--danger-bg)] hover:bg-[#3d242a] border border-[var(--danger-border)] text-[11px] text-[var(--danger-text)] flex items-center justify-center gap-1.5 transition-colors font-medium"
                  >
                    <Trash2 size={12} />
                    <span>{tr("Filter")} {metrics.outlierCount || metrics.noiseCount} {tr('outliers')}</span>
                  </button>
                ) : isPruned && onRestorePoints ? (
                  <button
                    type="button"
                    onClick={onRestorePoints}
                    className="w-full py-1.5 rounded bg-[var(--success-bg)] hover:bg-[#1f3b31] border border-[var(--success-border)] text-[11px] text-[var(--success-text)] flex items-center justify-center gap-1.5 transition-colors font-medium"
                  >
                    <RotateCcw size={12} />
                    <span>{tr("Restore original data (")}{prunedCount})</span>
                  </button>
                ) : (
                  <div className="text-[10px] text-[var(--text-muted)] text-center italic py-1">
                    {tr("No points to filter")}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* 3. INTERACTIVE VISUAL ANALYTICS & OUTLIER EXPLORER */}
          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
            {/* Visual Analytics Chart */}
            <div className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] mb-2 font-semibold uppercase tracking-wider">
                <span>{tr("Cluster distribution and variance")}</span>
                <BarChart3 size={13} className="text-[var(--accent-primary)]" />
              </div>

              {Object.keys(clusterCounts).length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-[var(--text-muted)]">{tr("Share of points per cluster:")}</div>
                  <div className="w-full h-3 rounded bg-[var(--bg-interactive)] overflow-hidden flex">
                    {Object.entries(clusterCounts).map(([cl, count]) => {
                      const pct = totalRows > 0 ? (count / totalRows) * 100 : 0;
                      const col = CLUSTER_COLORS[Number(cl) % CLUSTER_COLORS.length] || '#4E79A7';
                      return (
                        <div
                          key={cl}
                          style={{ width: `${pct}%`, backgroundColor: col }}
                          className="h-full transition-all"
                          title={`${tr('Cluster')} ${cl}: ${count} ${tr('points')} (${pct.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 font-mono text-[10px]">
                    {Object.entries(clusterCounts).map(([cl, count]) => {
                      const pct = totalRows > 0 ? (count / totalRows) * 100 : 0;
                      const col = CLUSTER_COLORS[Number(cl) % CLUSTER_COLORS.length] || '#4E79A7';
                      return (
                        <div key={cl} className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />
                          <span className="text-[var(--text-main)]">C{cl}:</span>
                          <span className="text-[var(--text-muted)]">{count} ({pct.toFixed(1)}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : reductionMethod === 'PCA' && explainedVariance ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-[var(--text-muted)]">{tr("Explained variance (scree plot):")}</div>
                  <div className="grid grid-cols-3 gap-2 text-center font-mono">
                    <div className="p-2 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">{tr("PC1 (X axis)")}</div>
                      <div className="text-sm font-bold text-[var(--accent-primary)]">{(explainedVariance[0] * 100).toFixed(1)}%</div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">{tr("PC2 (Y axis)")}</div>
                      <div className="text-sm font-bold text-[#38bdf8]">{(explainedVariance[1] * 100).toFixed(1)}%</div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)]">{tr("PC3 (Z axis)")}</div>
                      <div className="text-sm font-bold text-[var(--success-text)]">{(explainedVariance[2] * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-[var(--text-muted)] italic text-center py-4">
                  {tr("Run analysis to see the distribution.")}
                </div>
              )}
            </div>

            {/* Outlier Navigator Table */}
            <div className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] mb-2 font-semibold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Target size={13} className="text-[var(--danger-text)]" />
                  <span>{tr("Inspect outliers (")}{outliers.length} {tr("points)")}</span>
                </div>
                {outliers.length > 0 && onPruneOutliers && (
                  <button
                    type="button"
                    onClick={onPruneOutliers}
                    className="text-[10px] px-2 py-0.5 rounded bg-[var(--danger-bg)] hover:bg-[#3d242a] border border-[var(--danger-border)] text-[var(--danger-text)] font-medium"
                  >
                    {tr("Remove all outliers")}
                  </button>
                )}
              </div>

              {outliers.length === 0 ? (
                <div className="text-[11px] text-[var(--success-text)] py-4 text-center font-medium">
                  {tr("No outliers found")}
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1">
                  {outliers.slice(0, 15).map((pt) => (
                    <div
                      key={String(pt.id)}
                      className="flex items-center justify-between px-2 py-1 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)]/60 hover:border-[var(--accent-primary)] text-[11px] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[var(--danger-text)]">ID {String(pt.id)}</span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                          ({pt.x.toFixed(1)}, {pt.y.toFixed(1)}, {pt.z.toFixed(1)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {onSelectPoint && (
                          <button
                            type="button"
                            onClick={() => onSelectPoint(pt)}
                            className="px-1.5 py-0.5 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[10px] text-[#38bdf8] flex items-center gap-1"
                            title={tr("Focus camera on this point")}
                          >
                            <Target size={10} />
                            <span>{tr('View in 3D')}</span>
                          </button>
                        )}
                        {onDeletePoint && (
                          <button
                            type="button"
                            onClick={() => onDeletePoint(pt.id, pt.rowIndex)}
                            className="p-1 rounded hover:bg-[var(--danger-bg)] text-[var(--danger-text)] transition-colors"
                            title={tr("Remove this point")}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {outliers.length > 15 && (
                    <div className="text-center text-[10px] text-[var(--text-muted)] italic pt-1">
                      {tr("… and")} {outliers.length - 15} {tr("more outliers")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
