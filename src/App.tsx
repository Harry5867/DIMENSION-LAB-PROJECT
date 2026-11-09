import { useAppLanguage } from "./components/WelcomeLanguage";
import { UnsupervisedPanel, AnalysisOverlay } from './components/UnsupervisedPanel';
import { GMMResult } from './algorithms/gmm';
import { useAppTheme } from './components/ThemeProvider';
import { analysisReport, csvText, downloadText, resultRows, safeFilename } from './utils/exportData';
import { experimentConfiguration } from './utils/history';
import { fetchWithTimeout } from './utils/network';
import { ExportModal } from './components/ExportModal';
import { lazy, Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ParsedDataset,
  DataPoint,
  ReductionConfig,
  ClusteringConfig,
  ColorMode,
  EvaluationMetrics,
  MIN_NUMERIC_FEATURES,
  DatasetSummary,
} from './types';
import { MAX_CSV_BYTES, parseCSVString, extractFeatureMatrix } from './utils/dataParser';
import { initLiveTSNE, stepLiveTSNE, LiveTSNEState } from './algorithms/liveOptimization';
import { ControlSidebar } from './components/ControlSidebar';
import { AnalysisSnapshot, reductionKey, describeRun, normalizationLabels, pendingAnalysisChanges, projectionSettingsError, makePoints, focusPoints, evaluatePointSet } from './utils/exploration';
import { clusterInBrowser, projectInBrowser } from './utils/projectionWorker';
import type { PlotTransition } from './components/plotCloud';
import { ClusterFocus } from './components/ClusterFocus';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { isModelRoute, portalRoute } from './utils/portalNavigation';
import type { WorkspacePage as WorkspaceRoute } from './components/WorkspaceLayout';
import { WorkspacePage } from './components/WorkspacePage';
import { MetricsPanel } from './components/MetricsPanel';
import { DataInspector } from './components/DataInspector';
import { RawDataModal } from './components/RawDataModal';
import { DatasetsPage } from './components/DatasetsPage';
import { ExperimentRecord } from './types';
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

function makeRawPlotPoints(dataset: ParsedDataset, features: string[]) {
  if (features.length < MIN_NUMERIC_FEATURES) return [];
  const coordinates = extractFeatureMatrix(dataset.rawRows, features.slice(0, 3), 'none')
    .map(([x, y, z]): [number, number, number] => [x, y, z]);
  return makePoints(dataset, coordinates);
}

function readWorkspacePage(): WorkspaceRoute {
  const route = portalRoute(window.location.hash);
  return isModelRoute(route) ? route : 'explore';
}

function openWorkspacePage(page: WorkspaceRoute) {
  window.location.hash = '/' + page;
}

