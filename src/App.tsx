import { analysisReport, csvText, downloadText, resultRows, safeFilename } from './utils/exportData';
import { experimentConfiguration } from './utils/history';
import { fetchWithTimeout } from './utils/network';
import { ExportModal } from './components/ExportModal';
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
import { AnalysisSnapshot, reductionKey, describeRun, normalizationLabels, pendingAnalysisChanges, reduceMatrix, makePoints, clusterPoints, focusPoints, evaluatePointSet } from './utils/exploration';
import { ClusterFocus } from './components/ClusterFocus';
import { WorkspaceLayout, workspacePages } from './components/WorkspaceLayout';
import type { WorkspacePage as WorkspaceRoute } from './components/WorkspaceLayout';
import { WorkspacePage } from './components/WorkspacePage';
import { MetricsPanel } from './components/MetricsPanel';
import { DataInspector } from './components/DataInspector';
import { RawDataModal } from './components/RawDataModal';
import { DatasetsPage } from './components/DatasetsPage';
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
const ExperimentsPage = lazy(() =>
  import('./components/ExperimentsPage').then((module) => ({ default: module.ExperimentsPage }))
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

function readWorkspacePage(): WorkspaceRoute {
  return workspacePages.find(page => window.location.hash === '#/' + page) ?? 'explore';
}

function openWorkspacePage(page: WorkspaceRoute) {
  window.location.hash = '/' + page;
}

export function App({ onSignOut }: { onSignOut?: () => void }) {
  const [page, setPage] = useState(readWorkspacePage);
  const exploring = page === 'explore';
  useEffect(() => {
    const syncPage = () => setPage(readWorkspacePage());
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const primarySnapshotRef = useRef<(() => void) | null>(null);
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
        rowIndex: index,
        cluster: 0,
      };
    });
  }, [dataset, selectedFeatures]);
  const [analyzingRun, setAnalyzingRun] = useState<AnalysisSnapshot | null>(null);
  const [livePreview, setLivePreview] = useState<DataPoint[] | null>(null);
  const [completedRun, setCompletedRun] = useState<AnalysisSnapshot | null>(null);
  const [focusedCluster, setFocusedCluster] = useState<number | null>(null);
  const operationRef = useRef(0);
  const computingRef = useRef(false);
  const computeAbortRef = useRef<AbortController | null>(null);
  const localDatasets = useRef(new Map<string, ParsedDataset>());
  const [selectedPoint, setSelectedPoint] = useState<DataPoint | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyRequestRef = useRef(0);
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [dbStatus, setDbStatus] = useState<string>('Checking connection…');
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Dataset Management & Theme State
  const [datasetList, setDatasetList] = useState<DatasetSummary[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string>('cancer_wdbc');
  const [isRawDataModalOpen, setIsRawDataModalOpen] = useState<boolean>(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
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
  const [spotlightOutliers, setSpotlightOutliers] = useState<boolean>(false);

  // Data Story Mode State
  const [isStoryPlaying, setIsStoryPlaying] = useState<boolean>(false);
  const [storyStep, setStoryStep] = useState<number>(0);
  const storyTimersRef = useRef<NodeJS.Timeout[]>([]);

  const handleStopStory = useCallback(() => {
    storyTimersRef.current.forEach((t) => clearTimeout(t));
    storyTimersRef.current = [];
    setIsStoryPlaying(false);
    setStoryStep(0);
    setNotice({ type: 'info', message: 'Data Story stopped.' });
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
    if (!notice || notice.type === 'error') return;
    const timeout = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const reductionDirty = Boolean(completedRun && reductionKey(completedRun.features, completedRun.reduction) !== reductionKey(selectedFeatures, reductionConfig));
  const pendingChanges = completedRun ? pendingAnalysisChanges(completedRun, {
    datasetId: activeDatasetId, features: selectedFeatures, reduction: reductionConfig, clustering: clusteringConfig,
  }) : [];
  const resultsDirty = pendingChanges.length > 0;
  const previousResult = Boolean(completedRun && (resultsDirty || analyzingRun || analysisError));
  const hasClustering = completedRun !== null && completedRun.clustering.method !== 'None';
  const resultMethod = completedRun?.reduction.method ?? reductionConfig.method;
  const handleSelectPoint = useCallback((point: DataPoint | null) => setSelectedPoint(point), []);

  // Check Database connection health periodically
  useEffect(() => {
    const checkDbHealth = async () => {
      try {
        const res = await fetchWithTimeout('/api/health');
        if (res.ok) {
          const data: unknown = await res.json();
          setDbStatus(isRecord(data) && typeof data.database === 'string' ? data.database : 'Online');
        }
      } catch {
        setDbStatus('Browser only');
      }
    };
    checkDbHealth();
    const interval = setInterval(checkDbHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Reset all computation & analytical states to ensure 100% data consistency
  const resetComputationState = useCallback(() => {
    operationRef.current++; computeAbortRef.current?.abort(); computingRef.current = false;
    setAnalysisError(null); setAnalyzingRun(null); setIsExportModalOpen(false); setLivePreview(null);
    setCompletedRun(null); setFocusedCluster(null); setIsPruned(false); setPrunedCount(0); backupPointsRef.current = null;
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

  // Datasets kept in this tab remain selectable even when the server is unavailable.
  const builtinDatasets: DatasetSummary[] = [
    { id: 'cancer_wdbc', name: 'Wisconsin Breast Cancer', filename: 'data.csv', total_rows: 569, features_count: 30, label_column: 'diagnosis', id_column: 'id', created_at: '2024-01-01', is_preloaded: true },
    { id: 'wholesale_customers', name: 'Wholesale Customers', filename: 'wholesale.csv', total_rows: 440, features_count: 7, label_column: 'Channel', id_column: null, created_at: '2024-01-02', is_preloaded: true },
  ];
  const fetchDatasetList = useCallback(async () => {
    let list: DatasetSummary[] = [];
    try {
      const res = await fetchWithTimeout('/api/datasets');
      if (res.ok) {
        const response: unknown = await res.json();
        const body = isRecord(response) && 'data' in response ? response.data : response;
        if (Array.isArray(body)) list = body.filter(isDatasetSummary);
      }
    } catch { /* Use the built-in files and datasets held in this tab. */ }
    const merged = new Map(builtinDatasets.map(item => [item.id, item]));
    list.forEach(item => merged.set(item.id, item));
    localDatasets.current.forEach((item, id) => merged.set(id, { id, name: item.name, filename: item.name,
      total_rows: item.totalRows, features_count: item.featureColumns.length, label_column: item.labelColumn,
      id_column: item.idColumn, created_at: new Date().toISOString(), is_local: true }));
    setDatasetList([...merged.values()]);
  }, []);

  const datasetRequestRef = useRef(0);
  const activateDataset = (parsed: ParsedDataset, id: string) => {
    resetComputationState();
    setDataset({ ...parsed, id }); setActiveDatasetId(id);
    setSelectedFeatures(parsed.featureColumns); setSelectedColorFeature(parsed.featureColumns[0] ?? '');
  };
  const handleSelectDataset = useCallback(async (id: string) => {
    const request = ++datasetRequestRef.current;
    operationRef.current++;
    computeAbortRef.current?.abort();
    computingRef.current = false;
    setAnalyzingRun(null);
    setIsExportModalOpen(false);
    setIsComputing(true); setLoadingMessage('Loading dataset…');
    try {
      let parsed = localDatasets.current.get(id);
      if (!parsed) {
        try {
          const response = await fetchWithTimeout('/api/datasets/' + encodeURIComponent(id));
          if (response.ok) {
            const body: unknown = await response.json();
            const data = isRecord(body) && 'data' in body ? body.data : body;
            if (isDatasetDocument(data)) parsed = { id: data.id, name: data.name, totalRows: data.totalRows,
              headers: Object.keys(data.rawRows[0] ?? {}), idColumn: data.idColumn, labelColumn: data.labelColumn,
              featureColumns: data.features, rawRows: data.rawRows };
          }
        } catch { /* Static sample fallback below. */ }
      }
      if (!parsed && (id === 'cancer_wdbc' || id === 'wholesale_customers')) {
        const cancer = id === 'cancer_wdbc';
        const response = await fetchWithTimeout(cancer ? '/data.csv' : '/wholesale.csv');
        if (!response.ok) throw new Error('Could not load the sample dataset.');
        parsed = parseCSVString(await response.text(), cancer ? 'Wisconsin Breast Cancer' : 'Wholesale Customers');
      }
      if (!parsed) throw new Error('This dataset is no longer available.');
      if (request !== datasetRequestRef.current) return;
      activateDataset(parsed, id);
      return true;

    } catch (error) {
      if (request === datasetRequestRef.current) setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      if (request === datasetRequestRef.current) { setIsComputing(false); setLoadingMessage(''); }
    }
  }, [resetComputationState]);

  // Rename a dataset
  const handleRenameDataset = async (id: string, newName: string) => {
    try {
      const local = localDatasets.current.get(id);
      if (local) {
        localDatasets.current.set(id, { ...local, name: newName });
        if (activeDatasetId === id) setDataset({ ...local, name: newName });
        await fetchDatasetList(); return;
      }
      const res = await fetchWithTimeout(`/api/datasets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error('Could not rename the dataset.');
      await fetchDatasetList();
      if (dataset && (activeDatasetId === id || dataset.name === newName)) {
        setDataset((prev) => (prev ? { ...prev, name: newName } : null));
      }
      setNotice({ type: 'success', message: `Renamed dataset to "${newName}".` });
    } catch (err: unknown) {
      setNotice({ type: 'error', message: `Could not rename dataset: ${getErrorMessage(err)}` });
    }
  };

  // Delete an uploaded dataset
  const handleDeleteDataset = async (id: string) => {
    try {
      if (localDatasets.current.delete(id)) {
        await fetchDatasetList();
        if (activeDatasetId === id) await handleSelectDataset('cancer_wdbc');
        return;
      }
      const res = await fetchWithTimeout(`/api/datasets/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const errMsg = isRecord(data) && typeof data.error === 'string' ? data.error : 'Could not delete the dataset';
        throw new Error(errMsg);
      }
      await fetchDatasetList();
      setNotice({ type: 'success', message: 'Dataset deleted.' });

      // If active dataset was deleted, switch back to cancer_wdbc
      if (activeDatasetId === id) {
        await handleSelectDataset('cancer_wdbc');
      }
    } catch (err: unknown) {
      setNotice({ type: 'error', message: `Could not delete dataset: ${getErrorMessage(err)}` });
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

  const handleFileUpload = async (file: File) => {
    if (isComputing) return;
    const request = ++datasetRequestRef.current;
    setNotice(null);
    setIsComputing(true); setLoadingMessage('Checking CSV…');
    try {
      const parsed = parseCSVString(await file.text(), file.name);
      if (request !== datasetRequestRef.current) return;
      const openLocally = async () => {
        if (request !== datasetRequestRef.current) return;
        const id = 'local_' + crypto.randomUUID();
        localDatasets.current.set(id, { ...parsed, id });
        activateDataset(parsed, id);
        await fetchDatasetList();
        setNotice({ type: 'info', message: 'CSV opened for this session. The server is unavailable.' });
      };
      const form = new FormData(); form.append('file', file);
      let response: Response;
      try { response = await fetchWithTimeout('/api/datasets/upload', { method: 'POST', body: form }); }
      catch { await openLocally(); return; }
      if ([502, 503, 504].includes(response.status) || (response.status === 500 && !response.headers.get('content-type')?.includes('application/json'))) { await openLocally(); return; }
      const body: unknown = await response.json();
      if (!response.ok) {
        const error = isRecord(body) ? body.error : undefined;
        throw new Error(isRecord(error) && typeof error.message === 'string' ? error.message : 'The server rejected the CSV (HTTP ' + response.status + ').');
      }
      const data = isRecord(body) && 'data' in body ? body.data : body;
      if (!isDatasetDocument(data)) throw new Error('The server returned an invalid dataset.');
      if (request !== datasetRequestRef.current) return;
      activateDataset({ ...parsed, name: data.name, rawRows: data.rawRows, featureColumns: data.features,
        idColumn: data.idColumn, labelColumn: data.labelColumn }, data.id);
      await fetchDatasetList();
      setNotice({ type: 'success', message: 'Imported ' + data.name + ' (' + data.totalRows + ' rows).' });
    } catch (error) {
      if (request === datasetRequestRef.current) setNotice({ type: 'error', message: 'Could not open CSV: ' + getErrorMessage(error) });
    } finally {
      if (request === datasetRequestRef.current) { setIsComputing(false); setLoadingMessage(''); }
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

  // A run owns one immutable configuration snapshot; focus is presentation only.
  const executeAnalysis = async (clusterConfig: ClusteringConfig, reuseEmbedding = false) => {
    if (!dataset || selectedFeatures.length < MIN_NUMERIC_FEATURES || isComputing || computingRef.current) return;
    const run: AnalysisSnapshot = { datasetId: activeDatasetId, features: [...selectedFeatures],
      reduction: { ...reductionConfig }, clustering: { ...clusterConfig } };
    const token = ++operationRef.current;
    const controller = new AbortController();
    computeAbortRef.current?.abort();
    computeAbortRef.current = controller;
    computingRef.current = true;
    setAnalysisError(null);
    setAnalyzingRun(run);
    setLivePreview(null);
    setLoadingMessage('Preparing data…');
    setIsComputing(true);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setIsLiveAnimating(false);
    liveStateRef.current = null;
    const started = performance.now();
    // Yield before synchronous local work so the loading state is painted.
    await new Promise<void>(resolve => requestAnimationFrame(() => { setTimeout(resolve, 0); }));
    try {
      let points = dataPoints;
      let matrix: number[][] | undefined;
      let components = pcaComponents;
      let explainedVariance = metrics.explainedVariance;
      let totalVariance = metrics.totalVarianceExplained;
      if (!reuseEmbedding || reductionDirty || points.length === 0) {
        setLoadingMessage('Running ' + run.reduction.method + '…');
        matrix = extractFeatureMatrix(dataset.rawRows, run.features, run.reduction.normalization);
        let output: ReductionOutput | undefined;
        try {
          const response = await fetchWithTimeout('/api/compute', { method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matrix,
              groundTruth: dataset.labelColumn ? dataset.rawRows.map(row => row[dataset.labelColumn!] ?? null) : [],
              reductionConfig: run.reduction, clusteringConfig: { ...run.clustering, method: 'None' } }) });
          if (response.ok) {
            const body: unknown = await response.json();
            const payload = isRecord(body) && 'data' in body ? body.data : body;
            if (isComputeResult(payload)) output = payload;
          }
        } catch (error) { if (controller.signal.aborted) throw error; }
        if (token !== operationRef.current) return;
        if (!output) {
          setLoadingMessage('Running ' + run.reduction.method + ' in your browser…');
          await new Promise<void>(resolve => requestAnimationFrame(() => { setTimeout(resolve, 0); }));
          if (token !== operationRef.current) return;
          output = reduceMatrix(matrix, run.reduction);
        }
        points = makePoints(dataset, output.coordinates);
        components = output.components;
        explainedVariance = output.explainedVariance;
        totalVariance = output.totalExplainedVariance;
      }
      setLoadingMessage(run.clustering.method === 'None' ? 'Updating results…' : 'Clustering with ' + run.clustering.method + '…');
      const result = clusterPoints(points, run.clustering, Boolean(dataset.labelColumn));
      if (token !== operationRef.current) return;
      if (matrix) {
        setFeatureMatrix(matrix);
        setIsPruned(false); setPrunedCount(0); backupPointsRef.current = null;
        setDualDataPoints([]);
      }
      setPcaComponents(components);
      setFocusedCluster(null);
      setSelectedPoint(null);
      setDataPoints(result.points);
      setMetrics({ ...result.metrics, explainedVariance, totalVarianceExplained: totalVariance,
        executionTimeMs: Math.round(performance.now() - started) });
      setCompletedRun(run);
      setColorMode(run.clustering.method === 'None' ? 'ground-truth' : 'cluster');
      setNotice({ type: 'success', message: run.clustering.method === 'None'
        ? 'Projection complete: ' + run.reduction.method + '. You can now apply clustering.'
        : 'Finished ' + run.reduction.method + ' → ' + run.clustering.method + '. Select a cluster to explore.' });
    } catch (error: unknown) {
      if (token === operationRef.current && !controller.signal.aborted) setAnalysisError(getErrorMessage(error));
    } finally {
      if (token === operationRef.current) {
        computingRef.current = false; setAnalyzingRun(null); setIsComputing(false); setLoadingMessage('');
      }
    }
  };

  const runPipeline = async () => executeAnalysis({ ...clusteringConfig, method: 'None' });
  const handleApplyClustering = async (config: ClusteringConfig = clusteringConfig) => executeAnalysis(config, true);
  useEffect(() => () => { operationRef.current++; computeAbortRef.current?.abort(); }, []);

  const isRawDataArea = completedRun === null;
  const displayedPoints = livePreview ?? (isRawDataArea ? rawPreviewPoints : dataPoints);
  const visiblePoints = useMemo(() => focusPoints(displayedPoints, livePreview ? null : focusedCluster), [displayedPoints, focusedCluster, livePreview]);
  const handleFocusCluster = (cluster: number | null) => { setFocusedCluster(cluster); setSelectedPoint(null); };
  useEffect(() => {
    if (!exploring || focusedCluster === null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.fullscreenElement) {
        setFocusedCluster(null);
        setSelectedPoint(null);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [exploring, focusedCluster]);
  useEffect(() => {
    if (focusedCluster !== null && !dataPoints.some(point => point.cluster === focusedCluster)) setFocusedCluster(null);
  }, [dataPoints, focusedCluster]);


  const handlePlayStory = useCallback(() => {
    if (!dataset || dataset.rawRows.length === 0) {
      setNotice({ type: 'error', message: 'Choose or import a dataset to start Data Story.' });
      return;
    }

    storyTimersRef.current.forEach((t) => clearTimeout(t));
    storyTimersRef.current = [];

    setIsStoryPlaying(true);
    setStoryStep(1);
    setNotice({
      type: 'info',
      message: '1/5 · Showing raw data…',
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
        message: '2/5 · Standardizing features…',
      });
    }, 2500);

    // Step 3: Dimensionality reduction (PCA 3D + Biplot) with 360° scan + particle morphing
    const t2 = setTimeout(async () => {
      setStoryStep(3);
      setNotice({
        type: 'info',
        message: '3/5 · Projecting the data with PCA…',
      });
      setBiplotVisible(true);
      await runPipeline();
    }, 5200);

    // Step 4: Clustering
    const t3 = setTimeout(() => {
      setStoryStep(4);
      setNotice({
        type: 'info',
        message: '4/5 · Grouping points with K-Means…',
      });
      setColorMode('cluster');
      handleApplyClustering({ method: 'K-Means', k: 3, epsilon: 3.5, minPts: 5 });
    }, 10200);

    // Step 5: Spotlight Outliers
    const t4 = setTimeout(() => {
      setStoryStep(5);
      setNotice({
        type: 'info',
        message: '5/5 · Highlighting outliers…',
      });
      setSpotlightOutliers(true);
    }, 15600);

    // Step 6: Complete
    const t5 = setTimeout(() => {
      setIsStoryPlaying(false);
      setStoryStep(0);
      setNotice({
        type: 'success',
        message: 'Data Story complete. Select any point to inspect it.',
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

      setFocusedCluster(null);
      setSelectedPoint(null);
      setIsLiveAnimating(true);
      runLiveLoop(dataset);
    }
  };

  const handleResetLiveAnimation = () => {
    setIsLiveAnimating(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    liveStateRef.current = null;
    setLiveCurrentIter(0);
    setLivePreview(null);
    setSelectedPoint(null);
  };

  const runLiveLoop = (source: ParsedDataset) => {
    const state = liveStateRef.current;
    if (!state || state.isCompleted) {
      setIsLiveAnimating(false);
      return;
    }

    const newCoords = stepLiveTSNE(state, 4);
    setLiveCurrentIter(state.currentIter);

    setLivePreview(makePoints(source, newCoords));

    if (!state.isCompleted) {
      animFrameRef.current = requestAnimationFrame(() => runLiveLoop(source));
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


  const updatePointSet = (points: DataPoint[], dual: DataPoint[]) => {
    setDataPoints(points); setDualDataPoints(dual); setSelectedPoint(null); setFocusedCluster(null);
    setMetrics(previous => ({ ...previous, ...evaluatePointSet(points, hasClustering, Boolean(dataset?.labelColumn)) }));
  };
  const handlePruneOutliers = () => {
    if (isComputing || isLiveAnimating || dataPoints.length === 0) return;
    const filtered = dataPoints.filter(point => !point.isOutlier && point.cluster !== -1);
    if (filtered.length === dataPoints.length) return;
    backupPointsRef.current ??= { primary: [...dataPoints], dual: [...dualDataPoints] };
    setIsPruned(true); setPrunedCount(backupPointsRef.current.primary.length - filtered.length);
    updatePointSet(filtered, dualDataPoints.filter(point => !point.isOutlier && point.cluster !== -1));
  };
  const handleRestorePoints = () => {
    if (!backupPointsRef.current || isComputing || isLiveAnimating) return;
    updatePointSet(backupPointsRef.current.primary, backupPointsRef.current.dual);
    backupPointsRef.current = null; setIsPruned(false); setPrunedCount(0);
  };
  const handleDeleteSinglePoint = (pointId: string | number | boolean, rowIndex?: number) => {
    if (dataPoints.length === 0 || isComputing || isLiveAnimating) return;
    backupPointsRef.current ??= { primary: [...dataPoints], dual: [...dualDataPoints] };
    const keep = (point: DataPoint) => rowIndex === undefined ? point.id !== pointId : point.rowIndex !== rowIndex;
    const filtered = dataPoints.filter(keep);
    setIsPruned(true); setPrunedCount(backupPointsRef.current.primary.length - filtered.length);
    updatePointSet(filtered, dualDataPoints.filter(keep));
  };

  // 6. Save Experiment to MongoDB
  const handleSaveExperiment = async () => {
    if (!dataset || !completedRun || resultsDirty || isComputing) return;
    try {
      setIsSavingExperiment(true);
      const res = await fetchWithTimeout('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: completedRun.datasetId,
          datasetName: dataset.name,
          reductionMethod: completedRun.reduction.method,
          clusteringMethod: completedRun.clustering.method,
          k: completedRun.clustering.k,
          silhouetteScore: metrics.silhouetteScore,
          ari: metrics.adjustedRandIndex,
          params: {
            reduction: completedRun.reduction,
            clustering: completedRun.clustering,
            features: completedRun.features,
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`The server could not save the experiment (HTTP ${res.status}).`);
      }
      setNotice({ type: 'success', message: 'Experiment saved.' });
      await fetchExperiments();
    } catch (e: unknown) {
      setNotice({ type: 'error', message: `Could not save experiment: ${getErrorMessage(e)}` });
    } finally {
      setIsSavingExperiment(false);
    }
  };

  const fetchExperiments = useCallback(async () => {
    const request = ++historyRequestRef.current;
    setHistoryLoading(true); setHistoryError(null);
    try {
      const res = await fetchWithTimeout('/api/experiments');
      if (!res.ok) throw new Error('Could not load experiment history (HTTP ' + res.status + ').');
      const response: unknown = await res.json();
      const data = isRecord(response) && 'data' in response ? response.data : response;
      if (!Array.isArray(data) || !data.every(isExperimentRecord)) throw new Error('The server returned invalid experiment history.');
      if (request === historyRequestRef.current) setExperiments(data);
    } catch (error) {
      if (request === historyRequestRef.current) setHistoryError(getErrorMessage(error));
    } finally { if (request === historyRequestRef.current) setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    if (page === 'experiments') void fetchExperiments();
  }, [page, fetchExperiments]);

  const handleApplyExperiment = (record: ExperimentRecord) => {
    const config = experimentConfiguration(record);
    if (!dataset || !config || config.datasetId !== activeDatasetId || isComputing || isLiveAnimating) return;
    if (config.features.some(feature => !dataset.featureColumns.includes(feature))) {
      setHistoryError('This dataset is missing features required by the experiment.'); return;
    }
    setSelectedFeatures(config.features); setReductionConfig(config.reduction); setClusteringConfig(config.clustering);
    openWorkspacePage('explore');
    setNotice({ type: 'info', message: 'Configuration restored. Run analysis to generate new results.' });
  };

  const handleExport = (format: 'csv' | 'json') => {
    if (!dataset || !completedRun || completedRun.datasetId !== activeDatasetId
      || dataPoints.length === 0 || isComputing || isLiveAnimating || livePreview) return;
    try {
      const name = safeFilename(dataset.name);
      if (format === 'csv') downloadText(csvText(resultRows(dataset, dataPoints, hasClustering)), name + '_3D_Clustered_Results.csv', 'text/csv;charset=utf-8');
      else downloadText(JSON.stringify(analysisReport(dataset, dataPoints, completedRun, metrics), null, 2), name + '_analysis.json', 'application/json');
      setIsExportModalOpen(false);
      setNotice({ type: 'success', message: 'Exported ' + format.toUpperCase() + ' for all ' + dataPoints.length + ' result points.' });
    } catch (error) { setNotice({ type: 'error', message: 'Could not export: ' + getErrorMessage(error) }); }
  };
  const handleExportCSV = () => setIsExportModalOpen(true);

  const renderSetup = (methodsOnly = false) => (
      <ControlSidebar embedded methodsOnly={methodsOnly}
        datasetName={dataset ? dataset.name : 'Loading…'}
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
        onChangeDualSecondaryMethod={setDualSecondaryMethod}
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
        onOpenDatasetManager={() => openWorkspacePage('datasets')}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
  );

  const pageContent = page === 'datasets' ? (
    <DatasetsPage datasets={datasetList} activeDatasetId={dataset ? activeDatasetId : ''} busy={isComputing}
      activity={loadingMessage} notice={notice} onDismissNotice={() => setNotice(null)} onUpload={handleFileUpload}
      onRename={handleRenameDataset} onDelete={handleDeleteDataset} onSelect={async id => {
        const opened = (dataset && id === activeDatasetId) || await handleSelectDataset(id);
        if (opened && readWorkspacePage() === 'datasets') openWorkspacePage('explore');
      }} />
  ) : page === 'methods' ? (
    <WorkspacePage title="Methods" description={dataset ? 'Configure the next analysis for ' + dataset.name + '.' : 'Choose methods for your next analysis.'}
      actions={<a className="lab-action lab-action-primary" href="#/explore">Review in Explore</a>}>
      {isComputing && <p className="lab-page-state" role="status">{loadingMessage || 'Working…'}</p>}
      {renderSetup(true)}
    </WorkspacePage>
  ) : page === 'experiments' ? (
    <Suspense fallback={<WorkspacePage title="Experiments" description="Find saved runs and reuse their settings."><p className="lab-page-state" role="status">Loading experiments…</p></WorkspacePage>}>
      <ExperimentsPage experiments={experiments} onRefresh={fetchExperiments} isLoading={historyLoading} error={historyError}
        storageLabel={dbStatus} activeDatasetId={dataset ? activeDatasetId : ''} availableFeatures={dataset?.featureColumns ?? []}
        isBusy={isComputing || isLiveAnimating}
        onApply={handleApplyExperiment} />
    </Suspense>
  ) : null;

  return (
    <div className="explorer-app font-sans">
      {notice && page !== 'datasets' && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
          className={`workspace-notice absolute top-3 right-3 z-[70] flex max-w-md items-center gap-2.5 rounded border px-3 py-2 text-xs shadow-lg backdrop-blur-md ${
            notice.type === 'error'
              ? 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]'
              : notice.type === 'success'
                ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-main)]'
          }`}
        >
          <span className="flex-1">{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 font-bold px-1 text-current/70 hover:text-current"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      <WorkspaceLayout onSignOut={onSignOut} page={page} pageContent={pageContent}
        activity={loadingMessage}
        analyzingConfiguration={analyzingRun ? describeRun(analyzingRun) : undefined}
        pendingChanges={pendingChanges}
        previousResult={previousResult}
        analysisError={analysisError}
        onDismissError={() => setAnalysisError(null)}
        onRetry={() => executeAnalysis(clusteringConfig)}
        datasetName={dataset?.name ?? 'No dataset selected'}
        pointCount={dataset?.totalRows ?? 0}
        featureCount={dataset?.featureColumns.length ?? 0}
        selectedPoint={selectedPoint}
        focusedCluster={focusedCluster}
        resultsDirty={resultsDirty}
        isLiveAnimating={isLiveAnimating}
        isComputing={isComputing}
        canRun={Boolean(dataset) && selectedFeatures.length >= MIN_NUMERIC_FEATURES}
        canExport={!livePreview && (visiblePoints.length > 0 || Boolean(completedRun && dataPoints.length > 0))}
        onRun={() => executeAnalysis(clusteringConfig)}
        onExport={handleExportCSV}
        onHelp={() => setIsSecurityModalOpen(true)}
        controls={renderSetup()}
        visualization={({ isFullscreen, onToggleFullscreen, toolbarHost }) => (
          <div className="workspace-visualization">
        {livePreview && <button className="workspace-exit-preview" onClick={handleResetLiveAnimation}>Exit t-SNE preview</button>}
        {completedRun && !livePreview && <div className="workspace-viewing"><span>Viewing · {describeRun(completedRun)}</span>{previousResult && <strong className="result-stale">Previous result</strong>}</div>}
        {/* Single vs Dual Viewport Rendering */}
        <div className="min-h-0 flex-1 w-full flex">
          {/* Viewport 1 (Primary) */}
          <div className="flex-1 h-full relative">
            {displayedPoints.length > 0 ? (
              <Suspense
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--text-muted)]" role="status">
                    Loading the 3D view…
                  </div>
                }
              >
                <ThreeCanvas
                  active={exploring}
                  dataPoints={visiblePoints}
                  viewKey={String(focusedCluster)}
                  snapshotRef={primarySnapshotRef}
                  isFullscreen={isFullscreen}
                  toolbarHost={toolbarHost}
                  onToggleFullscreen={onToggleFullscreen}
                  hasClustering={!livePreview && hasClustering}
                  colorMode={!livePreview && (hasClustering || colorMode !== 'cluster') ? colorMode : 'ground-truth'}
                  selectedFeature={selectedColorFeature}
                  onSelectPoint={handleSelectPoint}
                  selectedPoint={selectedPoint}
                  reductionMethod={livePreview ? 't-SNE' : isRawDataArea ? 'RAW' : resultMethod}
                  onCameraChange={handlePrimaryCameraChange}
                  titleBadge={livePreview ? 't-SNE preview' : isRawDataArea ? 'Viewing · Raw data' : undefined}
                  showProjectionBadge={isRawDataArea || Boolean(livePreview)}
                  axisFeatures={isRawDataArea && !livePreview ? selectedFeatures.slice(0, 3) : undefined}
                  pcaComponents={isRawDataArea || livePreview ? undefined : pcaComponents}
                  featureNames={completedRun?.features ?? selectedFeatures}
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
              <div className="absolute inset-0 flex flex-col gap-3 items-center justify-center px-6 text-center text-xs text-[var(--text-muted)]">
                {completedRun ? 'No points remain. Restore points or rerun analysis.' : dataset
                  ? 'Select at least three numeric features to view the data in 3D.'
                  : 'Choose a dataset to get started.'}
                {isFullscreen && <button type="button" className="workspace-exit-preview" onClick={onToggleFullscreen}>Exit fullscreen</button>}
              </div>
            )}
          </div>

          {/* Viewport 2 (Dual Secondary with Camera Synchronization) */}
          {isDualView && !isRawDataArea && focusedCluster === null && (
            <div className="flex-1 h-full relative border-l border-[var(--border-subtle)]">
              <Suspense
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--text-muted)]" role="status">
                    Loading the 3D view…
                  </div>
                }
              >
                <ThreeCanvas
                  active={exploring}
                  dataPoints={dualDataPoints.length > 0 ? dualDataPoints : dataPoints}
                  isFullscreen={isFullscreen}
                  toolbarHost={toolbarHost}
                  toolbarLabel="Comparison 3D view controls"
                  colorMode={colorMode}
                  selectedFeature={selectedColorFeature}
                  onSelectPoint={handleSelectPoint}
                  selectedPoint={selectedPoint}
                  reductionMethod={dualSecondaryMethod}
                  syncCameraPos={syncedCamPos}
                  syncTargetPos={syncedTargetPos}
                  titleBadge={`VIEW B: ${dualSecondaryMethod} 3D (Synced)`}
                  theme={theme}
                  onToggleTheme={handleToggleTheme}
                />
              </Suspense>
            </div>
          )}
        </div>

          </div>
        )}
        insights={(
          <MetricsPanel layout="sidebar"
            metrics={metrics}
            reductionMethod={resultMethod}
            clusteringMethod={completedRun?.clustering.method ?? 'None'}
            resultsDirty={resultsDirty || Boolean(livePreview)}
            previousResult={previousResult || Boolean(completedRun && livePreview)}
            runConfiguration={completedRun && <details className="insights-more">
              <summary>Run configuration</summary>
              <p className="insights-hint">{describeRun(completedRun)}</p>
              <p className="insights-hint">Features ({completedRun.features.length}): {completedRun.features.join(', ')}</p>
              {completedRun.reduction.method === 'UMAP' && <p className="insights-hint">Neighbors: {completedRun.reduction.nNeighbors} · Min distance: {completedRun.reduction.minDist}</p>}
              {completedRun.reduction.method === 't-SNE' && <p className="insights-hint">Perplexity: {completedRun.reduction.perplexity} · Learning rate: {completedRun.reduction.learningRate} · Iterations: {completedRun.reduction.iterations}</p>}
              {completedRun.clustering.method === 'K-Means' && <p className="insights-hint">Clusters: {completedRun.clustering.k}</p>}
              {completedRun.clustering.method === 'DBSCAN' && <p className="insights-hint">Radius (ε): {completedRun.clustering.epsilon} · Minimum points: {completedRun.clustering.minPts}</p>}
            </details>}
            focusedCluster={focusedCluster}
            onFocusCluster={livePreview ? undefined : handleFocusCluster}
            datasetName={dataset ? dataset.name : 'No dataset'}
            totalRows={dataset ? dataset.totalRows : 0}
            hasGroundTruth={Boolean(dataset?.labelColumn)}
            hasResults={completedRun !== null}
            isComputing={isComputing || isLiveAnimating}
            normalization={completedRun ? normalizationLabels[completedRun.reduction.normalization] : '—'}
            onPruneOutliers={livePreview ? undefined : handlePruneOutliers}
            onRestorePoints={livePreview ? undefined : handleRestorePoints}
            isPruned={isPruned}
            prunedCount={prunedCount}
            dataPoints={dataPoints}
            onSelectPoint={livePreview ? undefined : handleSelectPoint}
            onDeletePoint={!livePreview && dataPoints.length > 0 ? handleDeleteSinglePoint : undefined}
            onSaveExperiment={handleSaveExperiment}
            onOpenHistory={() => openWorkspacePage('experiments')}
            isSaving={isSavingExperiment}
            theme={theme}
          />
        )}
        selection={(
          <>
            {focusedCluster !== null && !livePreview && <ClusterFocus cluster={focusedCluster} points={dataPoints} onChange={handleFocusCluster} />}
            <section className="workspace-inspector"><p className="workspace-eyebrow">POINT INSPECTOR</p>
        <DataInspector embedded
          point={selectedPoint}
          hasClustering={!livePreview && hasClustering}
          onClose={() => setSelectedPoint(null)}
          onDeletePoint={completedRun && !livePreview && !isComputing ? handleDeleteSinglePoint : undefined}
          theme={theme}
        />
              {!selectedPoint && <div className="workspace-inspector-empty"><p>Select a point to look closer.</p></div>}
            </section>
          </>
        )}
      />

      {isExportModalOpen && <ExportModal onClose={() => setIsExportModalOpen(false)} onDownload={handleExport} onSnapshot={() => primarySnapshotRef.current?.()} hasImage={visiblePoints.length > 0} hasResults={Boolean(completedRun && dataPoints.length > 0)} previousResult={previousResult} configuration={completedRun ? describeRun(completedRun) : undefined} focused={focusedCluster !== null} />}

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
                const res = await fetchWithTimeout('/api/health');
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
        />
      )}

    </div>
  );
}

export default App;
