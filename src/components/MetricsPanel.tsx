import React, { useState } from 'react';
import { EvaluationMetrics, ReductionMethod } from '../types';
import { Activity, Database, Save, ChevronUp, ChevronDown, CheckCircle2, Clock, Layers, HelpCircle, RotateCcw, Trash2, Filter, BarChart3, Target } from 'lucide-react';
import { DataPoint } from '../types';

const CLUSTER_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
];

interface MetricsPanelProps {
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
  onDeletePoint?: (pointId: string | number | boolean) => void;
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  metrics,
  reductionMethod,
  clusteringMethod = 'K-Means',
  datasetName = 'Chưa chọn',
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
  const statusBadge = isComputing ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#202936] text-[#8B9CFB] border border-[#303A49]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#8B9CFB] animate-ping" />
      Đang xử lý...
    </span>
  ) : hasResults ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#162a23] text-[#34d399] border border-[#065f46]">
      <CheckCircle2 size={12} />
      Sẵn sàng
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#202936] text-[#929EAF] border border-[#303A49]">
      <Clock size={12} />
      Chờ phân tích
    </span>
  );

  const displayTime = metrics.executionTimeMs ?? executionTimeMs;

  return (
    <div className="w-full bg-[#151B23] border-t border-[#303A49] text-[#E6EAF0] text-xs select-none">
      {/* 1. DOCKED SCIENTIFIC RESULTS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 min-h-[46px]">
        {/* Left Section: Dataset context & Pipeline Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 pr-3 border-r border-[#303A49]">
            <Activity size={14} className="text-[#8B9CFB]" />
            <span className="font-semibold text-[11px] tracking-wider uppercase text-[#E6EAF0]">
              KẾT QUẢ PHÂN TÍCH
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#929EAF]">
            <span className="text-[#E6EAF0] font-medium truncate max-w-[140px]" title={datasetName}>
              {datasetName}
            </span>
            <span className="text-[#303A49]">|</span>
            <span className="font-mono text-[#929EAF]">{totalRows.toLocaleString('vi-VN')} mẫu</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-[#202936] text-[#8B9CFB] font-mono border border-[#303A49]">
              {reductionMethod}
            </span>
            <span className="text-[#929EAF]">+</span>
            <span className="px-1.5 py-0.5 rounded bg-[#202936] text-[#E6EAF0] font-mono border border-[#303A49]">
              {clusteringMethod}
            </span>
          </div>

          {statusBadge}

          {displayTime !== null && displayTime !== undefined && displayTime > 0 && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-mono text-[#929EAF]">
              <Clock size={11} className="text-[#929EAF]" />
              {displayTime} ms
            </span>
          )}
        </div>

        {/* Center/Right Section: Key Metrics Display */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Silhouette Score Metric */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#202936] border border-[#303A49] text-[11px]">
            <span className="text-[#929EAF]">Silhouette:</span>
            {silhouetteScore !== null ? (
              <span className={`font-mono font-semibold ${silhouetteScore >= 0.5 ? 'text-[#34d399]' : silhouetteScore >= 0.25 ? 'text-[#fbbf24]' : 'text-[#f87171]'}`}>
                {silhouetteScore.toFixed(3)}
              </span>
            ) : (
              <span className="text-[#929EAF] italic text-[10px]" title="Cần chạy phân cụm với k >= 2 để tính Silhouette">
                Chưa phân cụm
              </span>
            )}
          </div>

          {/* Adjusted Rand Index Metric */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#202936] border border-[#303A49] text-[11px]">
            <span className="text-[#929EAF]">ARI:</span>
            {adjustedRandIndex !== null ? (
              <span className={`font-mono font-semibold ${adjustedRandIndex >= 0.6 ? 'text-[#34d399]' : adjustedRandIndex >= 0.3 ? 'text-[#38bdf8]' : 'text-[#f87171]'}`}>
                {adjustedRandIndex.toFixed(3)}
              </span>
            ) : (
              <span className="text-[#929EAF] italic text-[10px]" title={hasGroundTruth ? 'Cần áp dụng phân cụm để so sánh nhãn' : 'Dataset không có cột nhãn tham chiếu ground-truth'}>
                {hasGroundTruth ? 'Chưa phân cụm' : 'Không có nhãn gốc'}
              </span>
            )}
          </div>

          {/* PCA Total Variance Explained */}
          {reductionMethod === 'PCA' && totalVarianceExplained !== undefined && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#202936] border border-[#303A49] text-[11px]">
              <span className="text-[#929EAF]">Phương sai 3D:</span>
              <span className="font-mono font-semibold text-[#8B9CFB]">
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
                  title="Lọc bỏ các điểm ngoại lai / điểm nhiễu khỏi không gian 3D"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#2d1b1f] hover:bg-[#3d242a] border border-[#7f1d1d] text-[11px] font-medium text-[#f87171] transition-colors"
                >
                  <Trash2 size={12} />
                  <span>Lọc Outlier ({metrics.outlierCount || metrics.noiseCount})</span>
                </button>
              ) : isPruned && onRestorePoints ? (
                <button
                  type="button"
                  onClick={onRestorePoints}
                  title="Khôi phục lại toàn bộ dữ liệu ban đầu"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#162a23] hover:bg-[#1f3b31] border border-[#065f46] text-[11px] font-medium text-[#34d399] transition-colors"
                >
                  <RotateCcw size={12} />
                  <span>Khôi phục ({prunedCount})</span>
                </button>
              ) : null}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-[#303A49]">
            {onSaveExperiment && (
              <button
                type="button"
                onClick={onSaveExperiment}
                disabled={isSaving || !hasResults}
                title={hasResults ? 'Lưu cấu hình & chỉ số vào MongoDB' : 'Cần chạy phân tích trước khi lưu'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#202936] hover:bg-[#2a3647] border border-[#303A49] hover:border-[#8B9CFB] text-[11px] font-medium text-[#E6EAF0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save size={12} className="text-[#34d399]" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu kết quả'}</span>
              </button>
            )}

            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                title="Xem các thí nghiệm đã lưu trong MongoDB"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#202936] hover:bg-[#2a3647] border border-[#303A49] text-[11px] font-medium text-[#E6EAF0] transition-colors"
              >
                <Database size={12} className="text-[#8B9CFB]" />
                <span className="hidden sm:inline">Lịch sử</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#202936] hover:bg-[#2a3647] border border-[#303A49] text-[11px] font-medium text-[#929EAF] hover:text-[#E6EAF0] transition-colors"
              title={isExpanded ? 'Thu gọn bảng chi tiết' : 'Mở rộng bảng chỉ số chi tiết'}
            >
              <span>{isExpanded ? 'Thu gọn' : 'Chi tiết'}</span>
              {isExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* 2. EXPANDED SCIENTIFIC DETAILS DRAWER */}
      {isExpanded && (
        <div className="border-t border-[#303A49] bg-[#0D1117] p-4 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Silhouette Evaluation Card */}
            <div className="p-3 rounded border border-[#303A49] bg-[#151B23]">
              <div className="flex items-center justify-between text-[#929EAF] text-[11px] mb-1.5">
                <span className="font-semibold uppercase tracking-wider">Chỉ số Silhouette</span>
                <HelpCircle size={12} className="text-[#929EAF]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-mono font-bold text-[#E6EAF0]">
                  {silhouetteScore !== null ? silhouetteScore.toFixed(4) : '—'}
                </span>
                <span className="text-[10px] text-[#929EAF]">[-1 đến +1]</span>
              </div>
              <p className="text-[11px] text-[#929EAF] mt-1.5 leading-relaxed">
                {silhouetteScore !== null ? (
                  silhouetteScore > 0.5 ? 'Độ phân tách cụm rõ nét, ranh giới rõ ràng.' :
                  silhouetteScore > 0.25 ? 'Phân cụm chấp nhận được, có vùng chồng lấn nhẹ.' :
                  'Cụm chồng lấn đáng kể hoặc dữ liệu không có cấu trúc cụm rõ.'
                ) : 'Yêu cầu chạy thuật toán phân cụm (K-Means hoặc DBSCAN) với ít nhất 2 cụm để đo độ kết cụm.'}
              </p>
            </div>

            {/* ARI Evaluation Card */}
            <div className="p-3 rounded border border-[#303A49] bg-[#151B23]">
              <div className="flex items-center justify-between text-[#929EAF] text-[11px] mb-1.5">
                <span className="font-semibold uppercase tracking-wider">Adjusted Rand Index (ARI)</span>
                <HelpCircle size={12} className="text-[#929EAF]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-mono font-bold text-[#E6EAF0]">
                  {adjustedRandIndex !== null ? adjustedRandIndex.toFixed(4) : '—'}
                </span>
                <span className="text-[10px] text-[#929EAF]">[-1 đến +1]</span>
              </div>
              <p className="text-[11px] text-[#929EAF] mt-1.5 leading-relaxed">
                {hasGroundTruth && adjustedRandIndex !== null ? (
                  adjustedRandIndex > 0.7 ? 'Khớp rất cao với nhãn chuẩn thực tế.' :
                  adjustedRandIndex > 0.3 ? 'Tương quan vừa phải với nhãn chuẩn.' :
                  'Phân cụm khác biệt lớn so với nhãn tham chiếu ban đầu.'
                ) : !hasGroundTruth ? (
                  'Bộ dữ liệu hiện tại không có cột nhãn ground-truth để tính chỉ số ARI.'
                ) : (
                  'Cần bấm "Áp dụng phân cụm" để tính độ tương đồng với nhãn tham chiếu.'
                )}
              </p>
            </div>

            {/* PCA Variance or Cluster Count breakdown */}
            <div className="p-3 rounded border border-[#303A49] bg-[#151B23]">
              <div className="flex items-center justify-between text-[#929EAF] text-[11px] mb-1.5">
                <span className="font-semibold uppercase tracking-wider">
                  {reductionMethod === 'PCA' ? 'Phương sai thành phần chính' : 'Phân bố mẫu theo cụm'}
                </span>
                <Layers size={12} className="text-[#929EAF]" />
              </div>

              {reductionMethod === 'PCA' && explainedVariance ? (
                <div>
                  <div className="flex items-center justify-between font-mono text-[11px] mb-2">
                    <span className="text-[#929EAF]">Tổng phương sai 3D:</span>
                    <span className="text-[#8B9CFB] font-semibold">{((totalVarianceExplained || 0) * 100).toFixed(2)}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded bg-[#202936] overflow-hidden flex mb-2">
                    <div style={{ width: `${(explainedVariance[0] * 100).toFixed(1)}%` }} className="bg-[#8B9CFB] h-full" title={`PC1: ${(explainedVariance[0] * 100).toFixed(1)}%`} />
                    <div style={{ width: `${(explainedVariance[1] * 100).toFixed(1)}%` }} className="bg-[#38bdf8] h-full" title={`PC2: ${(explainedVariance[1] * 100).toFixed(1)}%`} />
                    <div style={{ width: `${(explainedVariance[2] * 100).toFixed(1)}%` }} className="bg-[#34d399] h-full" title={`PC3: ${(explainedVariance[2] * 100).toFixed(1)}%`} />
                  </div>
                  <div className="flex justify-between font-mono text-[10px] text-[#929EAF]">
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
                        <span key={cluster} className="px-2 py-0.5 rounded bg-[#202936] border border-[#303A49] font-mono text-[10px] text-[#E6EAF0]">
                          Cụm {cluster}: <strong className="text-[#8B9CFB]">{count}</strong>
                        </span>
                      ))
                    ) : (
                      <span className="text-[#929EAF] italic text-[11px]">Chưa có thông tin phân cụm</span>
                    )}
                    {noiseCount !== undefined && noiseCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-[#2d1b1f] border border-[#7f1d1d] font-mono text-[10px] text-[#f87171]">
                        Nhiễu: {noiseCount}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Pipeline & Outlier Management Card */}
            <div className="p-3 rounded border border-[#303A49] bg-[#151B23] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[#929EAF] text-[11px] mb-1.5">
                  <span className="font-semibold uppercase tracking-wider">Tiền xử lý & Outlier</span>
                  <Filter size={12} className="text-[#8B9CFB]" />
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#929EAF]">Chuẩn hóa:</span>
                    <span className="text-[#8B9CFB] uppercase">{normalization}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#929EAF]">Không gian 3D:</span>
                    <span className="text-[#38bdf8]">{reductionMethod} (XYZ)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#929EAF]">Điểm ngoại lai:</span>
                    <span className={(metrics.outlierCount || metrics.noiseCount) ? 'text-[#f87171] font-semibold' : 'text-[#34d399]'}>
                      {metrics.outlierCount || metrics.noiseCount || 0} điểm
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[#303A49]">
                {!isPruned && onPruneOutliers && ((metrics.outlierCount && metrics.outlierCount > 0) || (metrics.noiseCount && metrics.noiseCount > 0)) ? (
                  <button
                    type="button"
                    onClick={onPruneOutliers}
                    className="w-full py-1.5 rounded bg-[#2d1b1f] hover:bg-[#3d242a] border border-[#7f1d1d] text-[11px] text-[#f87171] flex items-center justify-center gap-1.5 transition-colors font-medium"
                  >
                    <Trash2 size={12} />
                    <span>Lọc sạch {metrics.outlierCount || metrics.noiseCount} điểm ngoại lai</span>
                  </button>
                ) : isPruned && onRestorePoints ? (
                  <button
                    type="button"
                    onClick={onRestorePoints}
                    className="w-full py-1.5 rounded bg-[#162a23] hover:bg-[#1f3b31] border border-[#065f46] text-[11px] text-[#34d399] flex items-center justify-center gap-1.5 transition-colors font-medium"
                  >
                    <RotateCcw size={12} />
                    <span>Khôi phục dữ liệu gốc ({prunedCount})</span>
                  </button>
                ) : (
                  <div className="text-[10px] text-[#929EAF] text-center italic py-1">
                    Dữ liệu đã ở trạng thái sạch
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* 3. INTERACTIVE VISUAL ANALYTICS & OUTLIER EXPLORER */}
          <div className="mt-3 pt-3 border-t border-[#303A49] grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
            {/* Visual Analytics Chart */}
            <div className="p-3 rounded border border-[#303A49] bg-[#151B23]">
              <div className="flex items-center justify-between text-[#929EAF] text-[11px] mb-2 font-semibold uppercase tracking-wider">
                <span>Trực quan hóa mô hình: Phân bố cụm & Phương sai</span>
                <BarChart3 size={13} className="text-[#8B9CFB]" />
              </div>

              {Object.keys(clusterCounts).length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-[#929EAF]">Tỉ lệ mẫu theo từng cụm:</div>
                  <div className="w-full h-3 rounded bg-[#202936] overflow-hidden flex">
                    {Object.entries(clusterCounts).map(([cl, count]) => {
                      const pct = totalRows > 0 ? (count / totalRows) * 100 : 0;
                      const col = CLUSTER_COLORS[Number(cl) % CLUSTER_COLORS.length] || '#4E79A7';
                      return (
                        <div
                          key={cl}
                          style={{ width: `${pct}%`, backgroundColor: col }}
                          className="h-full transition-all"
                          title={`Cụm ${cl}: ${count} mẫu (${pct.toFixed(1)}%)`}
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
                          <span className="text-[#E6EAF0]">C{cl}:</span>
                          <span className="text-[#929EAF]">{count} ({pct.toFixed(1)}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : reductionMethod === 'PCA' && explainedVariance ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-[#929EAF]">Biểu đồ tỉ lệ phương sai (Scree Plot):</div>
                  <div className="grid grid-cols-3 gap-2 text-center font-mono">
                    <div className="p-2 rounded bg-[#202936] border border-[#303A49]">
                      <div className="text-[10px] text-[#929EAF]">PC1 (Trục X)</div>
                      <div className="text-sm font-bold text-[#8B9CFB]">{(explainedVariance[0] * 100).toFixed(1)}%</div>
                    </div>
                    <div className="p-2 rounded bg-[#202936] border border-[#303A49]">
                      <div className="text-[10px] text-[#929EAF]">PC2 (Trục Y)</div>
                      <div className="text-sm font-bold text-[#38bdf8]">{(explainedVariance[1] * 100).toFixed(1)}%</div>
                    </div>
                    <div className="p-2 rounded bg-[#202936] border border-[#303A49]">
                      <div className="text-[10px] text-[#929EAF]">PC3 (Trục Z)</div>
                      <div className="text-sm font-bold text-[#34d399]">{(explainedVariance[2] * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-[#929EAF] italic text-center py-4">
                  Chạy phân tích để hiển thị biểu đồ phân bố mô hình.
                </div>
              )}
            </div>

            {/* Outlier Navigator Table */}
            <div className="p-3 rounded border border-[#303A49] bg-[#151B23]">
              <div className="flex items-center justify-between text-[#929EAF] text-[11px] mb-2 font-semibold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Target size={13} className="text-[#f87171]" />
                  <span>Định vị & Quản lý Outlier ({outliers.length} điểm)</span>
                </div>
                {outliers.length > 0 && onPruneOutliers && (
                  <button
                    type="button"
                    onClick={onPruneOutliers}
                    className="text-[10px] px-2 py-0.5 rounded bg-[#2d1b1f] hover:bg-[#3d242a] border border-[#7f1d1d] text-[#f87171] font-medium"
                  >
                    Xóa tất cả Outliers
                  </button>
                )}
              </div>

              {outliers.length === 0 ? (
                <div className="text-[11px] text-[#34d399] py-4 text-center font-medium">
                  ✓ Không có điểm ngoại lai nào (Dữ liệu đồng nhất & sạch)
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1">
                  {outliers.slice(0, 15).map((pt) => (
                    <div
                      key={String(pt.id)}
                      className="flex items-center justify-between px-2 py-1 rounded bg-[#0D1117] border border-[#303A49]/60 hover:border-[#8B9CFB] text-[11px] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#f87171]">ID {String(pt.id)}</span>
                        <span className="font-mono text-[10px] text-[#929EAF]">
                          ({pt.x.toFixed(1)}, {pt.y.toFixed(1)}, {pt.z.toFixed(1)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {onSelectPoint && (
                          <button
                            type="button"
                            onClick={() => onSelectPoint(pt)}
                            className="px-1.5 py-0.5 rounded bg-[#202936] hover:bg-[#2a3647] border border-[#303A49] text-[10px] text-[#38bdf8] flex items-center gap-1"
                            title="Di chuyển camera 3D đến xem điểm này"
                          >
                            <Target size={10} />
                            <span>Xem 3D</span>
                          </button>
                        )}
                        {onDeletePoint && (
                          <button
                            type="button"
                            onClick={() => onDeletePoint(pt.id)}
                            className="p-1 rounded hover:bg-[#2d1b1f] text-[#f87171] transition-colors"
                            title="Xóa điểm này"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {outliers.length > 15 && (
                    <div className="text-center text-[10px] text-[#929EAF] italic pt-1">
                      ... và {outliers.length - 15} điểm ngoại lai khác
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
