import { useAppLanguage } from "./WelcomeLanguage";
import { RangeNumber } from './RangeNumber';
import { normalizationLabels } from '../utils/exploration';
import React, { useState } from 'react';
import {
  ReductionMethod,
  ClusteringMethod,
  ColorMode,
  NormalizationMethod,
  ReductionConfig,
  ClusteringConfig,
  MIN_NUMERIC_FEATURES,
  DatasetSummary,
} from '../types';
import {
  Upload,
  Database,
  Play,
  RotateCcw,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Sliders,
  Settings2,
  Layers,
  Sparkles,
  BarChart3,
  Search,
} from 'lucide-react';

const normalizationDescriptions: Record<NormalizationMethod, string> = {
  'z-score': 'Center each feature and scale it by its standard deviation.',
  'min-max': 'Scale each feature to the range from 0 to 1.',
  none: 'Use the original scale of each feature.',
};
const reductionDescriptions: Record<ReductionMethod, string> = {
  PCA: 'Project the data onto directions that capture the most variance.',
  't-SNE': 'Bring nearby points together to reveal local structure.',
  UMAP: 'Build a projection from relationships between neighboring points.',
};
const clusteringDescriptions: Record<ClusteringMethod, string> = {
  'K-Means': 'Assign points to a fixed number of groups based on distance to their centers.',
  GMM: 'Fit overlapping Gaussian components with diagonal covariance on the 3D projection.',
  DBSCAN: 'Find dense groups and mark isolated points as noise.',
  None: 'View the projection without assigning cluster labels.',
};

interface ControlSidebarProps {
  additionalMethods?: React.ReactNode;
  embedded?: boolean;
  methodsOnly?: boolean;
  datasetName: string;
  totalRows: number;
  featureColumns: string[];
  selectedFeatures: string[];
  onToggleFeature: (feature: string) => void;
  onSelectAllFeatures: () => void;
  onDeselectAllFeatures: () => void;
  reductionConfig: ReductionConfig;
  onChangeReductionConfig: (config: ReductionConfig) => void;
  clusteringConfig: ClusteringConfig;
  onChangeClusteringConfig: (config: ClusteringConfig) => void;
  colorMode: ColorMode;
  onChangeColorMode: (mode: ColorMode) => void;
  selectedColorFeature: string;
  onChangeSelectedColorFeature: (feature: string) => void;
  onImportDataset: () => void;
  isComputing: boolean;
  hasResults: boolean;
  onRunComputation: () => void;
  onApplyClustering: () => void;
  isLiveAnimating: boolean;
  onToggleLiveAnimation: () => void;
  onResetLiveAnimation: () => void;
  onExportCSV: () => void;
  dbStatus: string;
  onOpenElbowModal?: () => void;
  onOpenSecurityModal?: () => void;
  biplotVisible?: boolean;
  onToggleBiplot?: () => void;
  biplotTopK?: number;
  onChangeBiplotTopK?: (topK: number) => void;
  datasetList?: DatasetSummary[];
  activeDatasetId?: string;
  onSelectDataset?: (id: string) => void;
  onOpenRawDataModal?: () => void;
  onOpenDatasetManager?: () => void;
}

