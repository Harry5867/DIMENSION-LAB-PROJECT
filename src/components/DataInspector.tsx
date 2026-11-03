import React, { useState } from 'react';
import { DataPoint } from '../types';
import { X, Search, FileText, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';

interface DataInspectorProps {
  point: DataPoint | null;
  onClose: () => void;
  onDeletePoint?: (pointId: string | number | boolean) => void;
  theme?: 'dark' | 'light';
}

export const DataInspector: React.FC<DataInspectorProps> = ({ point, onClose, onDeletePoint }) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!point) return null;

  const isOutlierPoint = point.isOutlier || point.cluster === -1;

  const features = Object.entries(point.originalFeatures).filter(([key]) =>
    key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="absolute top-4 right-16 z-30 w-84 max-h-[calc(100%-2rem)] flex flex-col border border-[#303A49] rounded-lg bg-[#151B23] text-[#E6EAF0] shadow-2xl overflow-hidden text-xs animate-in fade-in duration-150">
      {/* Header */}
      <div className="p-3 border-b border-[#303A49] bg-[#202936] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-[#8B9CFB]" />
          <span className="font-semibold text-xs text-[#E6EAF0]">
            Chi tiết điểm: ID {String(point.id)}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng chi tiết"
          className="p-1 rounded text-[#929EAF] hover:text-[#E6EAF0] hover:bg-[#303A49] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Outlier Alert Banner & Instant Action */}
      {isOutlierPoint && (
        <div className="p-2.5 bg-[#2d1b1f] border-b border-[#7f1d1d] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#f87171]">
            <AlertTriangle size={15} className="shrink-0 animate-pulse text-[#ef4444]" />
            <span>Điểm Ngoại Lai (Outlier)</span>
          </div>
          {onDeletePoint && (
            <button
              type="button"
              onClick={() => onDeletePoint(point.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#ef4444] hover:bg-[#dc2626] text-white text-[10px] font-bold transition-all shadow-sm active:scale-95"
              title="Xóa điểm ngoại lai này khỏi không gian 3D"
            >
              <Trash2 size={11} />
              <span>Xóa điểm này</span>
            </button>
          )}
        </div>
      )}

      {/* Summary Badges */}
      <div className="p-2.5 border-b border-[#303A49] bg-[#0D1117] flex flex-wrap gap-1.5 text-[11px]">
        {point.label !== undefined && (
          <span className="px-2 py-0.5 rounded bg-[#202936] border border-[#303A49] text-[#E6EAF0]">
            Nhãn: <strong className="text-[#8B9CFB]">{String(point.label)}</strong>
          </span>
        )}
        <span className="px-2 py-0.5 rounded bg-[#202936] border border-[#303A49] text-[#E6EAF0]">
          Cụm: <strong className="text-[#34d399]">{point.cluster === -1 ? 'Nhiễu (-1)' : point.cluster}</strong>
        </span>
        <span className="px-2 py-0.5 rounded bg-[#202936] border border-[#303A49] font-mono text-[#929EAF]">
          3D: ({point.x.toFixed(2)}, {point.y.toFixed(2)}, {point.z.toFixed(2)})
        </span>
      </div>

      {/* Search Filter */}
      <div className="p-2 border-b border-[#303A49]">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-2 text-[#929EAF]" />
          <input
            type="text"
            placeholder="Tìm kiếm đặc trưng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded bg-[#202936] border border-[#303A49] pl-7 pr-2 py-1 text-xs text-[#E6EAF0] outline-none focus:border-[#8B9CFB]"
          />
        </div>
      </div>

      {/* Feature Attributes Table */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar max-h-72">
        {features.length === 0 ? (
          <div className="text-center py-4 text-[#929EAF] italic">Không tìm thấy đặc trưng khớp</div>
        ) : (
          features.map(([key, val]) => (
            <div
              key={key}
              className="flex items-center justify-between px-2 py-1 rounded bg-[#0D1117] border border-[#303A49]/50 hover:border-[#303A49]"
            >
              <span className="font-mono text-[11px] text-[#929EAF] truncate mr-2" title={key}>
                {key}
              </span>
              <span className="font-mono text-[11px] font-medium text-[#8B9CFB]">
                {val}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Action Footer */}
      <div className="p-2.5 border-t border-[#303A49] bg-[#202936] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#151B23] hover:bg-[#2a3647] border border-[#303A49] text-[#E6EAF0] text-[11px] font-medium transition-colors"
        >
          <CheckCircle size={12} className="text-[#34d399]" />
          <span>Giữ lại điểm này</span>
        </button>
        {onDeletePoint && !isOutlierPoint && (
          <button
            type="button"
            onClick={() => onDeletePoint(point.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[#2d1b1f] hover:bg-[#3d242a] border border-[#7f1d1d] text-[#f87171] text-[11px] font-medium transition-colors"
            title="Xóa điểm dữ liệu này"
          >
            <Trash2 size={12} />
            <span>Xóa</span>
          </button>
        )}
      </div>
    </div>
  );
};