export function App({ active = true }: { active?: boolean }) {
  const { tr } = useAppLanguage();
  const [page, setPage] = useState(readWorkspacePage);
  const exploring = active && page === 'explore';
  useEffect(() => {
    const syncPage = () => { if (isModelRoute(portalRoute(window.location.hash))) setPage(readWorkspacePage()); };
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);
  const [analysisOverlay, setAnalysisOverlay] = useState<AnalysisOverlay | null>(null);
  const [gmmResult, setGmmResult] = useState<GMMResult | null>(null);
  const [showGmm, setShowGmm] = useState(true);
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const datasetTitle = dataset && (dataset.id === 'cancer_wdbc' || dataset.id === 'wholesale_customers' ? tr(dataset.name) : dataset.name);
  const primarySnapshotRef = useRef<(() => void) | null>(null);
  const plotTransitionRef = useRef<PlotTransition | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const rawPreviewPoints = useMemo(() => dataset ? makeRawPlotPoints(dataset, selectedFeatures) : [], [dataset, selectedFeatures]);
  const [analyzingRun, setAnalyzingRun] = useState<AnalysisSnapshot | null>(null);
  const [livePreview, setLivePreview] = useState<DataPoint[] | null>(null);
  const [completedRun, setCompletedRun] = useState<AnalysisSnapshot | null>(null);
  const [focusedCluster, setFocusedCluster] = useState<number | null>(null);
  const operationRef = useRef(0);
  const computingRef = useRef(false);
  const computeAbortRef = useRef<AbortController | null>(null);
  const localDatasets = useRef(new Map<string, ParsedDataset>());
  const [selectedPoint, setSelectedPoint] = useState<DataPoint | null>(null);
  const selectionRef = useRef<DataPoint | null>(null);
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

  const { theme } = useAppTheme();

  // Outlier Spotlight Mode
  const [spotlightOutliers, setSpotlightOutliers] = useState<boolean>(false);
  useEffect(() => { if (analysisOverlay?.scores) setSpotlightOutliers(true); }, [analysisOverlay]);

  // Outlier Pruning State
  const backupPointsRef = useRef<DataPoint[] | null>(null);
  const [isPruned, setIsPruned] = useState<boolean>(false);
  const [prunedCount, setPrunedCount] = useState<number>(0);

  // Elbow Modal, Security Modal & PCA Biplot State
  const [isElbowModalOpen, setIsElbowModalOpen] = useState<boolean>(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);
  const [pcaComponents, setPcaComponents] = useState<number[][] | undefined>(undefined);
  const [featureMatrix, setFeatureMatrix] = useState<number[][]>([]);
  const [biplotVisible, setBiplotVisible] = useState<boolean>(false);
  const [biplotTopK, setBiplotTopK] = useState<number>(6);

  // Live Optimization State
  const [isLiveAnimating, setIsLiveAnimating] = useState<boolean>(false);
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
  const previousResult = Boolean(completedRun && (resultsDirty || isComputing || analysisError));
  const hasClustering = completedRun !== null && completedRun.clustering.method !== 'None';
  const resultMethod = completedRun?.reduction.method ?? reductionConfig.method;
  const handleSelectPoint = useCallback((point: DataPoint | null) => {
    selectionRef.current = point;
    setSelectedPoint(point);
  }, []);
  const rawAxisFeatures = useMemo(() => selectedFeatures.slice(0, 3), [selectedFeatures]);

  // Check Database connection health while Model is visible.
  useEffect(() => {
    if (!active) return;
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
  }, [active]);

  // Reset all computation & analytical states to ensure 100% data consistency
  const resetComputationState = useCallback(() => {
    operationRef.current++; computeAbortRef.current?.abort(); computingRef.current = false;
    setAnalysisError(null); setAnalyzingRun(null); setIsExportModalOpen(false); setLivePreview(null);
    setCompletedRun(null); setFocusedCluster(null); setIsPruned(false); setPrunedCount(0); backupPointsRef.current = null;
    setAnalysisOverlay(null); setGmmResult(null);
    setDataPoints([]);
    handleSelectPoint(null);
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
  }, [handleSelectPoint]);

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
  const datasetTransitionRef = useRef<AbortController | null>(null);
  const currentDatasetId = useRef(activeDatasetId);
  const activateDataset = useCallback(async (parsed: ParsedDataset, id: string, request: number) => {
    if (request !== datasetRequestRef.current) return false;
    if (plotTransitionRef.current) {
      const controller = new AbortController();
      datasetTransitionRef.current?.abort();
      datasetTransitionRef.current = controller;
      setLoadingMessage('Updating view…');
      await plotTransitionRef.current(makeRawPlotPoints(parsed, parsed.featureColumns), 'ground-truth', undefined, false, controller.signal);
      if (controller.signal.aborted || request !== datasetRequestRef.current) return false;
      datasetTransitionRef.current = null;
    }
    resetComputationState();
    currentDatasetId.current = id;
    setDataset({ ...parsed, id }); setActiveDatasetId(id);
    setSelectedFeatures(parsed.featureColumns); setSelectedColorFeature(parsed.featureColumns[0] ?? '');
    setColorMode('ground-truth');
    return true;
  }, [resetComputationState]);
  const handleSelectDataset = useCallback(async (id: string) => {
    const request = ++datasetRequestRef.current;
    datasetTransitionRef.current?.abort();
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
      return await activateDataset(parsed, id, request);

    } catch (error) {
      if (request === datasetRequestRef.current) setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      if (request === datasetRequestRef.current) { setIsComputing(false); setLoadingMessage(''); }
    }
  }, [activateDataset]);

  // Rename a dataset
  const handleRenameDataset = async (id: string, newName: string) => {
    try {
      const local = localDatasets.current.get(id);
      if (local) {
        localDatasets.current.set(id, { ...local, name: newName });
        setDataset(prev => prev?.id === id ? { ...prev, name: newName } : prev);
        await fetchDatasetList(); return;
      }
      const res = await fetchWithTimeout(`/api/datasets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error('Could not rename the dataset.');
      await fetchDatasetList();
      setDataset(prev => prev?.id === id ? { ...prev, name: newName } : prev);
      setNotice({ type: 'success', message: `Renamed dataset to "${newName}".` });
    } catch (err: unknown) {
      setNotice({ type: 'error', message: `Could not rename dataset: ${getErrorMessage(err)}` });
    }
  };

  // Delete an uploaded dataset
  const handleDeleteDataset = async (id: string) => {
    const request = datasetRequestRef.current;
    const openSampleIfDeleted = async () => {
      if (request === datasetRequestRef.current && currentDatasetId.current === id) {
        await handleSelectDataset('cancer_wdbc');
      }
    };
    try {
      if (localDatasets.current.delete(id)) {
        await fetchDatasetList();
        await openSampleIfDeleted();
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
      await openSampleIfDeleted();
    } catch (err: unknown) {
      setNotice({ type: 'error', message: `Could not delete dataset: ${getErrorMessage(err)}` });
    }
  };

  // Initial Load: Fetch list and Wisconsin Breast Cancer
  useEffect(() => {
    void fetchDatasetList();
    void handleSelectDataset('cancer_wdbc');
  }, [fetchDatasetList, handleSelectDataset]);

  const handleFileUpload = async (file: File) => {
    if (isComputing) return;
    const request = ++datasetRequestRef.current;
    setNotice(null);
    setIsComputing(true); setLoadingMessage('Checking CSV…');
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error('The CSV exceeds the 5 MiB file limit.');
      const parsed = parseCSVString(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()), file.name);
      if (request !== datasetRequestRef.current) return;
      const openLocally = async () => {
        if (request !== datasetRequestRef.current) return;
        const id = 'local_' + crypto.randomUUID();
        localDatasets.current.set(id, { ...parsed, id });
        if (!await activateDataset(parsed, id, request)) return;
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
      if (!await activateDataset({ ...parsed, name: data.name, rawRows: data.rawRows, featureColumns: data.features,
        idColumn: data.idColumn, labelColumn: data.labelColumn }, data.id, request)) return;
      await fetchDatasetList();
      setNotice({ type: 'success', message: 'Imported ' + data.name + ' (' + data.totalRows + ' rows).' });
    } catch (error) {
      if (request === datasetRequestRef.current) setNotice({ type: 'error', message: 'Could not open CSV: ' + getErrorMessage(error) });
    } finally {
      if (request === datasetRequestRef.current) { setIsComputing(false); setLoadingMessage(''); }
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
      if (token !== operationRef.current) return;
      let points = backupPointsRef.current ?? dataPoints;
      let matrix: number[][] | undefined;
      let components = pcaComponents;
      let explainedVariance = metrics.explainedVariance;
      let totalVariance = metrics.totalVarianceExplained;
      if (!reuseEmbedding || reductionDirty || points.length === 0) {
        const settingsError = projectionSettingsError(run.reduction, dataset.rawRows.length);
        if (settingsError) throw new Error(settingsError);
        setLoadingMessage('Running ' + run.reduction.method + '…');
        matrix = extractFeatureMatrix(dataset.rawRows, run.features, run.reduction.normalization);
        let output: ReductionOutput | undefined;
        const response = await fetchWithTimeout('/api/compute', { method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matrix,
              groundTruth: dataset.labelColumn ? dataset.rawRows.map(row => row[dataset.labelColumn!] ?? null) : [],
              reductionConfig: run.reduction, clusteringConfig: { ...run.clustering, method: 'None' } }) }, 45_000)
          .catch(error => { if (controller.signal.aborted) throw error; return undefined; });
        if (response?.ok) {
          const body: unknown = await response.json().catch(() => undefined);
          const payload = isRecord(body) && 'data' in body ? body.data : body;
          if (isComputeResult(payload) && payload.coordinates.length === matrix.length) output = payload;
        } else if (response && response.status < 500 && response.status !== 401) {
          const body: unknown = await response.json().catch(() => undefined);
          const error = isRecord(body) ? body.error : undefined;
          throw new Error(isRecord(error) && typeof error.message === 'string'
            ? error.message : `The server rejected the analysis (HTTP ${response.status}).`);
        }
        if (token !== operationRef.current) return;
        if (!output) {
          setLoadingMessage('Running ' + run.reduction.method + ' in your browser…');
          output = await projectInBrowser(matrix, run.reduction, controller.signal);
          if (token !== operationRef.current) return;
        }
        points = makePoints(dataset, output.coordinates);
        components = output.components;
        explainedVariance = output.explainedVariance;
        totalVariance = output.totalExplainedVariance;
      }
      setLoadingMessage(run.clustering.method === 'None' ? 'Updating results…' : 'Clustering with ' + run.clustering.method + '…');
      const result = await clusterInBrowser(points, run.clustering, Boolean(dataset.labelColumn), controller.signal);
      if (token !== operationRef.current) return;
      const executionTimeMs = Math.round(performance.now() - started);
      const nextColorMode = run.clustering.method === 'None' ? 'ground-truth' : 'cluster';
      if (plotTransitionRef.current) {
        setLoadingMessage('Updating view…');
        await plotTransitionRef.current(result.points, nextColorMode, undefined, true, controller.signal);
        if (token !== operationRef.current || controller.signal.aborted) return;
      }
      if (matrix) {
        setFeatureMatrix(matrix);
      }
      setIsPruned(false); setPrunedCount(0); backupPointsRef.current = null;
      setPcaComponents(components);
      setFocusedCluster(null);
      const selectedRow = selectionRef.current?.rowIndex;
      handleSelectPoint(selectedRow === undefined ? null : result.points.find(point => point.rowIndex === selectedRow) ?? null);
      setAnalysisOverlay(null); setGmmResult(result.gmm ?? null);
      setDataPoints(result.points);
      setMetrics({ ...result.metrics, explainedVariance, totalVarianceExplained: totalVariance,
        executionTimeMs });
      setCompletedRun(run);
      setColorMode(nextColorMode);
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
  useEffect(() => () => {
    operationRef.current++;
    datasetRequestRef.current++;
    computeAbortRef.current?.abort();
    datasetTransitionRef.current?.abort();
  }, []);

  const isRawDataArea = completedRun === null;
  const displayedPoints = livePreview ?? (isRawDataArea ? rawPreviewPoints : dataPoints);
  const visiblePoints = useMemo(() => focusPoints(displayedPoints, livePreview ? null : focusedCluster), [displayedPoints, focusedCluster, livePreview]);
  const handleFocusCluster = (cluster: number | null) => { setFocusedCluster(cluster); handleSelectPoint(null); };
  useEffect(() => {
    if (!exploring || focusedCluster === null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.fullscreenElement) {
        setFocusedCluster(null);
        handleSelectPoint(null);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [exploring, focusedCluster, handleSelectPoint]);
  useEffect(() => {
    if (focusedCluster !== null && !dataPoints.some(point => point.cluster === focusedCluster)) setFocusedCluster(null);
  }, [dataPoints, focusedCluster]);

  // 4. LIVE OPTIMIZATION ANIMATION LOOP FOR t-SNE / UMAP
  const handleToggleLiveAnimation = () => {
    if (isLiveAnimating) {
      setIsLiveAnimating(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else {
      if (!dataset || selectedFeatures.length < MIN_NUMERIC_FEATURES) return;
      const settingsError = projectionSettingsError(reductionConfig, dataset.rawRows.length);
      if (settingsError) { setAnalysisError(settingsError); return; }

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
      handleSelectPoint(null);
      setIsLiveAnimating(true);
      runLiveLoop(dataset);
    }
  };

  const handleResetLiveAnimation = () => {
    setIsLiveAnimating(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    liveStateRef.current = null;
    setLivePreview(null);
    handleSelectPoint(null);
  };

  // Keep completed results when leaving Model; stop previews and pending work.
  useEffect(() => {
    if (active) return;
    operationRef.current++;
    computeAbortRef.current?.abort();
    computingRef.current = false;
    setIsComputing(false); setAnalyzingRun(null);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    liveStateRef.current = null;
    setIsLiveAnimating(false); setLivePreview(null);
    setIsExportModalOpen(false); setIsElbowModalOpen(false); setIsSecurityModalOpen(false); setIsRawDataModalOpen(false);
  }, [active]);
  useEffect(() => { if (active) document.title = tr('Model'); }, [active, tr]);

  const runLiveLoop = (source: ParsedDataset) => {
    const state = liveStateRef.current;
    if (!state || state.isCompleted) {
      setIsLiveAnimating(false);
      return;
    }

    const newCoords = stepLiveTSNE(state, 4);

    setLivePreview(makePoints(source, newCoords));

    if (!state.isCompleted) {
      animFrameRef.current = requestAnimationFrame(() => runLiveLoop(source));
    } else {
      setIsLiveAnimating(false);
    }
  };

  const updatePointSet = (points: DataPoint[]) => {
    setDataPoints(points); handleSelectPoint(null); setFocusedCluster(null);
    setMetrics(previous => ({ ...previous, ...evaluatePointSet(points, hasClustering, Boolean(dataset?.labelColumn)) }));
  };
  const handlePruneOutliers = () => {
    if (isComputing || isLiveAnimating || dataPoints.length === 0) return;
    const filtered = dataPoints.filter(point => !point.isOutlier && point.cluster !== -1);
    if (filtered.length === dataPoints.length) return;
    backupPointsRef.current ??= [...dataPoints];
    setIsPruned(true); setPrunedCount(backupPointsRef.current.length - filtered.length);
    updatePointSet(filtered);
  };
  const handleRestorePoints = () => {
    if (!backupPointsRef.current || isComputing || isLiveAnimating) return;
    updatePointSet(backupPointsRef.current);
    backupPointsRef.current = null; setIsPruned(false); setPrunedCount(0);
  };
  const handleDeleteSinglePoint = (pointId: string | number | boolean, rowIndex?: number) => {
    if (dataPoints.length === 0 || isComputing || isLiveAnimating) return;
    backupPointsRef.current ??= [...dataPoints];
    const keep = (point: DataPoint) => rowIndex === undefined ? point.id !== pointId : point.rowIndex !== rowIndex;
    const filtered = dataPoints.filter(keep);
    setIsPruned(true); setPrunedCount(backupPointsRef.current.length - filtered.length);
    updatePointSet(filtered);
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

  const overlayPoints = useMemo(() => {
    if (!analysisOverlay || livePreview) return visiblePoints;
    const rows = new Set(analysisOverlay.rows);
    return visiblePoints.map(p => ({ ...p, cluster: 0, isOutlier: Boolean(analysisOverlay.scores) && rows.has(p.rowIndex ?? -1),
      anomalyScore: analysisOverlay.scores?.[p.rowIndex ?? -1], analysisMatch: analysisOverlay.scores ? undefined : rows.has(p.rowIndex ?? -1),
      originalFeatures: { ...p.originalFeatures, __anomaly_score: analysisOverlay.scores?.[p.rowIndex ?? -1] ?? 0, __rule_match: rows.has(p.rowIndex ?? -1) ? 1 : 0 } }));
  }, [analysisOverlay, livePreview, visiblePoints]);
  const renderSetup = (methodsOnly = false) => (
      <ControlSidebar embedded methodsOnly={methodsOnly}
        additionalMethods={dataset && <UnsupervisedPanel active={active} key={activeDatasetId + dataset.name} dataset={dataset} projection={completedRun ? completedRun.reduction.method + ' projection' : rawPreviewPoints.length ? 'Raw first three selected numeric features' : 'Unavailable until at least three numeric features are selected'} onRestoreSettings={(features, normalization) => { setSelectedFeatures(features); setReductionConfig(previous => ({ ...previous, normalization })); }} features={selectedFeatures} normalization={reductionConfig.normalization} points={dataPoints.length ? dataPoints : rawPreviewPoints} onSelect={handleSelectPoint} onOverlay={overlay => { if (overlay) { handleResetLiveAnimation(); setFocusedCluster(null); } setAnalysisOverlay(overlay); }} />}
        datasetName={datasetTitle ?? tr('Loading…')}
        totalRows={dataset ? dataset.totalRows : 0}
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
        isComputing={isComputing}
        hasResults={dataPoints.length > 0}
        onRunComputation={runPipeline}
        onApplyClustering={handleApplyClustering}
        isLiveAnimating={isLiveAnimating}
        onToggleLiveAnimation={handleToggleLiveAnimation}
        onResetLiveAnimation={handleResetLiveAnimation}
        onExportCSV={handleExportCSV}
        dbStatus={dbStatus}
        onOpenElbowModal={() => setIsElbowModalOpen(true)}
        onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
        biplotVisible={biplotVisible}
        onToggleBiplot={() => setBiplotVisible(!biplotVisible)}
        biplotTopK={biplotTopK}
        onChangeBiplotTopK={setBiplotTopK}
        datasetList={datasetList}
        activeDatasetId={activeDatasetId}
        onSelectDataset={handleSelectDataset}
        onOpenRawDataModal={() => setIsRawDataModalOpen(true)}
        onOpenDatasetManager={() => openWorkspacePage('datasets')}
      />

  );

  const pageContent = page === 'datasets' ? (
    <DatasetsPage datasets={datasetList} activeDatasetId={dataset ? activeDatasetId : ''} busy={isComputing}
      activity={tr(loadingMessage)} notice={notice && { ...notice, message: tr(notice.message) }} onDismissNotice={() => setNotice(null)} onUpload={handleFileUpload}
      onRename={handleRenameDataset} onDelete={handleDeleteDataset} onSelect={async id => {
        const opened = (dataset && id === activeDatasetId) || await handleSelectDataset(id);
        if (opened && readWorkspacePage() === 'datasets') openWorkspacePage('explore');
      }} />
  ) : page === 'methods' ? (
    <WorkspacePage title={tr("Methods")} description={datasetTitle ? tr("Configure the next analysis for ") + datasetTitle + '.' : tr("Choose methods for your next analysis.")}
      actions={<a className="lab-action lab-action-primary" href="#/explore">{tr("Review in Explore")}</a>}>
      {isComputing && <p className="lab-page-state" role="status">{tr(loadingMessage || 'Working…')}</p>}
      {renderSetup(true)}
    </WorkspacePage>
  ) : page === 'experiments' ? (
    <Suspense fallback={<WorkspacePage title={tr("Experiments")} description={tr("Find saved runs and reuse their settings.")}><p className="lab-page-state" role="status">{tr("Loading experiments…")}</p></WorkspacePage>}>
      <ExperimentsPage experiments={experiments} onRefresh={fetchExperiments} isLoading={historyLoading} error={historyError && tr(historyError)}
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
          <span className="flex-1">{tr(notice.message)}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 font-bold px-1 text-current/70 hover:text-current"
            aria-label={tr("Dismiss notification")}
          >
            ×
          </button>
        </div>
      )}
      <WorkspaceLayout active={active} page={page} pageContent={pageContent}
        activity={loadingMessage}
        analyzingConfiguration={analyzingRun ? describeRun(analyzingRun) : undefined}
        pendingChanges={pendingChanges}
        previousResult={previousResult}
        analysisError={analysisError}
        onDismissError={() => setAnalysisError(null)}
        onRetry={() => executeAnalysis(clusteringConfig)}
        datasetName={datasetTitle ?? tr('No dataset selected')}
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
        {analysisOverlay && <button className="workspace-exit-preview" onClick={() => { setAnalysisOverlay(null); handleSelectPoint(null); }}>{tr("Clear analysis overlay")}</button>}
        {livePreview && <button className="workspace-exit-preview" onClick={handleResetLiveAnimation}>{tr("Exit t-SNE preview")}</button>}
        {completedRun && !livePreview && <div className="workspace-viewing"><span>{tr("Viewing ·")} {analysisOverlay ? analysisOverlay.title + ' · ' + completedRun.reduction.method + tr(" projection") : describeRun(completedRun)}</span>{previousResult && <strong className="result-stale">{tr("Previous result")}</strong>}</div>}
        {/* Single vs Dual Viewport Rendering */}
        <div className="min-h-0 flex-1 w-full flex">
          {/* Viewport 1 (Primary) */}
          <div className="flex-1 h-full relative">
            {dataset && (
              <Suspense
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--text-muted)]" role="status">
                    {tr("Loading the 3D view…")}
                  </div>
                }
              >
                <ThreeCanvas
                  active={exploring}
                  dataPoints={overlayPoints}
                  transitionRef={plotTransitionRef}
                  snapshotRef={primarySnapshotRef}
                  isFullscreen={isFullscreen}
                  toolbarHost={toolbarHost}
                  onToggleFullscreen={onToggleFullscreen}
                  hasClustering={!livePreview && !analysisOverlay && hasClustering}
                  colorMode={analysisOverlay && !livePreview ? 'feature' : !livePreview && (hasClustering || colorMode !== 'cluster') ? colorMode : 'ground-truth'}
                  selectedFeature={analysisOverlay && !livePreview ? (analysisOverlay.scores ? '__anomaly_score' : '__rule_match') : selectedColorFeature}
                  onSelectPoint={handleSelectPoint}
                  selectedPoint={selectedPoint}
                  reductionMethod={livePreview ? 't-SNE' : isRawDataArea ? 'RAW' : resultMethod}
                  titleBadge={analysisOverlay && !livePreview ? analysisOverlay.title : livePreview ? tr("t-SNE preview") : isRawDataArea ? tr("Viewing · Raw data") : undefined}
                  showProjectionBadge={isRawDataArea || Boolean(livePreview)}
                  axisFeatures={isRawDataArea && !livePreview ? rawAxisFeatures : undefined}
                  pcaComponents={isRawDataArea || livePreview ? undefined : pcaComponents}
                  featureNames={completedRun?.features ?? selectedFeatures}
                  showBiplot={biplotVisible}
                  biplotTopK={biplotTopK}
                  theme={theme}
                  gmm={showGmm && !analysisOverlay && !livePreview && !isRawDataArea && !isPruned && completedRun?.clustering.method === 'GMM' ? gmmResult ?? undefined : undefined}
                  showOutliersSpotlight={spotlightOutliers}
                  onToggleOutliersSpotlight={() => setSpotlightOutliers((prev) => !prev)}
                />
              </Suspense>
            )}
            {displayedPoints.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 items-center justify-center px-6 text-center text-xs text-[var(--text-muted)]">
                {completedRun ? tr("No points remain. Restore points or rerun analysis.") : dataset
                  ? tr("Select at least three numeric features to view the data in 3D.")
                  : tr("Choose a dataset to get started.")}
                {isFullscreen && !dataset && <button type="button" className="workspace-exit-preview pointer-events-auto" onClick={onToggleFullscreen}>{tr("Exit fullscreen")}</button>}
              </div>
            )}
          </div>

        </div>

          </div>
        )}
        insights={(
          <>
          {gmmResult && completedRun?.clustering.method === 'GMM' && <section className="unsupervised-panel"><div className="unsupervised-body"><strong>{tr("GMM · diagonal covariance")}</strong><p>{gmmResult.converged ? tr("Converged") : tr("Iteration limit reached")} · {gmmResult.iterations} {tr("EM updates")}</p><p>{tr("Log likelihood:")} {gmmResult.logLikelihood.toFixed(2)} · AIC: {gmmResult.aic.toFixed(2)} · BIC: {gmmResult.bic.toFixed(2)}</p><label><input type="checkbox" checked={showGmm} onChange={e => setShowGmm(e.target.checked)} />{tr("Show Gaussian ellipsoids")}</label><p>{tr("Ellipsoid axes = 2 marginal standard deviations; this is not a 95% joint confidence region. Model fitted to the completed 3D projection.")}</p><button onClick={() => downloadText(JSON.stringify({ configuration: completedRun, model: gmmResult }, null, 2), 'gmm-model.json', 'application/json')}>{tr("Export GMM model")}</button></div></section>}
          <MetricsPanel layout="sidebar"
            metrics={metrics}
            reductionMethod={resultMethod}
            clusteringMethod={completedRun?.clustering.method ?? 'None'}
            resultsDirty={resultsDirty || Boolean(livePreview)}
            previousResult={previousResult || Boolean(completedRun && livePreview)}
            runConfiguration={completedRun && <details className="insights-more">
              <summary>{tr("Run configuration")}</summary>
              <p className="insights-hint">{describeRun(completedRun)}</p>
              <p className="insights-hint">{tr("Features (")}{completedRun.features.length}): {completedRun.features.join(', ')}</p>
              {completedRun.reduction.method === 'UMAP' && <p className="insights-hint">{tr("Neighbors:")} {completedRun.reduction.nNeighbors} {tr("· Min distance:")} {completedRun.reduction.minDist}</p>}
              {completedRun.reduction.method === 't-SNE' && <p className="insights-hint">Perplexity: {completedRun.reduction.perplexity} {tr("· Learning rate:")} {completedRun.reduction.learningRate} {tr("· Iterations:")} {completedRun.reduction.iterations}</p>}
              {completedRun.clustering.method === 'K-Means' && <p className="insights-hint">{tr("Clusters:")} {completedRun.clustering.k}</p>}
              {completedRun.clustering.method === 'DBSCAN' && <p className="insights-hint">{tr("Radius (ε):")} {completedRun.clustering.epsilon} {tr("· Minimum points:")} {completedRun.clustering.minPts}</p>}
            </details>}
            focusedCluster={focusedCluster}
            onFocusCluster={livePreview ? undefined : handleFocusCluster}
            datasetName={datasetTitle ?? tr('No dataset')}
            totalRows={dataset ? dataset.totalRows : 0}
            hasGroundTruth={Boolean(dataset?.labelColumn)}
            hasResults={completedRun !== null}
            isComputing={isComputing || isLiveAnimating}
            normalization={completedRun ? tr(normalizationLabels[completedRun.reduction.normalization]) : '—'}
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
          </>
        )}
        selection={(
          <>
            {focusedCluster !== null && !livePreview && <ClusterFocus cluster={focusedCluster} points={dataPoints} onChange={handleFocusCluster} />}
            <section className="workspace-inspector"><p className="workspace-eyebrow">{tr("POINT INSPECTOR")}</p>
        <DataInspector embedded
          point={analysisOverlay && selectedPoint ? overlayPoints.find(p => p.rowIndex === selectedPoint.rowIndex) ?? selectedPoint : selectedPoint}
          hasClustering={!livePreview && !analysisOverlay && hasClustering}
          onClose={() => handleSelectPoint(null)}
          onDeletePoint={completedRun && !livePreview && !isComputing ? handleDeleteSinglePoint : undefined}
          theme={theme}
        />
              {!selectedPoint && <div className="workspace-inspector-empty"><p>{tr("Select a point to look closer.")}</p></div>}
            </section>
          </>
        )}
      />

      {active && isExportModalOpen && <ExportModal onClose={() => setIsExportModalOpen(false)} onDownload={handleExport} onSnapshot={() => primarySnapshotRef.current?.()} hasImage={visiblePoints.length > 0} hasResults={Boolean(completedRun && dataPoints.length > 0)} previousResult={previousResult} configuration={completedRun ? describeRun(completedRun) : undefined} focused={focusedCluster !== null} />}

      {/* Elbow Method & Silhouette Analysis Modal */}
      {active && isElbowModalOpen && (
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
      {active && isSecurityModalOpen && (
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
      {active && isRawDataModalOpen && dataset && (
        <RawDataModal
          isOpen={isRawDataModalOpen}
          onClose={() => setIsRawDataModalOpen(false)}
          datasetName={datasetTitle ?? dataset.name}
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