export const ControlSidebar: React.FC<ControlSidebarProps> = ({
  additionalMethods,
  embedded = false,
  methodsOnly = false,
  datasetName,
  totalRows,
  featureColumns = [],
  selectedFeatures = [],
  onToggleFeature,
  onSelectAllFeatures,
  onDeselectAllFeatures,
  reductionConfig,
  onChangeReductionConfig,
  clusteringConfig,
  onChangeClusteringConfig,
  colorMode,
  onChangeColorMode,
  selectedColorFeature,
  onChangeSelectedColorFeature,
  onImportDataset,
  isComputing,
  hasResults,
  onRunComputation,
  onApplyClustering,
  isLiveAnimating,
  onToggleLiveAnimation,
  onResetLiveAnimation,
  onExportCSV,
  dbStatus,
  onOpenElbowModal,
  onOpenSecurityModal,
  biplotVisible = false,
  onToggleBiplot,
  biplotTopK = 6,
  onChangeBiplotTopK,
  datasetList = [],
  activeDatasetId = '',
  onSelectDataset,
  onOpenRawDataModal,
  onOpenDatasetManager,
}) => {
  const { tr } = useAppLanguage();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [featureSearch, setFeatureSearch] = useState('');

  // 4 Collapsible Accordion Groups
  const [groupOpen, setGroupOpen] = useState({
    dataset: !embedded,
    preprocessing: methodsOnly,
    reduction: true,
    clustering: methodsOnly,
  });

  // Advanced parameters toggles
  const [showAdvancedReduction, setShowAdvancedReduction] = useState(false);

  const toggleGroup = (key: keyof typeof groupOpen) => {
    setGroupOpen(previous => ({ ...previous, [key]: !previous[key] }));

  };

  const filteredFeatures = (featureColumns || []).filter((f) =>
    f.toLowerCase().includes(featureSearch.toLowerCase())
  );

  const isAtlas = dbStatus.includes('Connected') || dbStatus.includes('Atlas') || dbStatus.includes('Online');
  const canRun = selectedFeatures.length >= MIN_NUMERIC_FEATURES && !isComputing;

  if (isCollapsed && !embedded) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-3 border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] py-3 text-[var(--text-main)] select-none transition-all">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          title={tr("Expand setup")}
          className="p-2 rounded hover:bg-[var(--bg-interactive)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
        >
          <PanelLeftOpen size={16} />
        </button>
        <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" title={datasetName} />
        <span className="text-[10px] font-mono text-[var(--text-muted)] [writing-mode:vertical-rl] tracking-wider mt-2">
          {totalRows.toLocaleString('en-US')} {tr('POINTS')}
        </span>
      </aside>
    );
  }

  return (
    <aside className={`analysis-sidebar flex h-full w-80 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-main)] select-none text-xs${methodsOnly ? ' methods-controls' : ''}`} aria-label={methodsOnly ? tr("Analysis methods") : undefined}>
      {/* 1. Scientific Header */}
      {!methodsOnly && <div className="px-3.5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-[var(--bg-interactive)] text-[var(--accent-primary)] border border-[var(--border-subtle)]">
            <Sparkles size={15} />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-wider uppercase text-[var(--text-main)]">
              {tr("EXPLORATION SETUP")}
            </h2>
            <p className="text-[10px] text-[var(--text-muted)]">01 — {additionalMethods ? '06' : '04'}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!embedded && onOpenSecurityModal && (
            <button
              type="button"
              onClick={onOpenSecurityModal}
              title={tr("System status and help")}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-interactive)] transition-colors"
            >
              <ShieldCheck size={14} className={isAtlas ? 'text-[var(--success-text)]' : 'text-[#fbbf24]'} />
            </button>
          )}
          <button
            type="button"
            hidden={embedded}
            onClick={() => setIsCollapsed(true)}
            title={tr("Collapse setup")}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-interactive)] transition-colors"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>}

      {/* 2. Scrollable Accordion Container */}
      <fieldset disabled={isComputing} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-2.5">
        {/* ========================================================================= */}
        {/* NHÓM 1: DATASET VÀ THÔNG TIN DỮ LIỆU                                     */}
        {/* ========================================================================= */}
        {!methodsOnly && <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
          <button
            type="button"
            aria-expanded={groupOpen.dataset}
            onClick={() => toggleGroup('dataset')}
            className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] transition-colors text-left"
          >
            <span className="font-semibold text-[11px] uppercase tracking-wide text-[var(--text-main)] flex items-center gap-1.5">
              <Database size={13} className="text-[var(--accent-primary)]" />
              {tr("Dataset")}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="setup-group-summary" title={datasetName}>{datasetName}</span>
              {groupOpen.dataset ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </button>

          {groupOpen.dataset && (
            <div className="p-3 space-y-2.5 border-t border-[var(--border-subtle)]">
              {/* Dataset Selector */}
              <div>
                <label className="text-[10px] uppercase font-semibold text-[var(--text-muted)] block mb-1">
                  {tr("Active dataset")}
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label={tr("Active dataset")}
                    value={activeDatasetId}
                    onChange={(e) => onSelectDataset && onSelectDataset(e.target.value)}
                    className="flex-1 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[var(--text-main)] px-2 py-1 text-xs outline-none focus:border-[var(--accent-primary)]"
                  >
                    {datasetList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.is_preloaded ? tr(d.name) : d.name} ({d.total_rows} {tr("points)")}
                      </option>
                    ))}
                    {!datasetList.some(item => item.id === activeDatasetId) && activeDatasetId !== '' && <option value={activeDatasetId}>{datasetName}</option>}
                    {datasetList.length === 0 && activeDatasetId === '' && (
                      <option value="cancer_wdbc">{tr("Wisconsin Breast Cancer (569 points)")}</option>
                    )}
                  </select>

                  {onOpenDatasetManager && (
                    <button
                      type="button"
                      onClick={onOpenDatasetManager}
                      title={tr("Manage datasets")}
                      className="p-1.5 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    >
                      <FolderOpen size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="dataset-summary">
                <div><strong>{totalRows.toLocaleString('en-US')}</strong><span>{tr("Data points")}</span></div>
                <div><strong>{selectedFeatures.length.toLocaleString('en-US')}</strong><span>{tr("Features")}</span></div>
              </div>
              {/* Import and feature settings */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onImportDataset}
                  disabled={isComputing}
                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)] transition-colors"
                >
                  <Upload size={12} className="text-[var(--accent-primary)]" />
                  <span>{tr("Import dataset")}</span><span className="dataset-filetype">.csv</span>
                </button>

              </div>
              <details className="setup-detail">
                <summary>{tr("Data options")}</summary>
                {onOpenRawDataModal && (
                  <button
                    type="button"
                    onClick={onOpenRawDataModal}
                    className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)] transition-colors"
                  >
                    <FileSpreadsheet size={12} className="text-[var(--text-muted)]" />
                    <span>{tr("View data")}</span>
                  </button>
                )}

              {/* Feature Selection with Quick Actions */}
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                    {tr("Numeric features (min. 3)")}
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={onSelectAllFeatures}
                      className="text-[var(--accent-primary)] hover:underline"
                    >
                      {tr("Select all")}
                    </button>
                    <span className="text-[var(--border-subtle)]">|</span>
                    <button
                      type="button"
                      onClick={onDeselectAllFeatures}
                      className="text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    >
                      {tr("Clear")}
                    </button>
                  </div>
                </div>

                {/* Filter search */}
                {featureColumns.length > 8 && (
                  <div className="relative mb-1.5">
                    <Search size={11} className="absolute left-2 top-2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      placeholder={tr("Search features…")}
                      value={featureSearch}
                      onChange={(e) => setFeatureSearch(e.target.value)}
                      className="w-full rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[var(--text-main)] pl-6 pr-2 py-1 text-[11px] outline-none"
                    />
                  </div>
                )}

                {/* Feature Checkbox List */}
                <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1 p-1 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)]">
                  {filteredFeatures.map((col) => {
                    const isChecked = selectedFeatures.includes(col);
                    return (
                      <label
                        key={col}
                        className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                          isChecked ? 'bg-[var(--bg-interactive)] text-[var(--text-main)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
                        }`}
                      >
                        <span className="truncate text-[11px]" title={col}>
                          {col}
                        </span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleFeature(col)}
                          className="w-3.5 h-3.5 rounded accent-[var(--accent-primary)] cursor-pointer ml-2"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
              </details>
            </div>
          )}
        </div>}

        {/* ========================================================================= */}
        {/* NHÓM 2: TIỀN XỬ LÝ VÀ CHUẨN HÓA DỮ LIỆU                                 */}
        {/* ========================================================================= */}
        <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
          <button
            type="button"
            aria-expanded={groupOpen.preprocessing}
            onClick={() => toggleGroup('preprocessing')}
            className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] transition-colors text-left"
          >
            <span className="font-semibold text-[11px] uppercase tracking-wide text-[var(--text-main)] flex items-center gap-1.5">
              <Sliders size={13} className="text-[var(--accent-primary)]" />
              {tr("Preprocessing")}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-[var(--accent-primary)]">
                {tr(normalizationLabels[reductionConfig.normalization])}
              </span>
              {groupOpen.preprocessing ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </button>

          {groupOpen.preprocessing && (
            <div className="p-3 space-y-2 border-t border-[var(--border-subtle)]">
              <label className="text-[10px] uppercase font-semibold text-[var(--text-muted)] block">
                {tr("Normalization")}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['z-score', 'min-max', 'none'] as NormalizationMethod[]).map((norm) => (
                  <button
                    key={norm}
                    type="button"
                    aria-pressed={reductionConfig.normalization === norm}
                    onClick={() => onChangeReductionConfig({ ...reductionConfig, normalization: norm })}
                    className={`py-1.5 rounded text-[11px] font-medium border transition-colors ${
                      reductionConfig.normalization === norm
                        ? 'bg-[var(--bg-interactive)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                        : 'bg-[var(--bg-main)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {tr(normalizationLabels[norm])}
                  </button>
                ))}
              </div>
              {methodsOnly && <p className="method-description">{tr(normalizationDescriptions[reductionConfig.normalization])}</p>}
              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed pt-1">
                {reductionConfig.normalization === 'z-score'
                  ? tr("Center features and scale to unit variance.")
                  : reductionConfig.normalization === 'min-max'
                  ? tr("Scale features to the range 0–1.")
                  : tr("Keep the original feature scales.")}
              </p>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* NHÓM 3: GIẢM CHIỀU VÀ THAM SỐ THUẬT TOÁN                                 */}
        {/* ========================================================================= */}
        <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
          <button
            type="button"
            aria-expanded={groupOpen.reduction}
            onClick={() => toggleGroup('reduction')}
            className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] transition-colors text-left"
          >
            <span className="font-semibold text-[11px] uppercase tracking-wide text-[var(--text-main)] flex items-center gap-1.5">
              <Layers size={13} className="text-[var(--accent-primary)]" />
              {tr("Reduction")}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-[var(--accent-primary)] font-bold">
                {reductionConfig.method}
              </span>
              {groupOpen.reduction ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </button>

          {groupOpen.reduction && (
            <div className="p-3 space-y-2.5 border-t border-[var(--border-subtle)]">
              {/* Algorithm Switcher */}
              <div className="grid grid-cols-3 gap-1.5">
                {(['PCA', 't-SNE', 'UMAP'] as ReductionMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={reductionConfig.method === m}
                    onClick={() => onChangeReductionConfig({ ...reductionConfig, method: m })}
                    className={`py-1.5 rounded text-[11px] font-bold border transition-colors ${
                      reductionConfig.method === m
                        ? 'bg-[var(--bg-interactive)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                        : 'bg-[var(--bg-main)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {methodsOnly && <p className="method-description">{tr(reductionDescriptions[reductionConfig.method])}</p>}
              <p className="setup-output">{tr("Output space")} <span>{tr("3 dimensions")}</span></p>
              {!embedded && (
              /* Primary Run Reduction Button */
              <button
                type="button"
                onClick={onRunComputation}
                disabled={!canRun}
                className="w-full flex items-center justify-center gap-2 py-2 rounded bg-[var(--accent-primary)] hover:bg-[#7a8ce8] text-[var(--bg-main)] font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={13} className="fill-current" />
                <span>{isComputing ? tr("Analyzing…") : `${tr('Run projection')} (${reductionConfig.method})`}</span>
              </button>

              )}
              {/* Advanced Parameters Toggle */}
              {(!methodsOnly || reductionConfig.method !== 'PCA') && <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvancedReduction(!showAdvancedReduction)}
                  aria-expanded={showAdvancedReduction}
                  className="flex items-center justify-between w-full py-1 text-[10px] uppercase font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >
                  <span className="flex items-center gap-1">
                    <Settings2 size={11} />
                    {methodsOnly ? tr("Advanced settings") : reductionConfig.method + tr(" settings")}
                  </span>
                  <span>{showAdvancedReduction ? '−' : '+'}</span>
                </button>

                {showAdvancedReduction && (
                  <div className="p-2.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2 mt-1.5">
                    {/* t-SNE Parameters */}
                    {reductionConfig.method === 't-SNE' && (
                      <>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[var(--text-muted)]">Perplexity:</span>
                            <span className="font-mono text-[var(--accent-primary)]">{reductionConfig.perplexity}</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="50"
                            step="1"
                            value={reductionConfig.perplexity}
                            onChange={(e) =>
                              onChangeReductionConfig({
                                ...reductionConfig,
                                perplexity: Number(e.target.value),
                              })
                            }
                            className="w-full h-1 cursor-pointer accent-[var(--accent-primary)]"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[var(--text-muted)]">{tr("Learning Rate:")}</span>
                            <span className="font-mono text-[var(--accent-primary)]">{reductionConfig.learningRate}</span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="500"
                            step="10"
                            value={reductionConfig.learningRate}
                            onChange={(e) =>
                              onChangeReductionConfig({
                                ...reductionConfig,
                                learningRate: Number(e.target.value),
                              })
                            }
                            className="w-full h-1 cursor-pointer accent-[var(--accent-primary)]"
                          />
                        </div>

                        {/* Live Optimization Controls */}
                        {!methodsOnly && <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={onToggleLiveAnimation}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-main)]"
                          >
                            <Play size={10} />
                            <span>{isLiveAnimating ? tr("Pause") : tr("Animate optimization")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={onResetLiveAnimation}
                            className="p-1 rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[var(--text-muted)]"
                            title={tr("Reset")}
                          >
                            <RotateCcw size={11} />
                          </button>
                        </div>}
                      </>
                    )}

                    {/* UMAP Parameters */}
                    {reductionConfig.method === 'UMAP' && (
                      <>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[var(--text-muted)]">{tr("Neighbors")}</span>
                            <span className="font-mono text-[var(--accent-primary)]">{reductionConfig.nNeighbors}</span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="50"
                            step="1"
                            value={reductionConfig.nNeighbors}
                            onChange={(e) =>
                              onChangeReductionConfig({
                                ...reductionConfig,
                                nNeighbors: Number(e.target.value),
                              })
                            }
                            className="w-full h-1 cursor-pointer accent-[var(--accent-primary)]"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[var(--text-muted)]">{tr("Minimum distance")}</span>
                            <span className="font-mono text-[var(--accent-primary)]">{reductionConfig.minDist}</span>
                          </div>
                          <input
                            type="range"
                            min="0.01"
                            max="0.99"
                            step="0.05"
                            value={reductionConfig.minDist}
                            onChange={(e) =>
                              onChangeReductionConfig({
                                ...reductionConfig,
                                minDist: Number(e.target.value),
                              })
                            }
                            className="w-full h-1 cursor-pointer accent-[var(--accent-primary)]"
                          />
                        </div>
                      </>
                    )}

                    {/* PCA Parameters */}
                    {reductionConfig.method === 'PCA' && !methodsOnly && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[var(--text-muted)]">{tr("PCA biplot")}</span>
                          <button
                            type="button"
                            onClick={onToggleBiplot}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                              biplotVisible
                                ? 'bg-[var(--bg-interactive)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                                : 'bg-[var(--bg-main)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                            }`}
                          >
                            {biplotVisible ? tr("On") : tr("Off")}
                          </button>
                        </div>
                        {biplotVisible && onChangeBiplotTopK && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                              <span>{tr("Feature vectors")}</span>
                              <span className="font-mono text-[var(--accent-primary)]">{biplotTopK}</span>
                            </div>
                            <input
                              type="range"
                              min="3"
                              max="12"
                              step="1"
                              value={biplotTopK}
                              onChange={(e) => onChangeBiplotTopK(Number(e.target.value))}
                              className="w-full h-1 cursor-pointer accent-[var(--accent-primary)]"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* NHÓM 4: PHÂN CỤM VÀ THAM SỐ THUẬT TOÁN                                   */}
        {/* ========================================================================= */}
        <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
          <button
            type="button"
            aria-expanded={groupOpen.clustering}
            onClick={() => toggleGroup('clustering')}
            className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] transition-colors text-left"
          >
            <span className="font-semibold text-[11px] uppercase tracking-wide text-[var(--text-main)] flex items-center gap-1.5">
              <BarChart3 size={13} className="text-[var(--accent-primary)]" />
              {tr("Clustering")}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-[var(--accent-primary)] font-bold">
                {clusteringConfig.method === 'DBSCAN' && !groupOpen.clustering
                  ? 'DBSCAN · ε ' + clusteringConfig.epsilon + tr(" · Min ") + clusteringConfig.minPts
                  : clusteringConfig.method}
              </span>
              {groupOpen.clustering ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </button>

          {groupOpen.clustering && (
            <div className="p-3 space-y-2.5 border-t border-[var(--border-subtle)]">
              {/* Clustering Method Selection */}
              <div className="grid grid-cols-3 gap-1.5">
                {(['K-Means', 'DBSCAN', 'GMM', 'None'] as ClusteringMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={clusteringConfig.method === m}
                    onClick={() => onChangeClusteringConfig({ ...clusteringConfig, method: m })}
                    className={`py-1.5 rounded text-[11px] font-bold border transition-colors ${
                      clusteringConfig.method === m
                        ? 'bg-[var(--bg-interactive)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                        : 'bg-[var(--bg-main)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {m === 'None' ? tr("No clustering") : m}
                  </button>
                ))}
              </div>

              {methodsOnly && <p className="method-description">{tr(clusteringDescriptions[clusteringConfig.method])}</p>}
              {/* Clustering Parameters */}
              {clusteringConfig.method === 'K-Means' && (
                <div className="space-y-1.5 p-2 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--text-muted)]">{tr("Cluster count")}</span>
                    <span className="font-mono text-[var(--accent-primary)] font-bold">{clusteringConfig.k}</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="10"
                    step="1"
                    value={clusteringConfig.k}
                    onChange={(e) =>
                      onChangeClusteringConfig({
                        ...clusteringConfig,
                        k: Number(e.target.value),
                      })
                    }
                    className="w-full h-1 cursor-pointer accent-[var(--accent-primary)]"
                  />
                  {onOpenElbowModal && (
                    <button
                      type="button"
                      onClick={onOpenElbowModal}
                      className="w-full mt-1 py-1 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[10px] text-[var(--accent-primary)] transition-colors"
                    >
                      {tr("Explore cluster counts")}
                    </button>
                  )}
                </div>
              )}

              {clusteringConfig.method === 'GMM' && <div className="space-y-2">
                <p className="method-description">{tr("Diagonal covariance · fitted on projected 3D coordinates.")}</p>
                <RangeNumber label={tr("Components")} value={clusteringConfig.k} min={1} max={10} step={1} onChange={k => onChangeClusteringConfig({ ...clusteringConfig, k })} />
                <RangeNumber label={tr("EM iterations")} value={clusteringConfig.gmmIterations ?? 100} min={10} max={500} step={10} onChange={gmmIterations => onChangeClusteringConfig({ ...clusteringConfig, gmmIterations })} />
                <RangeNumber label={tr("Tolerance")} value={clusteringConfig.gmmTolerance ?? 0.00001} min={0.000001} max={0.1} step={0.000001} onChange={gmmTolerance => onChangeClusteringConfig({ ...clusteringConfig, gmmTolerance })} />
                <RangeNumber label={tr("Random seed")} value={clusteringConfig.seed ?? 42} min={0} max={4294967295} step={1} onChange={seed => onChangeClusteringConfig({ ...clusteringConfig, seed })} />
              </div>}
              {clusteringConfig.method === 'DBSCAN' && (
                <div className="setup-dbscan" aria-label={tr("DBSCAN settings")}>
                  <RangeNumber label={tr("Radius (ε)")} value={clusteringConfig.epsilon} min={0.5} max={10} step={0.5}
                    onChange={epsilon => onChangeClusteringConfig({ ...clusteringConfig, epsilon })} />
                  <RangeNumber label={tr("Minimum points")} value={clusteringConfig.minPts} min={2} max={15} step={1}
                    onChange={minPts => onChangeClusteringConfig({ ...clusteringConfig, minPts })} />
                </div>
              )}

              {!embedded && (
              /* Apply Clustering Button */
              <button
                type="button"
                onClick={() => onApplyClustering()}
                disabled={!canRun}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-main)] font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{tr("Apply clustering")}</span>
              </button>

              )}
              {!methodsOnly && <details className="setup-detail">
              <summary>{tr("Color options")}</summary>
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                <label className="text-[10px] uppercase font-semibold text-[var(--text-muted)] block">
                  {tr("Color by")}
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(['ground-truth', 'cluster', 'feature'] as ColorMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onChangeColorMode(mode)}
                      className={`py-1 rounded text-[10px] font-medium border transition-colors ${
                        colorMode === mode
                          ? 'bg-[var(--bg-interactive)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                          : 'bg-[var(--bg-main)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      {mode === 'ground-truth' ? tr("Label") : mode === 'cluster' ? tr("Cluster") : tr("Feature")}
                    </button>
                  ))}
                </div>

                {colorMode === 'feature' && (
                  <select
                    value={selectedColorFeature}
                    onChange={(e) => onChangeSelectedColorFeature(e.target.value)}
                    className="w-full rounded bg-[var(--bg-interactive)] border border-[var(--border-subtle)] text-[var(--text-main)] px-2 py-1 text-[11px] mt-1 outline-none"
                  >
                    {featureColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              </details>}
              {!embedded && (
              /* Export CSV Button */
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={onExportCSV}
                  disabled={!hasResults}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-main)] text-[11px] transition-colors disabled:opacity-40"
                >
                  <Download size={12} className="text-[var(--success-text)]" />
                  <span>{tr("Export 3D point data")}</span>
                </button>
              </div>
              )}
            </div>
          )}
        </div>
        {additionalMethods}
      </fieldset>

      {!embedded && (
      /* Scientific Footer Status Bar */
      <div className="px-3 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-main)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isAtlas ? 'bg-[var(--success-text)]' : 'bg-[#fbbf24]'}`} />
          <span>{tr("Database:")} <strong className="text-[var(--text-main)]">{tr(dbStatus)}</strong></span>
        </div>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">v1.0 Sci-Workbench</span>
      </div>
      )}
    </aside>
  );
};
