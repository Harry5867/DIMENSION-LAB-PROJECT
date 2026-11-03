import React, { lazy, Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as THREE from 'three';
import Papa from 'papaparse';
import {
  ParsedDataset,
  DataPoint,
  DataValue,
  ReductionConfig,
  ClusteringConfig,
  ColorMode,
  EvaluationMetrics,
  MIN_NUMERIC_FEATURES,
  ReductionMethod,
  DatasetSummary,
} from './types';
import { parseCSVString, extractFeatureMatrix } from './utils/dataParser';
import { computePCA } from './algorithms/pca';
import { computeTSNE } from './algorithms/tsne';
import { computeUMAP } from './algorithms/umap';
import { computeKMeans } from './algorithms/kmeans';
import { computeDBSCAN } from './algorithms/dbscan';
import { computeSilhouetteScore, computeARI, detectOutliers3D, detectKMeansOutliers } from './algorithms/metrics';
import { initLiveTSNE, stepLiveTSNE, LiveTSNEState } from './algorithms/liveOptimization';
import { ControlSidebar } from './components/ControlSidebar';
import type { SidebarTab } from './components/ControlSidebar';
import { MetricsPanel } from './components/MetricsPanel';
import { DataInspector } from './components/DataInspector';
import { RawDataModal } from './components/RawDataModal';
import { DatasetManagerModal } from './components/DatasetManagerModal';
import { ExperimentRecord } from './types';
import { Play, Square, Sparkles } from 'lucide-react';
import {
  getErrorMessage,
  isComputeResult,
  isDatasetDocument,
  isDatasetSummary,
  isExperimentRecord,
  isRecord,
} from './utils/typeGuards';

const ThreeCanvas = lazy(() =>
  import('./components/ThreeCanvas').then((module) => ({ default: module.ThreeCanvas }))
);
const ExperimentsModal = lazy(() =>
  import('./components/ExperimentsModal').then((module) => ({ default: module.ExperimentsModal }))
);
const ElbowModal = lazy(() =>
  import('./components/ElbowModal').then((module) => ({ default: module.ElbowModal }))
);
const SecurityModal = lazy(() =>
  import('./components/SecurityModal').then((module) => ({ default: module.SecurityModal }))
);

type ReductionOutput = {
  coordinates: [number, number, number][];
  components?: number[][];
  explainedVariance?: [number, number, number];
  totalExplainedVariance?: number;
};

export function App() {
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [activeArea, setActiveArea] = useState<SidebarTab>('dataset');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const rawPreviewPoints = useMemo<DataPoint[]>(() => {
    if (!dataset || selectedFeatures.length < MIN_NUMERIC_FEATURES) return [];

    const axes = selectedFeatures.slice(0, 3);
    const getAxisValue = (row: ParsedDataset['rawRows'][number], feature: string | undefined): number => {
      if (!feature) return 0;
      const value = row[feature];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return Number(value);
      }
      return 0;
    };

    return dataset.rawRows.map((row, index) => {
      const originalFeatures: Record<string, number> = {};
      for (const feature of dataset.featureColumns) {
        originalFeatures[feature] = getAxisValue(row, feature);
      }

      return {
        id: (dataset.idColumn ? row[dataset.idColumn] : null) ?? index + 1,
        label: dataset.labelColumn ? row[dataset.labelColumn] : undefined,
        originalFeatures,
        x: getAxisValue(row, axes[0]),
        y: getAxisValue(row, axes[1]),
        z: getAxisValue(row, axes[2]),
        cluster: 0,
      };
    });
  }, [dataset, selectedFeatures]);
  const [selectedPoint, setSelectedPoint] = useState<DataPoint | null>(null);
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [dbStatus, setDbStatus] = useState<string>('Đang kiểm tra...');
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Dataset Management & Theme State
  const [datasetList, setDatasetList] = useState<DatasetSummary[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string>('cancer_wdbc');
  const [isRawDataModalOpen, setIsRawDataModalOpen] = useState<boolean>(false);
  const [isDatasetManagerOpen, setIsDatasetManagerOpen] = useState<boolean>(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const handleToggleBiplot = useCallback(() => {
    setBiplotVisible((prev) => !prev);
  }, []);



  // Outlier Spotlight Mode
  const [spotlightOutliers, setSpotlightOutliers] = useState<boolean>(true);

  // Data Story Mode State
  const [isStoryPlaying, setIsStoryPlaying] = useState<boolean>(false);
  const [storyStep, setStoryStep] = useState<number>(0);
  const storyTimersRef = useRef<NodeJS.Timeout[]>([]);

  const handleStopStory = useCallback(() => {
    storyTimersRef.current.forEach((t) => clearTimeout(t));
    storyTimersRef.current = [];
    setIsStoryPlaying(false);
    setStoryStep(0);
    setNotice({ type: 'info', message: 'Đã dừng trình chiếu Data Story.' });
  }, []);

  // Outlier Pruning State
  const backupPointsRef = useRef<{ primary: DataPoint[]; dual: DataPoint[] } | null>(null);
  const [isPruned, setIsPruned] = useState<boolean>(false);
  const [prunedCount, setPrunedCount] = useState<number>(0);

  // Elbow Modal, Security Modal & PCA Biplot State
  const [isElbowModalOpen, setIsElbowModalOpen] = useState<boolean>(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);
  const [pcaComponents, setPcaComponents] = useState<number[][] | undefined>(undefined);
  const [featureMatrix, setFeatureMatrix] = useState<number[][]>([]);
  const [biplotVisible, setBiplotVisible] = useState<boolean>(false);
  const [biplotTopK, setBiplotTopK] = useState<number>(6);
  const [biplotScale, setBiplotScale] = useState<number>(30);

  // Dual Viewport State
  const [isDualView, setIsDualView] = useState<boolean>(false);
  const [dualSecondaryMethod, setDualSecondaryMethod] = useState<ReductionMethod>('t-SNE');
  const [dualDataPoints, setDualDataPoints] = useState<DataPoint[]>([]);

  // Throttled Camera Sync to prevent destroying Viewport B during orbit
  const [syncedCamPos, setSyncedCamPos] = useState<THREE.Vector3 | null>(null);
  const [syncedTargetPos, setSyncedTargetPos] = useState<THREE.Vector3 | null>(null);
  const syncRafRef = useRef<number | null>(null);

  // Live Optimization State
  const [isLiveAnimating, setIsLiveAnimating] = useState<boolean>(false);
  const [liveCurrentIter, setLiveCurrentIter] = useState<number>(0);
  const liveStateRef = useRef<LiveTSNEState | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Experiments & MongoDB Database state
  const [isExperimentsModalOpen, setIsExperimentsModalOpen] = useState(false);
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [isSavingExperiment, setIsSavingExperiment] = useState(false);

  const [reductionConfig, setReductionConfig] = useState<ReductionConfig>({
    method: 'PCA',
    normalization: 'z-score',
    perplexity: 30,
    learningRate: 100,
    iterations: 250,
    nNeighbors: 15,
    minDist: 0.1,
  });

  const [clusteringConfig, setClusteringConfig] = useState<ClusteringConfig>({
    method: 'K-Means',
    k: 2,
    epsilon: 3.5,
    minPts: 5,
  });

  const [colorMode, setColorMode] = useState<ColorMode>('ground-truth');
  const [selectedColorFeature, setSelectedColorFeature] = useState<string>('');

  const [metrics, setMetrics] = useState<EvaluationMetrics>({
    silhouetteScore: null,
    adjustedRandIndex: null,
    clusterCounts: {},
  });

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // Check Database connection health periodically
  useEffect(() => {
    const checkDbHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data: unknown = await res.json();
          setDbStatus(isRecord(data) && typeof data.database === 'string' ? data.database : 'Online');
        }
      } catch {
        setDbStatus('Trực tiếp (Client-Side)');
      }
    };
    checkDbHealth();
    const interval = setInterval(checkDbHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Reset all computation & analytical states to ensure 100% data consistency
  const resetComputationState = useCallback(() => {
    setDataPoints([]);
    setDualDataPoints([]);
    setSelectedPoint(null);
    setPcaComponents(undefined);
    setFeatureMatrix([]);
    setMetrics({
      silhouetteScore: null,
      adjustedRandIndex: null,
      clusterCounts: {},
    });
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsLiveAnimating(false);
    liveStateRef.current = null;
    setLiveCurrentIter(0);
  }, []);

  // Fetch all datasets from backend
  const fetchDatasetList = useCallback(async () => {
    try {
      const res = await fetch('/api/datasets');
      if (res.ok) {
        const list: unknown = await res.json();
        if (Array.isArray(list)) {
          setDatasetList(list.filter(isDatasetSummary));
        }
      }
    } catch (e: unknown) {
      console.warn('Không thể nạp danh sách bộ dữ liệu từ server:', e);
    }
  }, []);

  // Select and switch active dataset
  const handleSelectDataset = useCallback(async (id: string) => {
    try {
      setIsComputing(true);
      setLoadingMessage('Đang nạp bộ dữ liệu...');
      resetComputationState();

      // 1. Try fetching dataset by ID from backend
      try {
        const res = await fetch(`/api/datasets/${id}`);
        if (res.ok) {
          const data: unknown = await res.json();
          if (isDatasetDocument(data)) {
            const parsed: ParsedDataset = {
              id: data.id,
              name: data.name,
              totalRows: data.totalRows,
              headers: Object.keys(data.rawRows[0] || {}),
              idColumn: data.idColumn,
              labelColumn: data.labelColumn,
              featureColumns: data.features,
              rawRows: data.rawRows,
            };
            setDataset(parsed);
            setActiveDatasetId(id);
            setSelectedFeatures(parsed.featureColumns);
            if (parsed.featureColumns.length > 0) {
              setSelectedColorFeature(parsed.featureColumns[0]);
            }
            setNotice({ type: 'success', message: `Đã chọn bộ dữ liệu "${parsed.name}".` });
            return;
          }
        }
      } catch (apiError: unknown) {
        console.warn(`Không thể nạp dataset ${id} từ API, thử fallback:`, apiError);
      }

      // 2. Fallbacks for standard datasets if server offline
      if (id.includes('cancer')) {
        const staticRes = await fetch('/data.csv');
        if (!staticRes.ok) throw new Error('Không thể tải bộ dữ liệu mẫu /data.csv.');
        const text = await staticRes.text();
        const parsed = parseCSVString(text, 'Wisconsin Breast Cancer');
        setDataset(parsed);
        setActiveDatasetId('cancer_wdbc');
        setSelectedFeatures(parsed.featureColumns);
        if (parsed.featureColumns.length > 0) {
          setSelectedColorFeature(parsed.featureColumns[0]);
        }
      } else if (id.includes('wholesale')) {
        const staticRes = await fetch('/wholesale.csv');
        if (!staticRes.ok) throw new Error('Không thể tải bộ dữ liệu mẫu /wholesale.csv.');
        const text = await staticRes.text();
        const parsed = parseCSVString(text, 'Wholesale Customers');
        setDataset(parsed);
        setActiveDatasetId('wholesale_customers');
        setSelectedFeatures(parsed.featureColumns);
        if (parsed.featureColumns.length > 0) {
          setSelectedColorFeature(parsed.featureColumns[0]);
        }
      }
    } catch (err: unknown) {
      console.error('Không thể nạp bộ dữ liệu:', err);
      setNotice({ type: 'error', message: `Không thể nạp dữ liệu: ${getErrorMessage(err)}` });
    } finally {
      setIsComputing(false);
      setLoadingMessage('');
    }
  }, [resetComputationState]);

  // Rename a dataset
  const handleRenameDataset = async (id: string, newName: string) => {
    try {
      const res = await fetch(`/api/datasets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error('Không thể đổi tên bộ dữ liệu.');
      await fetchDatasetList();
      if (dataset && (activeDatasetId === id || dataset.name === newName)) {
        setDataset((prev) => (prev ? { ...prev, name: newName } : null));
      }
      setNotice({ type: 'success', message: `Đã đổi tên bộ dữ liệu thành "${newName}".` });
    } catch (err: unknown) {
      setNotice({ type: 'error', message: `Lỗi đổi tên: ${getErrorMessage(err)}` });
    }
  };

  // Delete an uploaded dataset
  const handleDeleteDataset = async (id: string) => {
    try {
      const res = await fetch(`/api/datasets/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const errMsg = isRecord(data) && typeof data.error === 'string' ? data.error : 'Không thể xóa bộ dữ liệu';
        throw new Error(errMsg);
      }
      await fetchDatasetList();
      setNotice({ type: 'success', message: 'Đã xóa bộ dữ liệu thành công.' });

      // If active dataset was deleted, switch back to cancer_wdbc
      if (activeDatasetId === id) {
        await handleSelectDataset('cancer_wdbc');
      }
    } catch (err: unknown) {
      setNotice({ type: 'error', message: `Lỗi xóa: ${getErrorMessage(err)}` });
    }
  };

  // Initial Load: Fetch list and Wisconsin Breast Cancer
  const loadInitialDataset = useCallback(async () => {
    await fetchDatasetList();
    await handleSelectDataset('cancer_wdbc');
  }, [fetchDatasetList, handleSelectDataset]);

  useEffect(() => {
    loadInitialDataset();
  }, [loadInitialDataset]);

  // Upload file directly to Backend MongoDB and switch to it
  const handleFileUpload = async (file: File) => {
    try {
      setIsComputing(true);
      setLoadingMessage('Đang kiểm tra cấu trúc CSV...');
      resetComputationState();

      const parsed = parseCSVString(await file.text(), file.name);

      const formData = new FormData();
      formData.append('file', file);

      let res: Response;
      try {
        setLoadingMessage('Đang tải CSV lên máy chủ...');
        res = await fetch('/api/datasets/upload', {
          method: 'POST',
          body: formData,
        });
      } catch (networkError: unknown) {
        console.warn('Backend không kết nối được; dùng CSV đã kiểm tra trong trình duyệt:', networkError);
        setDataset(parsed);
        setSelectedFeatures(parsed.featureColumns);
        setSelectedColorFeature(parsed.featureColumns[0] ?? '');
        setActiveDatasetId('custom_client');
        setNotice({
          type: 'info',
          message: 'CSV hợp lệ và đã được mở trong trình duyệt. Máy chủ không kết nối được nên tệp chưa được lưu vào CSDL.',
        });
        return;
      }

      if (!res.ok) {
        const errorBody: unknown = await res.json().catch(() => null);
        const message = isRecord(errorBody) && typeof errorBody.error === 'string'
          ? errorBody.error
          : `Máy chủ từ chối tệp CSV (HTTP ${res.status}).`;
        throw new Error(message);
      }

      const data: unknown = await res.json();
      if (!isDatasetDocument(data)) {
        throw new Error('Máy chủ trả về dữ liệu CSV không đúng cấu trúc.');
      }

      setDataset({
        id: data.id,
        name: data.name,
        totalRows: data.totalRows,
        headers: Object.keys(data.rawRows[0] || {}),
        idColumn: data.idColumn,
        labelColumn: data.labelColumn,
        featureColumns: data.features,
        rawRows: data.rawRows,
      });
      setActiveDatasetId(data.id);
      setSelectedFeatures(data.features);
      setSelectedColorFeature(data.features[0] ?? '');
      await fetchDatasetList();
      setNotice({ type: 'success', message: `Đã tải và lưu bộ dữ liệu "${data.name}" (${data.totalRows} dòng).` });
    } catch (err: unknown) {
      setNotice({ type: 'error', message: `Lỗi tải file: ${getErrorMessage(err)}` });
    } finally {
      setIsComputing(false);
      setLoadingMessage('');
    }
  };

  const handleLoadPreloaded = async (type: 'cancer' | 'wholesale' | 'synthetic') => {
    if (type === 'cancer') {
      await handleSelectDataset('cancer_wdbc');
    } else if (type === 'wholesale') {
      await handleSelectDataset('wholesale_customers');
    }
  };

  const handleToggleFeature = (col: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(col) ? prev.filter((f) => f !== col) : [...prev, col]
    );
  };

  const handleSelectAllFeatures = () => {
    if (dataset) setSelectedFeatures(dataset.featureColumns);
  };

  const handleDeselectAllFeatures = () => {
    setSelectedFeatures([]);
  };

  const computeCoordinates = (matrix: number[][], method: ReductionMethod): ReductionOutput => {
    if (method === 'PCA') {
      return computePCA(matrix);
    } else if (method === 't-SNE') {
      const coords = computeTSNE(matrix, {
        perplexity: reductionConfig.perplexity,
        learningRate: reductionConfig.learningRate,
        iterations: reductionConfig.iterations,
      });
      return { coordinates: coords };
    } else {
      const coords = computeUMAP(matrix, {
        nNeighbors: reductionConfig.nNeighbors,
        minDist: reductionConfig.minDist,
      });
      return { coordinates: coords };
    }
  };

  // 3. Pipeline Calculation: Can execute via Backend API or locally
  const runPipeline = useCallback(async () => {
    if (!dataset || selectedFeatures.length < MIN_NUMERIC_FEATURES || isComputing) return;

    setActiveArea('reduction');
    setIsComputing(true);
    setLoadingMessage(`Đang quét 360° & phân tích ${reductionConfig.method} 3D...`);

    const startTime = performance.now();

    try {
      const matrix = extractFeatureMatrix(
        dataset.rawRows,
        selectedFeatures,
        reductionConfig.normalization
      );
      setFeatureMatrix(matrix);

      const groundTruth: DataValue[] = dataset.labelColumn
        ? dataset.rawRows.map((r) => r[dataset.labelColumn!] ?? null)
        : [];

      let coordinates: [number, number, number][] = [];
      let expVar: [number, number, number] | undefined = undefined;
      let totalExpVar: number | undefined = undefined;
      let wasFromBackend = false;

      // 1. Fast Background Compute
      try {
        const computeRes = await fetch('/api/compute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matrix,
            groundTruth,
            reductionConfig,
            clusteringConfig: { ...clusteringConfig, method: 'None' },
          }),
        });

        if (computeRes.ok) {
          const computeData: unknown = await computeRes.json();
          const payload = isRecord(computeData) && isRecord(computeData.data) ? computeData.data : computeData;
          if (isComputeResult(payload)) {
            coordinates = payload.coordinates;
            expVar = payload.explainedVariance;
            totalExpVar = payload.totalExplainedVariance;
            if (payload.components) {
              setPcaComponents(payload.components);
            } else {
              setPcaComponents(undefined);
            }
            wasFromBackend = true;
          }
        }
      } catch {
        // Fallback to local computation
      }

      if (!wasFromBackend) {
        const primaryRes = computeCoordinates(matrix, reductionConfig.method);
        coordinates = primaryRes.coordinates;
        if (reductionConfig.method === 'PCA' && primaryRes.components) {
          setPcaComponents(primaryRes.components);
        } else {
          setPcaComponents(undefined);
        }
        expVar = primaryRes.explainedVariance;
        totalExpVar = primaryRes.totalExplainedVariance;
      }

      // Assemble Primary DataPoints
      const clusterAssignments = new Array(coordinates.length).fill(0);
      const points: DataPoint[] = dataset.rawRows.map((row, idx) => {
        const id = (dataset.idColumn ? row[dataset.idColumn] : null) ?? idx + 1;
        const label = dataset.labelColumn ? row[dataset.labelColumn] : undefined;
        const originalFeatures: Record<string, number> = {};
        for (const col of dataset.featureColumns) {
          originalFeatures[col] = Number(row[col]);
        }
        const coord = coordinates[idx] || [0, 0, 0];
        return {
          id,
          originalFeatures,
          label,
          x: coord[0],
          y: coord[1],
          z: coord[2],
          cluster: clusterAssignments[idx] ?? 0,
        };
      });

      // Detect outliers in 3D projection
      const primaryOutliers = detectOutliers3D(points);
      const outlierCount = primaryOutliers.filter(Boolean).length;
      points.forEach((p, i) => {
        p.isOutlier = primaryOutliers[i];
      });

      // Dual Viewport preparation
      let dualPoints: DataPoint[] = [];
      if (isDualView) {
        const secMethod = dualSecondaryMethod === reductionConfig.method ? (reductionConfig.method === 'PCA' ? 't-SNE' : 'PCA') : dualSecondaryMethod;
        const secondaryRes = computeCoordinates(matrix, secMethod);
        const secCoords = secondaryRes.coordinates;
        dualPoints = dataset.rawRows.map((row, idx) => {
          const id = (dataset.idColumn ? row[dataset.idColumn] : null) ?? idx + 1;
          const label = dataset.labelColumn ? row[dataset.labelColumn] : undefined;
          const originalFeatures: Record<string, number> = {};
          for (const col of dataset.featureColumns) {
            originalFeatures[col] = Number(row[col]);
          }
          const coord = secCoords[idx] || [0, 0, 0];
          return {
            id,
            originalFeatures,
            label,
            x: coord[0],
            y: coord[1],
            z: coord[2],
            cluster: clusterAssignments[idx] ?? 0,
            isOutlier: false,
          };
        });
      }

      // 2. CRITICAL: Allow the 360° camera orbit & laser scan to sweep smoothly (2200ms) with zero main-thread hitching
      const calcDuration = performance.now() - startTime;
      const remainingScanTime = Math.max(0, 2200 - calcDuration);
      if (remainingScanTime > 0) {
        await new Promise((r) => setTimeout(r, remainingScanTime));
      }

      // 3. Quét xong mới chuyển qua hình ảnh giảm chiều và phân cụm!
      setIsPruned(false);
      setPrunedCount(0);
      backupPointsRef.current = null;

      setDataPoints(points);
      if (dualPoints.length > 0) setDualDataPoints(dualPoints);

      const durationMs = Math.round(performance.now() - startTime);
      setMetrics({
        silhouetteScore: null,
        adjustedRandIndex: null,
        explainedVariance: expVar,
        totalVarianceExplained: totalExpVar,
        clusterCounts: {},
        noiseCount: 0,
        outlierCount: outlierCount,
        executionTimeMs: durationMs,
      });

      setNotice({
        type: 'success',
        message: `Đã giảm chiều 3D thành công bằng ${reductionConfig.method} (${durationMs} ms)! Quét 360° hoàn tất.`,
      });
    } catch (err: unknown) {
      console.error(err);
      setNotice({ type: 'error', message: `Lỗi tính toán: ${getErrorMessage(err)}` });
    } finally {
      setIsComputing(false);
      setLoadingMessage('');
    }
  }, [dataset, selectedFeatures, reductionConfig, clusteringConfig, isDualView, dualSecondaryMethod, isComputing]);

  useEffect(() => {
    setDataPoints([]);
    setDualDataPoints([]);
    setSelectedPoint(null);
    setPcaComponents(undefined);
    setFeatureMatrix([]);
    setMetrics({
      silhouetteScore: null,
      adjustedRandIndex: null,
      clusterCounts: {},
    });
  }, [dataset?.id, selectedFeatures, reductionConfig.method, reductionConfig.normalization]);

      const handleApplyClustering = async (config: ClusteringConfig = clusteringConfig) => {
    if (!dataset || selectedFeatures.length < MIN_NUMERIC_FEATURES || isComputing) return;

    setIsComputing(true);
    setLoadingMessage(`Đang quét 360° & phân cụm ${config.method}...`);
    const startTime = performance.now();

    try {
      let currentDataPoints = dataPoints;
      let expVar: [number, number, number] | undefined = undefined;
      let totalExpVar: number | undefined = undefined;

      // If starting from Raw Data (dataPoints is empty), compute 3D space first
      if (currentDataPoints.length === 0) {
        const matrix = extractFeatureMatrix(
          dataset.rawRows,
          selectedFeatures,
          reductionConfig.normalization
        );
        setFeatureMatrix(matrix);

        const primaryRes = computeCoordinates(matrix, reductionConfig.method);
        const coords = primaryRes.coordinates;
        expVar = primaryRes.explainedVariance;
        totalExpVar = primaryRes.totalExplainedVariance;

        if (reductionConfig.method === 'PCA' && primaryRes.components) {
          setPcaComponents(primaryRes.components);
        } else {
          setPcaComponents(undefined);
        }

        currentDataPoints = dataset.rawRows.map((row, idx) => {
          const id = (dataset.idColumn ? row[dataset.idColumn] : null) ?? idx + 1;
          const label = dataset.labelColumn ? row[dataset.labelColumn] : undefined;
          const originalFeatures: Record<string, number> = {};
          for (const col of dataset.featureColumns) {
            originalFeatures[col] = Number(row[col]);
          }
          const coord = coords[idx] || [0, 0, 0];
          return {
            id,
            originalFeatures,
            label,
            x: coord[0],
            y: coord[1],
            z: coord[2],
            cluster: 0,
          };
        });
      }

      const coordinates = currentDataPoints.map((point) => [point.x, point.y, point.z] as [number, number, number]);
      let clusterAssignments: number[];
      let noiseCount = 0;
      let isOutlierArray: boolean[] = [];

      if (config.method === 'K-Means') {
        const kmeansRes = computeKMeans(coordinates, config.k);
        clusterAssignments = kmeansRes.clusters;
        isOutlierArray = detectKMeansOutliers(
          currentDataPoints.map((p) => ({ x: p.x, y: p.y, z: p.z })),
          clusterAssignments,
          kmeansRes.centroids,
          2.5
        );
      } else if (config.method === 'DBSCAN') {
        const result = computeDBSCAN(coordinates, config.epsilon, config.minPts);
        clusterAssignments = result.clusters;
        noiseCount = result.noiseCount;
        isOutlierArray = clusterAssignments.map((c) => c === -1);
      } else {
        clusterAssignments = new Array(coordinates.length).fill(0);
        isOutlierArray = detectOutliers3D(currentDataPoints.map((p) => ({ x: p.x, y: p.y, z: p.z })));
      }

      const clusterCounts: Record<number, number> = {};
      for (const cluster of clusterAssignments) {
        if (cluster >= 0) clusterCounts[cluster] = (clusterCounts[cluster] || 0) + 1;
      }

      const totalOutliers = isOutlierArray.filter(Boolean).length;

      const groundTruth: DataValue[] = dataset?.labelColumn && dataset.rawRows.length === clusterAssignments.length
        ? dataset.rawRows.map((row) => row[dataset.labelColumn!])
        : [];
      const silhouetteScore = computeSilhouetteScore(coordinates, clusterAssignments);
      const adjustedRandIndex = groundTruth.length > 0
        ? computeARI(groundTruth, clusterAssignments)
        : null;

      // CRITICAL: Ensure the 360° camera orbit and laser scan completes smoothly (2200ms) BEFORE updating scene
      const calcDuration = performance.now() - startTime;
      const remainingScanTime = Math.max(0, 2200 - calcDuration);
      if (remainingScanTime > 0) {
        await new Promise((r) => setTimeout(r, remainingScanTime));
      }

      // Quét xong mới chuyển qua hình ảnh phân cụm!
      setActiveArea('clustering');
      setColorMode('cluster');

      const updatedPoints = currentDataPoints.map((point, index) => ({
        ...point,
        cluster: clusterAssignments[index] ?? 0,
        isOutlier: isOutlierArray[index],
      }));

      setDataPoints(updatedPoints);
      setDualDataPoints(updatedPoints);

      const durationMs = Math.round(performance.now() - startTime);
      setMetrics((current) => ({
        ...current,
        silhouetteScore,
        adjustedRandIndex,
        explainedVariance: expVar || current.explainedVariance,
        totalVarianceExplained: totalExpVar || current.totalVarianceExplained,
        clusterCounts,
        noiseCount,
        outlierCount: totalOutliers,
        executionTimeMs: (current.executionTimeMs || 0) + durationMs,
      }));

      setNotice({
        type: 'success',
        message: `Đã áp dụng phân cụm ${config.method} thành công (${durationMs} ms)! Quét 360° hoàn tất.`,
      });
    } catch (err: unknown) {
      console.error(err);
      setNotice({ type: 'error', message: `Lỗi phân cụm: ${getErrorMessage(err)}` });
    } finally {
      setIsComputing(false);
      setLoadingMessage('');
    }
  };
  const isRawDataArea = activeArea === 'dataset' && dataPoints.length === 0;
  const displayedPoints = isRawDataArea ? rawPreviewPoints : (dataPoints.length > 0 ? dataPoints : rawPreviewPoints);


  const handlePlayStory = useCallback(() => {
    if (!dataset || dataset.rawRows.length === 0) {
      setNotice({ type: 'error', message: 'Vui lòng chọn hoặc tải một bộ dữ liệu trước khi phát Data Story!' });
      return;
    }

    storyTimersRef.current.forEach((t) => clearTimeout(t));
    storyTimersRef.current = [];

    setIsStoryPlaying(true);
    setStoryStep(1);
    setNotice({
      type: 'info',
      message: '🎬 [Bước 1/5] Khởi động Data Story: Đang hiển thị Dữ liệu thô (Raw Data space)...',
    });

    // Step 1: Raw Data preview
    setDataPoints([]);
    setActiveArea('dataset');
    setColorMode('ground-truth');
    setSpotlightOutliers(false);

    // Step 2: Normalize
    const t1 = setTimeout(() => {
      setStoryStep(2);
      setReductionConfig((prev) => ({ ...prev, normalization: 'z-score' }));
      setNotice({
        type: 'info',
        message: '📐 [Bước 2/5] Chuẩn hóa dữ liệu: Áp dụng Standard Scaler (Z-Score) đa chiều...',
      });
    }, 2500);

    // Step 3: Dimensionality reduction (PCA 3D + Biplot) with 360° scan + particle morphing
    const t2 = setTimeout(async () => {
      setStoryStep(3);
      setNotice({
        type: 'info',
        message: '🚀 [Bước 3/5] Quét 360° & Chiếu PCA 3D: Camera xoay quét laser và các hạt lướt Morphing vào không gian PCA...',
      });
      setBiplotVisible(true);
      await runPipeline();
    }, 5200);

    // Step 4: Clustering
    const t3 = setTimeout(() => {
      setStoryStep(4);
      setNotice({
        type: 'info',
        message: '🔮 [Bước 4/5] Quét 360° & Phân cụm tự động: K-Means k=3 quét laser & chuyển sắc màu cụm...',
      });
      setColorMode('cluster');
      handleApplyClustering({ method: 'K-Means', k: 3, epsilon: 3.5, minPts: 5 });
    }, 10200);

    // Step 5: Spotlight Outliers
    const t4 = setTimeout(() => {
      setStoryStep(5);
      setNotice({
        type: 'info',
        message: '🔥 [Bước 5/5] Soi sáng Outliers: Kích hoạt radar beacons phát sáng tại các điểm dị biệt!',
      });
      setSpotlightOutliers(true);
    }, 15600);

    // Step 6: Complete
    const t5 = setTimeout(() => {
      setIsStoryPlaying(false);
      setStoryStep(0);
      setNotice({
        type: 'success',
        message: '✨ Data Story hoàn thành! Bạn có thể tương tác, xoay 3D hoặc click để xóa Outlier.',
      });
    }, 20500);

    storyTimersRef.current = [t1, t2, t3, t4, t5];
  }, [dataset, runPipeline]);

  useEffect(() => {
    return () => {
      storyTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // 4. LIVE OPTIMIZATION ANIMATION LOOP FOR t-SNE / UMAP
  const handleToggleLiveAnimation = () => {
    if (isLiveAnimating) {
      setIsLiveAnimating(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else {
      if (!dataset || selectedFeatures.length < MIN_NUMERIC_FEATURES) return;

      if (!liveStateRef.current || liveStateRef.current.isCompleted) {
        const matrix = extractFeatureMatrix(
          dataset.rawRows,
          selectedFeatures,
          reductionConfig.normalization
        );
        liveStateRef.current = initLiveTSNE(
          matrix,
          reductionConfig.perplexity,
          reductionConfig.learningRate,
          reductionConfig.iterations
        );
      }

      setIsLiveAnimating(true);
      runLiveLoop();
    }
  };

  const handleResetLiveAnimation = () => {
    setIsLiveAnimating(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    if (dataset && selectedFeatures.length >= MIN_NUMERIC_FEATURES) {
      const matrix = extractFeatureMatrix(
        dataset.rawRows,
        selectedFeatures,
        reductionConfig.normalization
      );
      const state = initLiveTSNE(
        matrix,
        reductionConfig.perplexity,
        reductionConfig.learningRate,
        reductionConfig.iterations
      );
      liveStateRef.current = state;
      setLiveCurrentIter(0);

      setDataPoints((prev) =>
        prev.map((pt, idx) => ({
          ...pt,
          x: state.Y[idx * 3] || 0,
          y: state.Y[idx * 3 + 1] || 0,
          z: state.Y[idx * 3 + 2] || 0,
        }))
      );
    }
  };

  const runLiveLoop = () => {
    const state = liveStateRef.current;
    if (!state || state.isCompleted) {
      setIsLiveAnimating(false);
      return;
    }

    const newCoords = stepLiveTSNE(state, 4);
    setLiveCurrentIter(state.currentIter);

    setDataPoints((prev) =>
      prev.map((pt, idx) => {
        const c = newCoords[idx] || [0, 0, 0];
        return {
          ...pt,
          x: c[0],
          y: c[1],
          z: c[2],
        };
      })
    );

    if (!state.isCompleted) {
      animFrameRef.current = requestAnimationFrame(runLiveLoop);
    } else {
      setIsLiveAnimating(false);
    }
  };

  // 5. Throttled Dual Viewport Camera Synchronization
  const handlePrimaryCameraChange = useCallback((camPos: THREE.Vector3, targetPos: THREE.Vector3) => {
    if (isDualView) {
      if (syncRafRef.current) return;
      syncRafRef.current = requestAnimationFrame(() => {
        setSyncedCamPos(camPos.clone());
        setSyncedTargetPos(targetPos.clone());
        syncRafRef.current = null;
      });
    }
  }, [isDualView]);


  // 5b. Prune Outliers & Restore Dataset Points
  const handlePruneOutliers = useCallback(() => {
    if (dataPoints.length === 0) return;

    const filtered = dataPoints.filter((p) => !p.isOutlier && p.cluster !== -1);
    const filteredDual = dualDataPoints.filter((p) => !p.isOutlier && p.cluster !== -1);
    const removed = dataPoints.length - filtered.length;

    if (removed === 0) {
      setNotice({ type: 'info', message: 'Không phát hiện điểm nhiễu nào cần lọc trong không gian 3D.' });
      return;
    }

    backupPointsRef.current = { primary: [...dataPoints], dual: [...dualDataPoints] };
    setDataPoints(filtered);
    setDualDataPoints(filteredDual);
    setIsPruned(true);
    setPrunedCount(removed);

    // Recalculate metrics for cleaned dataset
    const coords = filtered.map((p) => [p.x, p.y, p.z] as [number, number, number]);
    const clusters = filtered.map((p) => p.cluster);
    const silhouette = computeSilhouetteScore(coords, clusters);

    setMetrics((prev) => ({
      ...prev,
      silhouetteScore: silhouette,
      outlierCount: 0,
      noiseCount: 0,
    }));

    setNotice({
      type: 'success',
      message: `Đã lọc bỏ thành công ${removed} điểm ngoại lai/nhiễu! Bộ dữ liệu hiện tại còn ${filtered.length} điểm.`,
    });
  }, [dataPoints, dualDataPoints]);

  const handleRestorePoints = useCallback(() => {
    if (!backupPointsRef.current) return;
    const restoredPoints = backupPointsRef.current.primary;
    const restoredCount = restoredPoints.length;
    const restoredDual = backupPointsRef.current.dual;
    const outlierFlags = detectOutliers3D(restoredPoints);
    setDataPoints(restoredPoints);
    setDualDataPoints(restoredDual);
    backupPointsRef.current = null;
    setIsPruned(false);
    setPrunedCount(0);
    setMetrics((prev) => ({
      ...prev,
      outlierCount: outlierFlags.filter(Boolean).length,
    }));

    setNotice({
      type: 'info',
      message: `Đã khôi phục lại dữ liệu ban đầu (${restoredCount} điểm).`,
    });
  }, []);


  const handleDeleteSinglePoint = useCallback(
    (pointId: string | number | boolean) => {
      if (dataPoints.length === 0) return;
      if (!backupPointsRef.current) {
        backupPointsRef.current = { primary: [...dataPoints], dual: [...dualDataPoints] };
      }
      const filtered = dataPoints.filter((p) => p.id !== pointId);
      const filteredDual = dualDataPoints.filter((p) => p.id !== pointId);

      setDataPoints(filtered);
      setDualDataPoints(filteredDual);
      setIsPruned(true);
      setPrunedCount((prev) => prev + 1);
      setSelectedPoint(null);

      const coords = filtered.map((p) => [p.x, p.y, p.z] as [number, number, number]);
      const clusters = filtered.map((p) => p.cluster);
      const silhouette = computeSilhouetteScore(coords, clusters);
      const outlierFlags = detectOutliers3D(filtered);

      setMetrics((prev) => ({
        ...prev,
        silhouetteScore: silhouette,
        outlierCount: outlierFlags.filter(Boolean).length,
      }));

      setNotice({
        type: 'info',
        message: `Đã loại bỏ điểm ID ${String(pointId)} khỏi không gian 3D.`,
      });
    },
    [dataPoints, dualDataPoints]
  );

  // 6. Save Experiment to MongoDB
  const handleSaveExperiment = async () => {
    if (!dataset) return;
    try {
      setIsSavingExperiment(true);
      const res = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: dataset.name,
          datasetName: dataset.name,
          reductionMethod: reductionConfig.method,
          clusteringMethod: clusteringConfig.method,
          k: clusteringConfig.k,
          silhouetteScore: metrics.silhouetteScore,
          ari: metrics.adjustedRandIndex,
          params: {
            reduction: reductionConfig,
            clustering: clusteringConfig,
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`Máy chủ từ chối lưu thí nghiệm (HTTP ${res.status}).`);
      }
      setNotice({ type: 'success', message: 'Đã lưu kết quả thí nghiệm thành công.' });
      await fetchExperiments();
    } catch (e: unknown) {
      setNotice({ type: 'error', message: `Không thể lưu thí nghiệm: ${getErrorMessage(e)}` });
    } finally {
      setIsSavingExperiment(false);
    }
  };

  const fetchExperiments = async () => {
    try {
      const res = await fetch('/api/experiments');
      if (!res.ok) {
        throw new Error(`Không thể tải lịch sử (HTTP ${res.status}).`);
      }
      const data: unknown = await res.json();
      if (!Array.isArray(data) || !data.every(isExperimentRecord)) {
        throw new Error('Dữ liệu lịch sử từ máy chủ không đúng định dạng.');
      }
      setExperiments(data);
    } catch (e: unknown) {
      console.error('Không thể tải lịch sử thí nghiệm:', e);
      setNotice({ type: 'error', message: `Không thể tải lịch sử: ${getErrorMessage(e)}` });
    }
  };

  const handleOpenHistory = () => {
    fetchExperiments();
    setIsExperimentsModalOpen(true);
  };

  // 7. EXPORT ENRICHED CSV WITH 3D COORDINATES & PREDICTED CLUSTERS
  const handleExportCSV = () => {
    if (!dataset || dataPoints.length === 0) return;

    try {
      const rowsToExport = dataPoints.map((pt) => {
        return {
          id: pt.id,
          label_ground_truth: pt.label ?? '',
          predicted_cluster: pt.cluster === -1 ? 'Noise' : pt.cluster,
          coord_x_3d: Number(pt.x.toFixed(4)),
          coord_y_3d: Number(pt.y.toFixed(4)),
          coord_z_3d: Number(pt.z.toFixed(4)),
          ...pt.originalFeatures,
        };
      });

      const csvContent = Papa.unparse(rowsToExport);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${dataset.name.replace(/\s+/g, '_')}_3D_Clustered_Results.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setNotice({ type: 'error', message: `Lỗi xuất file CSV: ${getErrorMessage(e)}` });
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans select-none bg-[#0D1117] text-[#E6EAF0]">
      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
          className={`absolute top-3 right-3 z-[70] flex max-w-md items-center gap-2.5 rounded border px-3 py-2 text-xs shadow-lg backdrop-blur-md ${
            notice.type === 'error'
              ? 'border-[#7f1d1d] bg-[#2d1b1f] text-[#f87171]'
              : notice.type === 'success'
                ? 'border-[#065f46] bg-[#162a23] text-[#34d399]'
                : 'border-[#303A49] bg-[#151B23] text-[#E6EAF0]'
          }`}
        >
          <span className="flex-1">{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 font-bold px-1 text-current/70 hover:text-current"
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}
      {/* 1. Control Sidebar */}
      <ControlSidebar
        datasetName={dataset ? dataset.name : 'Đang tải...'}
        totalRows={dataset ? dataset.totalRows : 0}
        rawRows={dataset?.rawRows ?? []}
        headers={dataset?.headers ?? []}
        featureColumns={dataset ? dataset.featureColumns : []}
        selectedFeatures={selectedFeatures}
        onToggleFeature={handleToggleFeature}
        onSelectAllFeatures={handleSelectAllFeatures}
        onDeselectAllFeatures={handleDeselectAllFeatures}
        reductionConfig={reductionConfig}
        onChangeReductionConfig={setReductionConfig}
        clusteringConfig={clusteringConfig}
        onChangeClusteringConfig={setClusteringConfig}
        colorMode={colorMode}
        onChangeColorMode={setColorMode}
        selectedColorFeature={selectedColorFeature}
        onChangeSelectedColorFeature={setSelectedColorFeature}
        onFileUpload={handleFileUpload}
        onLoadPreloadedDataset={handleLoadPreloaded}
        isComputing={isComputing}
        hasResults={dataPoints.length > 0}
        onActiveTabChange={setActiveArea}
        onRunComputation={runPipeline}
        onApplyClustering={handleApplyClustering}
        isDualView={isDualView}
        onToggleDualView={() => setIsDualView(!isDualView)}
        dualSecondaryMethod={dualSecondaryMethod}
        onChangeDualSecondaryMethod={(m) => {
          setDualSecondaryMethod(m);
        }}
        isLiveAnimating={isLiveAnimating}
        onToggleLiveAnimation={handleToggleLiveAnimation}
        onResetLiveAnimation={handleResetLiveAnimation}
        liveCurrentIter={liveCurrentIter}
        liveMaxIter={reductionConfig.iterations}
        onExportCSV={handleExportCSV}
        dbStatus={dbStatus}
        onOpenElbowModal={() => setIsElbowModalOpen(true)}
        onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
        pcaComponents={pcaComponents}
        explainedVariance={metrics.explainedVariance}
        totalVarianceExplained={metrics.totalVarianceExplained}
        biplotVisible={biplotVisible}
        onToggleBiplot={() => setBiplotVisible(!biplotVisible)}
        biplotTopK={biplotTopK}
        onChangeBiplotTopK={setBiplotTopK}
        biplotScale={biplotScale}
        onChangeBiplotScale={setBiplotScale}
        datasetList={datasetList}
        activeDatasetId={activeDatasetId}
        onSelectDataset={handleSelectDataset}
        onRenameDataset={handleRenameDataset}
        onDeleteDataset={handleDeleteDataset}
        onOpenRawDataModal={() => setIsRawDataModalOpen(true)}
        onOpenDatasetManager={() => setIsDatasetManagerOpen(true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* 2. Main 3D Viewport Area */}
      <div className="flex-1 min-w-0 relative flex flex-col h-full overflow-hidden">

        {/* Harmonious Scientific Data Story Control Bar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-[#151B23]/95 border border-[#303A49] backdrop-blur-md px-2.5 py-1 rounded-md shadow-lg shadow-black/40 text-xs">
          <button
            type="button"
            onClick={isStoryPlaying ? handleStopStory : handlePlayStory}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-all border ${
              isStoryPlaying
                ? 'bg-[#2d1b1f] hover:bg-[#3d242a] text-[#f87171] border-[#7f1d1d]'
                : 'bg-[#202936] hover:bg-[#283547] text-[#E6EAF0] border-[#303A49] hover:border-[#8B9CFB]/60'
            }`}
          >
            {isStoryPlaying ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#f87171] animate-ping" />
                <Square size={11} className="fill-current" />
                <span>Dừng Story</span>
              </>
            ) : (
              <>
                <Play size={11} className="text-[#8B9CFB] fill-[#8B9CFB]/30" />
                <span>Play Data Story</span>
              </>
            )}
          </button>

          {/* Stepper Timeline: Seamlessly integrated, active only when playing */}
          {isStoryPlaying ? (
            <div className="flex items-center gap-1 text-[10px] pl-1.5 border-l border-[#303A49] animate-in fade-in duration-200">
              {[
                { step: 1, label: 'Thô' },
                { step: 2, label: 'Scale' },
                { step: 3, label: 'PCA' },
                { step: 4, label: 'K-Means' },
                { step: 5, label: 'Outlier' },
              ].map(({ step, label }) => (
                <span
                  key={step}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    storyStep === step
                      ? 'bg-[#202936] text-[#8B9CFB] border border-[#8B9CFB] font-bold shadow-xs'
                      : storyStep > step
                        ? 'bg-[#162a23] text-[#34d399] border border-[#065f46]'
                        : 'bg-[#0D1117] text-[#929EAF]/50 border border-transparent'
                  }`}
                >
                  {step}. {label}
                </span>
              ))}
            </div>
          ) : (
            <span className="hidden md:inline text-[10px] text-[#929EAF] font-mono px-1 border-l border-[#303A49]">
              5 bước tự động
            </span>
          )}
        </div>

        {/* Single vs Dual Viewport Rendering */}
        <div className="min-h-0 flex-1 w-full flex">
          {/* Viewport 1 (Primary) */}
          <div className="flex-1 h-full relative">
            {displayedPoints.length > 0 ? (
              <Suspense
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-[#929EAF]" role="status">
                    Đang khởi tạo Three.js Engine...
                  </div>
                }
              >
                <ThreeCanvas
                  dataPoints={displayedPoints}
                  colorMode={colorMode}
                  selectedFeature={selectedColorFeature}
                  onSelectPoint={setSelectedPoint}
                  selectedPoint={selectedPoint}
                  reductionMethod={isRawDataArea ? 'RAW' : reductionConfig.method}
                  onCameraChange={handlePrimaryCameraChange}
                  titleBadge={isRawDataArea ? 'DỮ LIỆU GỐC (3D TRỤC ĐẶC TRƯNG)' : isDualView ? `MÀN HÌNH A: ${reductionConfig.method} 3D` : undefined}
                  axisFeatures={isRawDataArea ? selectedFeatures.slice(0, 3) : undefined}
                  pcaComponents={isRawDataArea ? undefined : pcaComponents}
                  featureNames={selectedFeatures}
                  showBiplot={biplotVisible}
                  onToggleBiplot={handleToggleBiplot}
                  biplotTopK={biplotTopK}
                  biplotScale={biplotScale}
                  theme={theme}
                  onToggleTheme={handleToggleTheme}
                  showOutliersSpotlight={spotlightOutliers}
                  onToggleOutliersSpotlight={() => setSpotlightOutliers((prev) => !prev)}
                  isComputing={isComputing}
                />
              </Suspense>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-[#929EAF]">
                {dataset
                  ? 'Chọn ít nhất 3 đặc trưng số để trực quan hóa dữ liệu trên biểu đồ 3D.'
                  : 'Vui lòng chọn bộ dữ liệu để bắt đầu phân tích.'}
              </div>
            )}
          </div>

          {/* Viewport 2 (Dual Secondary with Camera Synchronization) */}
          {isDualView && !isRawDataArea && (
            <div className="flex-1 h-full relative border-l border-[#303A49]">
              <Suspense
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-[#929EAF]" role="status">
                    Đang tải bộ máy đồ họa 3D...
                  </div>
                }
              >
                <ThreeCanvas
                  dataPoints={dualDataPoints.length > 0 ? dualDataPoints : dataPoints}
                  colorMode={colorMode}
                  selectedFeature={selectedColorFeature}
                  onSelectPoint={setSelectedPoint}
                  selectedPoint={selectedPoint}
                  reductionMethod={dualSecondaryMethod}
                  syncCameraPos={syncedCamPos}
                  syncTargetPos={syncedTargetPos}
                  titleBadge={`MÀN HÌNH B: ${dualSecondaryMethod} 3D (Đồng bộ)`}
                  theme={theme}
                  onToggleTheme={handleToggleTheme}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* Cyber Laser Scanning HUD Indicator (Allows full visibility of 3D scanning beam) */}
        {isComputing && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-center gap-3 px-4 py-2 rounded-full border border-[#38bdf8]/60 bg-[#0D1117]/85 backdrop-blur-md shadow-2xl shadow-cyan-500/25 animate-in fade-in duration-200">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#38bdf8] border-t-transparent animate-spin" />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#38bdf8] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-ping" />
                AI Laser Grid Scanning...
              </span>
              <span className="text-[10px] text-[#929EAF]">
                {loadingMessage || 'Đang quét và phân tích ma trận dữ liệu 3D'}
              </span>
            </div>
          </div>
        )}

        {/* Selected Data Point Inspector */}
        <DataInspector
          point={selectedPoint}
          onClose={() => setSelectedPoint(null)}
          onDeletePoint={handleDeleteSinglePoint}
          theme={theme}
        />

        {/* Docked Results Panel at Bottom */}
        <div className="shrink-0 border-t border-[#303A49] bg-[#151B23]">
          <MetricsPanel
            metrics={metrics}
            reductionMethod={reductionConfig.method}
            clusteringMethod={clusteringConfig.method}
            datasetName={dataset ? dataset.name : 'Chưa chọn'}
            totalRows={dataset ? dataset.totalRows : 0}
            hasGroundTruth={Boolean(dataset?.labelColumn)}
            hasResults={dataPoints.length > 0}
            isComputing={isComputing}
            normalization={reductionConfig.normalization}
            onPruneOutliers={handlePruneOutliers}
            onRestorePoints={handleRestorePoints}
            isPruned={isPruned}
            prunedCount={prunedCount}
            dataPoints={dataPoints}
            onSelectPoint={setSelectedPoint}
            onDeletePoint={handleDeleteSinglePoint}
            onSaveExperiment={handleSaveExperiment}
            onOpenHistory={handleOpenHistory}
            isSaving={isSavingExperiment}
            theme={theme}
          />
        </div>
      </div>

      {/* Experiments History Modal */}
      {isExperimentsModalOpen && (
        <Suspense fallback={null}>
          <ExperimentsModal
            isOpen={isExperimentsModalOpen}
            onClose={() => setIsExperimentsModalOpen(false)}
            experiments={experiments}
            onRefresh={fetchExperiments}
          />
        </Suspense>
      )}

      {/* Elbow Method & Silhouette Analysis Modal */}
      {isElbowModalOpen && (
        <Suspense fallback={null}>
          <ElbowModal
            isOpen={isElbowModalOpen}
            onClose={() => setIsElbowModalOpen(false)}
            featureMatrix={featureMatrix.length > 0 ? featureMatrix : (dataset ? extractFeatureMatrix(dataset.rawRows, selectedFeatures, reductionConfig.normalization) : [])}
            currentK={clusteringConfig.k}
            onApplyK={(k) => {
              const updatedConfig = { ...clusteringConfig, k };
              setClusteringConfig(updatedConfig);
              if (dataPoints.length > 0) handleApplyClustering(updatedConfig);
            }}
            theme={theme}
          />
        </Suspense>
      )}

      {/* Security Center & LAN Sharing Modal */}
      {isSecurityModalOpen && (
        <Suspense fallback={null}>
          <SecurityModal
            isOpen={isSecurityModalOpen}
            onClose={() => setIsSecurityModalOpen(false)}
            dbStatus={dbStatus}
            onRefreshDb={async () => {
              try {
                const res = await fetch('/api/health');
                if (res.ok) {
                  const data = await res.json();
                  setDbStatus(data.database || 'Online');
                }
              } catch (e) {
                setDbStatus('In-Memory Mode');
              }
            }}
          />
        </Suspense>
      )}

      {/* Full-Screen Raw Data Preview Modal */}
      {isRawDataModalOpen && dataset && (
        <RawDataModal
          isOpen={isRawDataModalOpen}
          onClose={() => setIsRawDataModalOpen(false)}
          datasetName={dataset.name}
          headers={dataset.headers}
          rawRows={dataset.rawRows}
          totalRows={dataset.totalRows}
          labelColumn={dataset.labelColumn ?? null}
          theme={theme}
        />
      )}

      {/* Dataset Manager Folder Modal */}
      {isDatasetManagerOpen && (
        <DatasetManagerModal
          isOpen={isDatasetManagerOpen}
          onClose={() => setIsDatasetManagerOpen(false)}
          datasetList={datasetList}
          activeDatasetId={activeDatasetId}
          onSelectDataset={(id) => {
            handleSelectDataset(id);
            setIsDatasetManagerOpen(false);
          }}
          onRenameDataset={handleRenameDataset}
          onDeleteDataset={handleDeleteDataset}
          onFileUpload={(file) => {
            handleFileUpload(file);
          }}
          isComputing={isComputing}
          theme={theme}
        />
      )}
    </div>
  );
}

export default App;
