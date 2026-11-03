import React, { useState, useRef } from 'react';
import {
  ReductionMethod,
  ClusteringMethod,
  ColorMode,
  NormalizationMethod,
  ReductionConfig,
  ClusteringConfig,
  DatasetRow,
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
  Columns,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Sliders,
  Settings2,
  CheckCircle2,
  Layers,
  Sparkles,
  BarChart3,
  Search,
} from 'lucide-react';

export type SidebarTab = 'dataset' | 'reduction' | 'clustering' | 'display';

interface ControlSidebarProps {
  datasetName: string;
  totalRows: number;
  rawRows: DatasetRow[];
  headers: string[];
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
  onFileUpload: (file: File) => void;
  onLoadPreloadedDataset: (type: 'cancer' | 'wholesale' | 'synthetic') => void;
  isComputing: boolean;
  hasResults: boolean;
  onActiveTabChange: (tab: SidebarTab) => void;
  onRunComputation: () => void;
  onApplyClustering: () => void;
  isDualView: boolean;
  onToggleDualView: () => void;
  dualSecondaryMethod: ReductionMethod;
  onChangeDualSecondaryMethod: (m: ReductionMethod) => void;
  isLiveAnimating: boolean;
  onToggleLiveAnimation: () => void;
  onResetLiveAnimation: () => void;
  liveCurrentIter: number;
  liveMaxIter: number;
  onExportCSV: () => void;
  dbStatus: string;
  onOpenElbowModal?: () => void;
  onOpenSecurityModal?: () => void;
  pcaComponents?: number[][];
  explainedVariance?: [number, number, number];
  totalVarianceExplained?: number;
  biplotVisible?: boolean;
  onToggleBiplot?: () => void;
  biplotTopK?: number;
  onChangeBiplotTopK?: (topK: number) => void;
  biplotScale?: number;
  onChangeBiplotScale?: (scale: number) => void;
  datasetList?: DatasetSummary[];
  activeDatasetId?: string;
  onSelectDataset?: (id: string) => void;
  onRenameDataset?: (id: string, newName: string) => void;
  onDeleteDataset?: (id: string) => void;
  onOpenRawDataModal?: () => void;
  onOpenDatasetManager?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const ControlSidebar: React.FC<ControlSidebarProps> = ({
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
  onFileUpload,
  isComputing,
  hasResults,
  onActiveTabChange,
  onRunComputation,
  onApplyClustering,
  isDualView,
  onToggleDualView,
  dualSecondaryMethod,
  onChangeDualSecondaryMethod,
  isLiveAnimating,
  onToggleLiveAnimation,
  onResetLiveAnimation,
  liveCurrentIter,
  liveMaxIter,
  onExportCSV,
  dbStatus,
  onOpenElbowModal,
  onOpenSecurityModal,
  biplotVisible = false,
  onToggleBiplot,
  biplotTopK = 6,
  onChangeBiplotTopK,
  biplotScale = 30,
  onChangeBiplotScale,
  datasetList = [],
  activeDatasetId = '',
  onSelectDataset,
  onOpenRawDataModal,
  onOpenDatasetManager,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [featureSearch, setFeatureSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 4 Collapsible Accordion Groups
  const [groupOpen, setGroupOpen] = useState({
    dataset: true,
    preprocessing: true,
    reduction: true,
    clustering: true,
  });

  // Advanced parameters toggles
  const [showAdvancedReduction, setShowAdvancedReduction] = useState(false);
  const [showAdvancedClustering, setShowAdvancedClustering] = useState(false);

  const toggleGroup = (key: keyof typeof groupOpen) => {
    setGroupOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Signal active area to parent for contextual 3D view
      if (key === 'dataset' && next.dataset) onActiveTabChange('dataset');
      else if (key === 'reduction' && next.reduction) onActiveTabChange('reduction');
      else if (key === 'clustering' && next.clustering) onActiveTabChange('clustering');
      return next;
    });
  };

  const filteredFeatures = (featureColumns || []).filter((f) =>
    f.toLowerCase().includes(featureSearch.toLowerCase())
  );

  const isAtlas = dbStatus.includes('Connected') || dbStatus.includes('Atlas') || dbStatus.includes('Online');
  const canRun = selectedFeatures.length >= MIN_NUMERIC_FEATURES && !isComputing;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  if (isCollapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-3 border-r border-[#303A49] bg-[#151B23] py-3 text-[#E6EAF0] select-none transition-all">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          title="Mở rộng bảng điều khiển"
          className="p-2 rounded hover:bg-[#202936] text-[#929EAF] hover:text-[#E6EAF0] transition-colors"
        >
          <PanelLeftOpen size={16} />
        </button>
        <div className="w-2 h-2 rounded-full bg-[#8B9CFB]" title={datasetName} />
        <span className="text-[10px] font-mono text-[#929EAF] [writing-mode:vertical-rl] tracking-wider mt-2">
          {totalRows.toLocaleString('vi-VN')} MẪU
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-[#303A49] bg-[#151B23] text-[#E6EAF0] select-none text-xs">
      {/* 1. Scientific Header */}
      <div className="px-3.5 py-3 border-b border-[#303A49] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-[#202936] text-[#8B9CFB] border border-[#303A49]">
            <Sparkles size={15} />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-wider uppercase text-[#E6EAF0]">
              3D DATA EXPLORER
            </h1>
            <p className="text-[10px] text-[#929EAF]">Scientific Analytics Workbench</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onOpenSecurityModal && (
            <button
              type="button"
              onClick={onOpenSecurityModal}
              title="Trung tâm kết nối & Bảo mật"
              className="p-1 rounded text-[#929EAF] hover:text-[#E6EAF0] hover:bg-[#202936] transition-colors"
            >
              <ShieldCheck size={14} className={isAtlas ? 'text-[#34d399]' : 'text-[#fbbf24]'} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            title="Thu gọn sidebar để mở rộng không gian 3D"
            className="p-1 rounded text-[#929EAF] hover:text-[#E6EAF0] hover:bg-[#202936] transition-colors"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Accordion Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2.5">
        {/* ========================================================================= */}
        {/* NHÓM 1: DATASET VÀ THÔNG TIN DỮ LIỆU                                     */}
        {/* ========================================================================= */}
        <div className="rounded border border-[#303A49] bg-[#151B23] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleGroup('dataset')}
            className="w-full flex items-center justify-between px-3 py-2 bg-[#202936] hover:bg-[#283344] transition-colors text-left"
          >
            <span className="font-semibold text-[11px] uppercase tracking-wide text-[#E6EAF0] flex items-center gap-1.5">
              <Database size={13} className="text-[#8B9CFB]" />
              1. Dataset & Dữ liệu
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-[#929EAF]">
                {selectedFeatures.length}/{featureColumns.length} cột
              </span>
              {groupOpen.dataset ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </button>

          {groupOpen.dataset && (
            <div className="p-3 space-y-2.5 border-t border-[#303A49]">
              {/* Dataset Selector */}
              <div>
                <label className="text-[10px] uppercase font-semibold text-[#929EAF] block mb-1">
                  Bộ dữ liệu đang chọn:
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={activeDatasetId}
                    onChange={(e) => onSelectDataset && onSelectDataset(e.target.value)}
                    className="flex-1 rounded bg-[#202936] border border-[#303A49] text-[#E6EAF0] px-2 py-1 text-xs outline-none focus:border-[#8B9CFB]"
                  >
                    {datasetList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.total_rows} mẫu)
                      </option>
                    ))}
                    {datasetList.length === 0 && (
                      <option value="cancer_wdbc">Wisconsin Breast Cancer (569 mẫu)</option>
                    )}
                  </select>

                  {onOpenDatasetManager && (
                    <button
                      type="button"
                      onClick={onOpenDatasetManager}
                      title="Quản lý kho dữ liệu"
                      className="p-1.5 rounded bg-[#202936] hover:bg-[#2a3647] border border-[#303A49] text-[#929EAF] hover:text-[#E6EAF0]"
                    >
                      <FolderOpen size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons: Upload CSV & Raw Preview */}
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#202936] hover:bg-[#2a3647] border border-[#303A49] text-[11px] text-[#E6EAF0] transition-colors"
                >
                  <Upload size={12} className="text-[#8B9CFB]" />
                  <span>Tải CSV mới</span>
                </button>

                {onOpenRawDataModal && (
                  <button
                    type="button"
                    onClick={onOpenRawDataModal}
                    className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#202936] hover:bg-[#2a3647] border border-[#303A49] text-[11px] text-[#E6EAF0] transition-colors"
                  >
                    <FileSpreadsheet size={12} className="text-[#929EAF]" />
                    <span>Xem bảng gốc</span>
                  </button>
                )}
              </div>

              {/* Feature Selection with Quick Actions */}
              <div className="pt-2 border-t border-[#303A49]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-semibold text-[#929EAF]">
                    Chọn đặc trưng số (≥ 3):
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={onSelectAllFeatures}
                      className="text-[#8B9CFB] hover:underline"
                    >
                      Tất cả
                    </button>
                    <span className="text-[#303A49]">|</span>
                    <button
                      type="button"
                      onClick={onDeselectAllFeatures}
                      className="text-[#929EAF] hover:text-[#E6EAF0]"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                {/* Filter search */}
                {featureColumns.length > 8 && (
                  <div className="relative mb-1.5">
                    <Search size={11} className="absolute left-2 top-2 text-[#929EAF]" />
                    <input
                      type="text"
                      placeholder="Tìm đặc trưng..."
                      value={featureSearch}
                      onChange={(e) => setFeatureSearch(e.target.value)}
                      className="w-full rounded bg-[#202936] border border-[#303A49] text-[#E6EAF0] pl-6 pr-2 py-1 text-[11px] outline-none"
                    />
                  </div>
                )}

                {/* Feature Checkbox List */}
                <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1 p-1 rounded bg-[#0D1117] border border-[#303A49]">
                  {filteredFeatures.map((col) => {
                    const isChecked = selectedFeatures.includes(col);
                    return (
                      <label
                        key={col}
                        className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                          isChecked ? 'bg-[#202936] text-[#E6EAF0]' : 'hover:bg-[#1a222e] text-[#929EAF]'
                        }`}
                      >
                        <span className="truncate text-[11px]" title={col}>
                          {col}
                        </span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleFeature(col)}
                          className="w-3.5 h-3.5 rounded accent-[#8B9CFB] cursor-pointer ml-2"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* NHÓM 2: TIỀN XỬ LÝ VÀ CHUẨN HÓA DỮ LIỆU                                 */}
        {/* ========================================================================= */}
        <div className="rounded border border-[#303A49] bg-[#151B23] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleGroup('preprocessing')}
            className="w-full flex items-center justify-between px-3 py-2 bg-[#202936] hover:bg-[#283344] transition-colors text-left"
          >
            <span className="font-semibold text-[11px] uppercase tracking-wide text-[#E6EAF0] flex items-center gap-1.5">
              <Sliders size={13} className="text-[#8B9CFB]" />
              2. Tiền xử lý & Chuẩn hóa
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-[#8B9CFB] uppercase">
                {reductionConfig.normalization}
              </span>
              {groupOpen.preprocessing ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </button>

          {groupOpen.preprocessing && (
            <div className="p-3 space-y-2 border-t border-[#303A49]">
              <label className="text-[10px] uppercase font-semibold text-[#929EAF] block">
                Phương pháp chuẩn hóa ma trận:
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['z-score', 'min-max', 'none'] as NormalizationMethod[]).map((norm) => (
                  <button
                    key={norm}
                    type="button"
                    onClick={() => onChangeReductionConfig({ ...reductionConfig, normalization: norm })}
                    className={`py-1.5 rounded text-[11px] font-medium border transition-colors ${
                      reductionConfig.normalization === norm
                        ? 'bg-[#202936] border-[#8B9CFB] text-[#8B9CFB]'
                        : 'bg-[#0D1117] border-[#303A49] text-[#929EAF] hover:text-[#E6EAF0]'
                    }`}
                  >
                    {norm === 'z-score' ? 'Z-Score' : norm === 'min-max' ? 'Min-Max' : 'Gốc'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#929EAF] leading-relaxed pt-1">
                {reductionConfig.normalization === 'z-score'
                  ? 'Chuẩn hóa đưa đặc trưng về trung bình μ = 0, phương sai σ = 1 (khuyên dùng cho PCA & t-SNE).'
                  : reductionConfig.normalization === 'min-max'
                  ? 'Co dãn giá trị các đặc trưng về miền [0, 1].'
                  : 'Giữ nguyên thang đo gốc của dữ liệu.'}
              </p>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* NHÓM 3: GIẢM CHIỀU VÀ THAM SỐ THUẬT TOÁN                                 */}
        {/* ========================================================================= */}
        <div className="rounded border border-[#303A49] bg-[#151B23] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleGroup('reduction')}
            className="w-full flex items-center justify-between px-3 py-2 bg-[#202936] hover:bg-[#283344] transition-colors text-left"
          >
            <span className="font-semibold text-[11px] uppercase tracking-wide text-[#E6EAF0] flex items-center gap-1.5">
              <Layers size={13} className="text-[#8B9CFB]" />
              3. Giảm chiều không gian (3D)
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-[#8B9CFB] font-bold">
                {reductionConfig.method}
              </span>
              {groupOpen.reduction ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </button>

          {groupOpen.reduction && (
            <div className="p-3 space-y-2.5 border-t border-[#303A49]">
              {/* Algorithm Switcher */}
              <div className="grid grid-cols-3 gap-1.5">
                {(['PCA', 't-SNE', 'UMAP'] as ReductionMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChangeReductionConfig({ ...reductionConfig, method: m })}
                    className={`py-1.5 rounded text-[11px] font-bold border transition-colors ${
                      reductionConfig.method === m
                        ? 'bg-[#202936] border-[#8B9CFB] text-[#8B9CFB]'
                        : 'bg-[#0D1117] border-[#303A49] text-[#929EAF] hover:text-[#E6EAF0]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Primary Run Reduction Button */}
              <button
                type="button"
                onClick={() => {
                  onActiveTabChange('reduction');
                  onRunComputation();
                }}
                disabled={!canRun}
                className="w-full flex items-center justify-center gap-2 py-2 rounded bg-[#8B9CFB] hover:bg-[#7a8ce8] text-[#0D1117] font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={13} className="fill-current" />
                <span>{isComputing ? 'Đang tính toán...' : `Chạy giảm chiều 3D (${reductionConfig.method})`}</span>
              </button>

              {/* Advanced Parameters Toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvancedReduction(!showAdvancedReduction)}
                  className="flex items-center justify-between w-full py-1 text-[10px] uppercase font-semibold text-[#929EAF] hover:text-[#E6EAF0]"
                >
                  <span className="flex items-center gap-1">
                    <Settings2 size={11} />
                    Tham số thuật toán {reductionConfig.method}
                  </span>
                  <span>{showAdvancedReduction ? '▲ Ẩn' : '▼ Mở rộng'}</span>
                </button>

                {showAdvancedReduction && (
                  <div className="p-2.5 rounded bg-[#0D1117] border border-[#303A49] space-y-2 mt-1.5">
                    {/* t-SNE Parameters */}
                    {reductionConfig.method === 't-SNE' && (
                      <>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[#929EAF]">Perplexity:</span>
                            <span className="font-mono text-[#8B9CFB]">{reductionConfig.perplexity}</span>
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
                            className="w-full h-1 cursor-pointer accent-[#8B9CFB]"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[#929EAF]">Learning Rate:</span>
                            <span className="font-mono text-[#8B9CFB]">{reductionConfig.learningRate}</span>
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
                            className="w-full h-1 cursor-pointer accent-[#8B9CFB]"
                          />
                        </div>

                        {/* Live Optimization Controls */}
                        <div className="pt-2 border-t border-[#303A49] flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={onToggleLiveAnimation}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#202936] border border-[#303A49] text-[10px] text-[#E6EAF0]"
                          >
                            <Play size={10} />
                            <span>{isLiveAnimating ? 'Tạm dừng' : 'Chạy tối ưu động'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={onResetLiveAnimation}
                            className="p-1 rounded bg-[#202936] border border-[#303A49] text-[#929EAF]"
                            title="Đặt lại"
                          >
                            <RotateCcw size={11} />
                          </button>
                        </div>
                      </>
                    )}

                    {/* UMAP Parameters */}
                    {reductionConfig.method === 'UMAP' && (
                      <>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[#929EAF]">Số lân cận (n_neighbors):</span>
                            <span className="font-mono text-[#8B9CFB]">{reductionConfig.nNeighbors}</span>
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
                            className="w-full h-1 cursor-pointer accent-[#8B9CFB]"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[#929EAF]">Khoảng cách tối thiểu (min_dist):</span>
                            <span className="font-mono text-[#8B9CFB]">{reductionConfig.minDist}</span>
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
                            className="w-full h-1 cursor-pointer accent-[#8B9CFB]"
                          />
                        </div>
                      </>
                    )}

                    {/* PCA Parameters */}
                    {reductionConfig.method === 'PCA' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#929EAF]">Véc-tơ PCA Biplot:</span>
                          <button
                            type="button"
                            onClick={onToggleBiplot}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                              biplotVisible
                                ? 'bg-[#202936] border-[#8B9CFB] text-[#8B9CFB]'
                                : 'bg-[#0D1117] border-[#303A49] text-[#929EAF]'
                            }`}
                          >
                            {biplotVisible ? 'Đang bật' : 'Đang tắt'}
                          </button>
                        </div>
                        {biplotVisible && onChangeBiplotTopK && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-[#929EAF]">
                              <span>Số véc-tơ đặc trưng:</span>
                              <span className="font-mono text-[#8B9CFB]">{biplotTopK}</span>
                            </div>
                            <input
                              type="range"
                              min="3"
                              max="12"
                              step="1"
                              value={biplotTopK}
                              onChange={(e) => onChangeBiplotTopK(Number(e.target.value))}
                              className="w-full h-1 cursor-pointer accent-[#8B9CFB]"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* NHÓM 4: PHÂN CỤM VÀ THAM SỐ THUẬT TOÁN                                   */}
        {/* ========================================================================= */}
        <div className="rounded border border-[#303A49] bg-[#151B23] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleGroup('clustering')}
            className="w-full flex items-center justify-between px-3 py-2 bg-[#202936] hover:bg-[#283344] transition-colors text-left"
          >
            <span className="font-semibold text-[11px] uppercase tracking-wide text-[#E6EAF0] flex items-center gap-1.5">
              <BarChart3 size={13} className="text-[#8B9CFB]" />
              4. Phân cụm & Tô màu
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-[#8B9CFB] font-bold">
                {clusteringConfig.method}
              </span>
              {groupOpen.clustering ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </button>

          {groupOpen.clustering && (
            <div className="p-3 space-y-2.5 border-t border-[#303A49]">
              {/* Clustering Method Selection */}
              <div className="grid grid-cols-2 gap-1.5">
                {(['K-Means', 'DBSCAN'] as ClusteringMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChangeClusteringConfig({ ...clusteringConfig, method: m })}
                    className={`py-1.5 rounded text-[11px] font-bold border transition-colors ${
                      clusteringConfig.method === m
                        ? 'bg-[#202936] border-[#8B9CFB] text-[#8B9CFB]'
                        : 'bg-[#0D1117] border-[#303A49] text-[#929EAF] hover:text-[#E6EAF0]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Clustering Parameters */}
              {clusteringConfig.method === 'K-Means' && (
                <div className="space-y-1.5 p-2 rounded bg-[#0D1117] border border-[#303A49]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#929EAF]">Số cụm (k):</span>
                    <span className="font-mono text-[#8B9CFB] font-bold">{clusteringConfig.k}</span>
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
                    className="w-full h-1 cursor-pointer accent-[#8B9CFB]"
                  />
                  {onOpenElbowModal && (
                    <button
                      type="button"
                      onClick={onOpenElbowModal}
                      className="w-full mt-1 py-1 rounded bg-[#202936] hover:bg-[#2a3647] border border-[#303A49] text-[10px] text-[#8B9CFB] transition-colors"
                    >
                      Phân tích Elbow & Silhouette k tối ưu
                    </button>
                  )}
                </div>
              )}

              {clusteringConfig.method === 'DBSCAN' && (
                <div className="space-y-2 p-2 rounded bg-[#0D1117] border border-[#303A49]">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#929EAF]">Bán kính (epsilon):</span>
                      <span className="font-mono text-[#8B9CFB]">{clusteringConfig.epsilon}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={clusteringConfig.epsilon}
                      onChange={(e) =>
                        onChangeClusteringConfig({
                          ...clusteringConfig,
                          epsilon: Number(e.target.value),
                        })
                      }
                      className="w-full h-1 cursor-pointer accent-[#8B9CFB]"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#929EAF]">Số điểm tối thiểu (minPts):</span>
                      <span className="font-mono text-[#8B9CFB]">{clusteringConfig.minPts}</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="15"
                      step="1"
                      value={clusteringConfig.minPts}
                      onChange={(e) =>
                        onChangeClusteringConfig({
                          ...clusteringConfig,
                          minPts: Number(e.target.value),
                        })
                      }
                      className="w-full h-1 cursor-pointer accent-[#8B9CFB]"
                    />
                  </div>
                </div>
              )}

              {/* Apply Clustering Button */}
              <button
                type="button"
                onClick={() => {
                  onActiveTabChange('clustering');
                  onApplyClustering();
                }}
                disabled={!canRun}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#202936] hover:bg-[#283547] border border-[#303A49] text-[#E6EAF0] font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Áp dụng phân cụm</span>
              </button>

              {/* Color Mode Selection */}
              <div className="pt-2 border-t border-[#303A49] space-y-1.5">
                <label className="text-[10px] uppercase font-semibold text-[#929EAF] block">
                  Chế độ tô màu điểm:
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(['ground-truth', 'cluster', 'feature'] as ColorMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onChangeColorMode(mode)}
                      className={`py-1 rounded text-[10px] font-medium border transition-colors ${
                        colorMode === mode
                          ? 'bg-[#202936] border-[#8B9CFB] text-[#8B9CFB]'
                          : 'bg-[#0D1117] border-[#303A49] text-[#929EAF]'
                      }`}
                    >
                      {mode === 'ground-truth' ? 'Nhãn gốc' : mode === 'cluster' ? 'Cụm' : 'Đặc trưng'}
                    </button>
                  ))}
                </div>

                {colorMode === 'feature' && (
                  <select
                    value={selectedColorFeature}
                    onChange={(e) => onChangeSelectedColorFeature(e.target.value)}
                    className="w-full rounded bg-[#202936] border border-[#303A49] text-[#E6EAF0] px-2 py-1 text-[11px] mt-1 outline-none"
                  >
                    {featureColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Export CSV Button */}
              <div className="pt-2 border-t border-[#303A49]">
                <button
                  type="button"
                  onClick={onExportCSV}
                  disabled={!hasResults}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#202936] hover:bg-[#283547] border border-[#303A49] text-[#E6EAF0] text-[11px] transition-colors disabled:opacity-40"
                >
                  <Download size={12} className="text-[#34d399]" />
                  <span>Xuất CSV kèm tọa độ 3D & cụm</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Scientific Footer Status Bar */}
      <div className="px-3 py-2 border-t border-[#303A49] bg-[#0D1117] flex items-center justify-between text-[11px] text-[#929EAF]">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isAtlas ? 'bg-[#34d399]' : 'bg-[#fbbf24]'}`} />
          <span>CSDL: <strong className="text-[#E6EAF0]">{dbStatus}</strong></span>
        </div>
        <span className="font-mono text-[10px] text-[#929EAF]">v1.0 Sci-Workbench</span>
      </div>
    </aside>
  );
};
