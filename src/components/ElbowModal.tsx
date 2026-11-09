import { useAppLanguage } from "./WelcomeLanguage";
import { useDialogFocus } from '../utils/useDialogFocus';
import React, { useMemo, useState } from 'react';
import { X, TrendingDown, Award, CheckCircle2, Sparkles } from 'lucide-react';
import { computeKMeans } from '../algorithms/kmeans';
import { computeSilhouetteScore } from '../algorithms/metrics';

interface ElbowModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureMatrix: number[][];
  currentK: number;
  onApplyK: (k: number) => void;
  theme?: 'dark' | 'light';
}

interface KMetric {
  k: number;
  inertia: number;
  silhouette: number;
}

export const ElbowModal: React.FC<ElbowModalProps> = ({
  isOpen,
  onClose,
  featureMatrix,
  currentK,
  onApplyK,
  theme = 'dark',
}) => {
  const { tr } = useAppLanguage();
  const isLight = theme === 'light';
  const [selectedK, setSelectedK] = useState<number>(currentK);

  // Compute metrics for K = 2..8
  const kRange = [2, 3, 4, 5, 6, 7, 8];

  const metricsList = useMemo<KMetric[]>(() => {
    if (!isOpen || !featureMatrix || featureMatrix.length === 0) return [];

    const results: KMetric[] = [];
    for (const k of kRange) {
      const res = computeKMeans(featureMatrix, k, 40);
      const sil = computeSilhouetteScore(featureMatrix, res.clusters) || 0;
      results.push({
        k,
        inertia: res.inertia,
        silhouette: sil,
      });
    }
    return results;
  }, [isOpen, featureMatrix]);

  // Find optimal K by highest Silhouette
  const bestKBySilhouette = useMemo(() => {
    if (metricsList.length === 0) return 2;
    let best = metricsList[0];
    for (const m of metricsList) {
      if (m.silhouette > best.silhouette) {
        best = m;
      }
    }
    return best.k;
  }, [metricsList]);

  const dialogRef = useDialogFocus(isOpen, onClose);
  if (!isOpen) return null;

  // Chart dimensions
  const width = 640;
  const height = 260;
  const padding = { top: 30, right: 55, bottom: 40, left: 65 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Scales
  const maxInertia = Math.max(...metricsList.map(m => m.inertia), 1);
  const minInertia = Math.min(...metricsList.map(m => m.inertia), 0);
  const inertiaRange = maxInertia - minInertia || 1;

  const maxSil = Math.max(...metricsList.map(m => m.silhouette), 0.5);
  const minSil = Math.min(...metricsList.map(m => m.silhouette), 0);
  const silRange = maxSil - minSil || 1;

  const getX = (index: number) => padding.left + (index / (kRange.length - 1)) * chartW;
  const getYInertia = (val: number) => padding.top + chartH - ((val - minInertia) / inertiaRange) * chartH;
  const getYSil = (val: number) => padding.top + chartH - ((val - minSil) / silRange) * chartH;

  // SVG Paths
  const inertiaPoints = metricsList.map((m, i) => `${getX(i)},${getYInertia(m.inertia)}`).join(' ');
  const silPoints = metricsList.map((m, i) => `${getX(i)},${getYSil(m.silhouette)}`).join(' ');

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ElbowModal-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className={`relative w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700/80 text-white'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              isLight ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
            }`}>
              <TrendingDown size={22} />
            </div>
            <div>
              <h2 id="ElbowModal-title" className={`text-lg font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {tr("Choose a cluster count")}
                <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                  isLight ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-indigo-900/60 text-indigo-300 border-indigo-700/50'
                }`}>
                  K = 2 → 8
                </span>
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {tr("Compare inertia and silhouette across values of K.")}
              </p>
            </div>
          </div>
          <button
            aria-label={tr("Close cluster analysis")} onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Chart Section */}
          <div className={`border rounded-xl p-4 ${
            isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/70 border-slate-800'
          }`}>
            <div className="flex items-center justify-between text-xs mb-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="w-3 h-1 bg-amber-500 rounded-full inline-block" />
                  <span className={isLight ? 'text-amber-700' : 'text-amber-300'}>{tr("Inertia / WCSS (Left axis: lower means tighter clusters)")}</span>
                </div>
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="w-3 h-1 bg-emerald-500 rounded-full inline-block" />
                  <span className={isLight ? 'text-emerald-700' : 'text-emerald-300'}>{tr("Silhouette Score (Right axis: higher means better separation)")}</span>
                </div>
              </div>
            </div>

            {/* SVG Dual-Axis Chart */}
            <div className="w-full flex justify-center">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                  <line
                    key={i}
                    x1={padding.left}
                    y1={padding.top + chartH * pct}
                    x2={width - padding.right}
                    y2={padding.top + chartH * pct}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Inertia Line */}
                <polyline
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={inertiaPoints}
                />

                {/* Silhouette Line */}
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={silPoints}
                />

                {/* Data Points */}
                {metricsList.map((m, idx) => {
                  const x = getX(idx);
                  const yInertia = getYInertia(m.inertia);
                  const ySil = getYSil(m.silhouette);
                  const isSelected = selectedK === m.k;
                  const isBestSil = bestKBySilhouette === m.k;

                  return (
                    <g key={m.k} className="cursor-pointer" onClick={() => setSelectedK(m.k)}>
                      {/* Vertical highlight line when selected */}
                      {isSelected && (
                        <line
                          x1={x}
                          y1={padding.top}
                          x2={x}
                          y2={padding.top + chartH}
                          stroke="#6366f1"
                          strokeWidth="2"
                          strokeDasharray="3 3"
                        />
                      )}

                      {/* Inertia Dot */}
                      <circle
                        cx={x}
                        cy={yInertia}
                        r={isSelected ? 6 : 4}
                        fill="#f59e0b"
                        stroke="#0f172a"
                        strokeWidth="2"
                        className="transition-all hover:r-7"
                      />

                      {/* Silhouette Dot */}
                      <circle
                        cx={x}
                        cy={ySil}
                        r={isSelected ? 6 : 4}
                        fill="#10b981"
                        stroke="#0f172a"
                        strokeWidth="2"
                        className="transition-all hover:r-7"
                      />

                      {/* Best Silhouette Badge */}
                      {isBestSil && (
                        <g transform={`translate(${x}, ${ySil - 16})`}>
                          <rect
                            x="-22"
                            y="-14"
                            width="44"
                            height="16"
                            rx="4"
                            fill="#065f46"
                            stroke="#10b981"
                            strokeWidth="1"
                          />
                          <text
                            x="0"
                            y="-3"
                            textAnchor="middle"
                            fill="#a7f3d0"
                            fontSize="9"
                            fontWeight="bold"
                          >
                            {tr("Best")}
                          </text>
                        </g>
                      )}

                      {/* X Axis Label */}
                      <text
                        x={x}
                        y={height - padding.bottom + 20}
                        textAnchor="middle"
                        fill={isSelected ? '#6366f1' : '#94a3b8'}
                        fontSize="12"
                        fontWeight={isSelected ? 'bold' : 'normal'}
                      >
                        K={m.k}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Table Metrics Summary */}
          <div className="grid grid-cols-7 gap-2">
            {metricsList.map(m => {
              const isSelected = selectedK === m.k;
              const isBest = bestKBySilhouette === m.k;
              return (
                <button
                  key={m.k}
                  onClick={() => setSelectedK(m.k)}
                  className={`flex flex-col items-center p-2.5 rounded-xl border text-center transition-all ${
                    isSelected
                      ? isLight
                        ? 'bg-indigo-50 border-indigo-500 shadow-md ring-2 ring-indigo-400/30'
                        : 'bg-indigo-600/20 border-indigo-500 shadow-md shadow-indigo-500/20'
                      : isLight
                        ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>K = {m.k}</span>
                    {isBest && <Sparkles size={11} className="text-emerald-500" />}
                  </div>
                  <div className="text-[10px] text-amber-500 font-mono mt-1">
                    {m.inertia > 1000 ? `${(m.inertia / 1000).toFixed(1)}k` : m.inertia.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-emerald-500 font-mono font-semibold">
                    Sil: {m.silhouette.toFixed(2)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Scientific Interpretation Card */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            isLight ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900' : 'bg-indigo-950/30 border-indigo-800/50 text-indigo-200'
          }`}>
            <Award className="text-indigo-500 shrink-0 mt-0.5" size={20} />
            <div className="text-xs leading-relaxed">
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{tr("Recommendation:")} </span>
              {bestKBySilhouette === 2 ? (
                <span>
                  {tr("At")} <strong>K = 2</strong>{tr(", silhouette peaks at")}{' '}
                  <span className="font-mono font-bold text-emerald-500">
                    ({metricsList.find(m => m.k === 2)?.silhouette.toFixed(3)})
                  </span>{' '}
                  {tr("and inertia shows an elbow. This suggests two well-separated clusters.")}
                </span>
              ) : (
                <span>
                  {tr("The best separation is at")} <strong>K = {bestKBySilhouette}</strong>{tr(", with a silhouette score of")}{' '}
                  <span className="font-mono font-bold text-emerald-500">
                    ({metricsList.find(m => m.k === bestKBySilhouette)?.silhouette.toFixed(3)})
                  </span>.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-3.5 border-t flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {tr("Selected cluster count:")} <span className="font-bold text-indigo-600">K = {selectedK}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                isLight ? 'text-slate-600 hover:text-slate-900 bg-slate-200 hover:bg-slate-300' : 'text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700'
              }`}
            >
              {tr("Close")}
            </button>
            <button
              onClick={() => {
                onApplyK(selectedK);
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all"
            >
              <CheckCircle2 size={14} />
              <span>{tr("Apply K =")} {selectedK}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
