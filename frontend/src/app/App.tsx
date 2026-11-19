import { projectionSettingsError } from '@dimension-lab/algorithms/projection';
import { runAnalysis } from '../features/analysis/runAnalysis';
import { useAppLanguage } from "../shared/providers/WelcomeLanguage";
import { useAnalysisHistory } from '../features/analysis/useAnalysisHistory';
import { UnsupervisedPanel, AnalysisOverlay } from '../features/analysis/components/UnsupervisedPanel';
import { GMMResult } from '@dimension-lab/algorithms/gmm';
import { useAppTheme } from '../shared/providers/ThemeProvider';
import { analysisReport, csvText, downloadText, resultRows, safeFilename } from '../features/experiments/exportData';
import { experimentConfiguration } from '../features/experiments/history';
import { fetchWithTimeout } from '../shared/api/network';
import { ExportModal } from '../features/experiments/components/ExportModal';
import { lazy, Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ParsedDataset,
  DataPoint,
  ReductionConfig,
  ClusteringConfig,
  ColorMode,
  EvaluationMetrics,
  MIN_NUMERIC_FEATURES,
  DatasetSummary,
  sampleDatasets,
  getSampleDataset,
} from '@dimension-lab/contracts';
import { MAX_CSV_BYTES, parseCSVString, extractFeatureMatrix } from '@dimension-lab/algorithms/dataParser';
import { initLiveTSNE, stepLiveTSNE, LiveTSNEState } from '../features/analysis/liveOptimization';
import { ControlSidebar, type SetupMethod } from '../features/analysis/components/ControlSidebar';
import { AnalysisSnapshot, reductionKey, describeRun, normalizationLabels, pendingAnalysisChanges, makePoints, focusPoints, evaluatePointSet } from '../features/analysis/exploration';
import type { PlotTransition } from '../features/visualization/scene/plotCloud';
import { ClusterFocus } from '../features/visualization/components/ClusterFocus';
import { WorkspaceLayout } from './layout/WorkspaceLayout';
import { isModelRoute, portalRoute } from '../shared/navigation/portalNavigation';
import type { WorkspacePage as WorkspaceRoute } from './layout/WorkspaceLayout';
import { WorkspacePage } from '../shared/ui/WorkspacePage';
import { MetricsPanel } from '../features/analysis/components/MetricsPanel';
import { DataInspector } from '../features/visualization/components/DataInspector';
import { RawDataModal } from '../features/datasets/components/RawDataModal';
import { DatasetsPage } from '../features/datasets/components/DatasetsPage';
import { ExperimentRecord } from '@dimension-lab/contracts';
import {
  getErrorMessage,
  isDatasetDocument,
  isDatasetSummary,
  isExperimentRecord,
  isRecord,
} from '../shared/api/typeGuards';

const ThreeCanvas = lazy(() =>
  import('../features/visualization/components/ThreeCanvas').then((module) => ({ default: module.ThreeCanvas }))
);
const ExperimentsPage = lazy(() =>
  import('../features/experiments/components/ExperimentsPage').then((module) => ({ default: module.ExperimentsPage }))
);
const ElbowModal = lazy(() =>
  import('../features/analysis/components/ElbowModal').then((module) => ({ default: module.ElbowModal }))
);
const SecurityModal = lazy(() =>
  import('../features/auth/components/SecurityModal').then((module) => ({ default: module.SecurityModal }))
);
const DashboardPage = lazy(() => import('../features/experiments/components/DashboardPage')
  .then(module => ({ default: module.DashboardPage })));

const defaultReduction: ReductionConfig = {
  method: 'PCA',
  normalization: 'z-score',
  perplexity: 30,
  learningRate: 100,
  iterations: 250,
  nNeighbors: 15,
  minDist: 0.1,
};

function makeRawPlotPoints(dataset: ParsedDataset, features: string[]) {
  if (features.length < MIN_NUMERIC_FEATURES) return [];
  const coordinates = extractFeatureMatrix(dataset.rawRows, features.slice(0, 3), 'none')
    .map(([x, y, z]): [number, number, number] => [x ?? 0, y ?? 0, z ?? 0]);
  return makePoints(dataset, coordinates);
}

function readWorkspacePage(): WorkspaceRoute {
  const route = portalRoute(window.location.hash);
  return isModelRoute(route) ? route : 'explore';
}

function openWorkspacePage(page: WorkspaceRoute) {
  window.location.hash = '/' + page;
}

export function App({ active = true, persistent = false, importsHost = null }: {
  active?: boolean; persistent?: boolean; importsHost?: HTMLDivElement | null;
}) {
  const analysisHistory = useAnalysisHistory(persistent);
  const [openSetupMethod, setOpenSetupMethod] = useState<SetupMethod | null>(null);
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

  const [reductionConfig, setReductionConfig] = useState(defaultReduction);

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
    void checkDbHealth();
    const interval = setInterval(() => void checkDbHealth(), 10000);
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

  const [nextDatasetOffset, setNextDatasetOffset] = useState<number | null>(null);
  const datasetListRequest = useRef(0);
  const fetchDatasetList = useCallback(async (offset = 0) => {
    const request = ++datasetListRequest.current;
    let list: DatasetSummary[] | undefined;
    try {
      const res = await fetchWithTimeout('/api/datasets?offset=' + offset);
      if (res.ok) {
        const response: unknown = await res.json();
        if (request !== datasetListRequest.current) return;
        const body = isRecord(response) && 'data' in response ? response.data : response;
        if (Array.isArray(body)) list = body.filter(isDatasetSummary);
        const next = res.headers.get('X-Next-Offset');
        setNextDatasetOffset(next && Number(next) > offset ? Number(next) : null);
      } else if (persistent) {
        throw new Error('Could not load the dataset list (HTTP ' + res.status + ').');
      }
    } catch (error) {
      if (request !== datasetListRequest.current) return;
      if (persistent) setNotice({ type: 'error', message: getErrorMessage(error) });
      if (offset > 0) return;
    }
    const merged = new Map<string, DatasetSummary>(sampleDatasets.map(item => [item.id, item]));
    list?.forEach(item => merged.set(item.id, item));
    localDatasets.current.forEach((item, id) => merged.set(id, { id, name: item.name, filename: item.name,
      total_rows: item.totalRows, features_count: item.featureColumns.length, label_column: item.labelColumn,
      id_column: item.idColumn, created_at: new Date().toISOString(), is_local: true }));
    setDatasetList(previous => offset || !list
      ? [...new Map([...previous.filter(item => !item.is_local), ...merged.values()].map(item => [item.id, item])).values()]
      : [...merged.values()]);
  }, [persistent]);

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
    const preset = getSampleDataset(id)?.preset;
    if (preset) {
      setReductionConfig({ ...defaultReduction, ...preset.reduction });
      setClusteringConfig(preset.clustering);
    }
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
      const sample = getSampleDataset(id);
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
          } else if (!sample) {
            throw new Error('Could not load this dataset (HTTP ' + response.status + ').');
          }
        } catch (error) {
          if (!sample) throw error;
        }
      }
      if (!parsed && sample) {
        const response = await fetchWithTimeout(import.meta.env.BASE_URL + sample.assetPath);
        if (!response.ok) throw new Error('Could not load the sample dataset.');
        parsed = parseCSVString(await response.text(), sample.name);
      }
      if (!parsed) throw new Error('This dataset is no longer available.');
      if (request !== datasetRequestRef.current) return undefined;
      return await activateDataset(parsed, id, request);

    } catch (error) {
      if (request === datasetRequestRef.current) setNotice({ type: 'error', message: getErrorMessage(error) });
      return undefined;
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

  // A library preview can open its matching sample directly in Explore.
  useEffect(() => {
    const linkedSample = () => portalRoute(window.location.hash) === 'explore'
      ? getSampleDataset(new URLSearchParams(window.location.hash.split('?')[1]).get('dataset') ?? '')?.id : undefined;
    const followLink = () => {
      const id = linkedSample();
      if (id && id !== currentDatasetId.current) void handleSelectDataset(id);
    };
    void fetchDatasetList();
    void handleSelectDataset(linkedSample() ?? 'cancer_wdbc');
    window.addEventListener('hashchange', followLink);
    return () => window.removeEventListener('hashchange', followLink);
  }, [fetchDatasetList, handleSelectDataset]);

  const showImportedDataset = (item: DatasetSummary) => {
    setDatasetList(previous => [
      ...previous.filter(dataset => dataset.is_preloaded),
      item,
      ...previous.filter(dataset => !dataset.is_preloaded && dataset.id !== item.id),
    ]);
  };

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
        showImportedDataset({ id, name: parsed.name, filename: file.name, total_rows: parsed.totalRows,
          features_count: parsed.featureColumns.length, label_column: parsed.labelColumn,
          id_column: parsed.idColumn, created_at: new Date().toISOString(), is_local: true });
        const refresh = fetchDatasetList();
        if (!await activateDataset(parsed, id, request)) return;
        await refresh;
        if (request !== datasetRequestRef.current) return;
        setNotice({ type: 'info', message: 'CSV opened for this session. The server is unavailable.' });
      };
      const form = new FormData(); form.append('file', file);
      let response: Response;
      try { response = await fetchWithTimeout('/api/datasets/upload', { method: 'POST', body: form }); }
      catch (error) { if (persistent) throw error; await openLocally(); return; }
      if (!persistent && ([502, 503, 504].includes(response.status)
        || (response.status === 500 && !response.headers.get('content-type')?.includes('application/json')))) { await openLocally(); return; }
      const body: unknown = await response.json();
      if (!response.ok) {
        const error = isRecord(body) ? body.error : undefined;
        throw new Error(isRecord(error) && typeof error.message === 'string' ? error.message : 'The server rejected the CSV (HTTP ' + response.status + ').');
      }
      const data = isRecord(body) && 'data' in body ? body.data : body;
      if (!isDatasetDocument(data)) throw new Error('The server returned an invalid dataset.');
      showImportedDataset({ id: data.id, name: data.name, filename: data.filename, total_rows: data.totalRows,
        features_count: data.features.length, label_column: data.labelColumn,
        id_column: data.idColumn, created_at: data.createdAt });
      const refresh = fetchDatasetList();
      if (request !== datasetRequestRef.current) return;
      if (!await activateDataset({ ...parsed, name: data.name, rawRows: data.rawRows, featureColumns: data.features,
        idColumn: data.idColumn, labelColumn: data.labelColumn }, data.id, request)) return;
      await refresh;
      if (request !== datasetRequestRef.current) return;
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
      const computed = await runAnalysis({
        dataset, run, points: backupPointsRef.current ?? dataPoints,
        ...(pcaComponents !== undefined && { components: pcaComponents }),
        ...(metrics.explainedVariance !== undefined && { explainedVariance: metrics.explainedVariance }),
        ...(metrics.totalVarianceExplained !== undefined && { totalExplainedVariance: metrics.totalVarianceExplained }),
        reuseEmbedding: reuseEmbedding && !reductionDirty,
        signal: controller.signal, isCurrent: () => token === operationRef.current, setLoadingMessage,
      });
      if (!computed || token !== operationRef.current) return;
      const { result, matrix, components, explainedVariance, totalVariance } = computed;
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
      setMetrics({
        ...result.metrics,
        ...(explainedVariance !== undefined && { explainedVariance }),
        ...(totalVariance !== undefined && { totalVarianceExplained: totalVariance }),
        executionTimeMs,
      });
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

  const exportReady = dataset !== null && completedRun !== null && completedRun.datasetId === activeDatasetId
    && dataPoints.length > 0 && !isComputing && !isLiveAnimating && !livePreview;
  const dashboardInput = useMemo(() => exportReady && page === 'dashboard'
    ? { dataset, points: dataPoints, run: completedRun, metrics, ...(gmmResult && { gmm: gmmResult }) } : null,
  [exportReady, page, dataset, dataPoints, completedRun, metrics, gmmResult]);
  const handleExport = (format: 'csv' | 'json') => {
    if (!exportReady) return;
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
    const { scores } = analysisOverlay;
    return visiblePoints.map(({ anomalyScore: _previousScore, analysisMatch: _previousMatch, ...point }) => {
      const rowIndex = point.rowIndex ?? -1;
      const matched = rows.has(rowIndex);
      const score = scores?.[rowIndex];
      return {
        ...point,
        cluster: 0,
        isOutlier: Boolean(scores) && matched,
        ...(score !== undefined && { anomalyScore: score }),
        ...(!scores && { analysisMatch: matched }),
        originalFeatures: { ...point.originalFeatures, __anomaly_score: score ?? 0, __rule_match: matched ? 1 : 0 },
      };
    });
  }, [analysisOverlay, livePreview, visiblePoints]);
  const renderSetup = (methodsOnly = false) => {
    const accordionProps = methodsOnly ? {} : { accordion: { open: openSetupMethod, setOpen: setOpenSetupMethod } };
    return <ControlSidebar embedded methodsOnly={methodsOnly} {...accordionProps}
        additionalMethods={dataset && <UnsupervisedPanel history={analysisHistory} active={active} {...accordionProps} key={activeDatasetId + dataset.name} dataset={dataset} projection={completedRun ? completedRun.reduction.method + ' projection' : rawPreviewPoints.length ? 'Raw first three selected numeric features' : 'Unavailable until at least three numeric features are selected'} onRestoreSettings={(features, normalization) => { setSelectedFeatures(features); setReductionConfig(previous => ({ ...previous, normalization })); }} features={selectedFeatures} normalization={reductionConfig.normalization} points={dataPoints.length ? dataPoints : rawPreviewPoints} onSelect={handleSelectPoint} onOverlay={overlay => { if (overlay) { handleResetLiveAnimation(); setFocusedCluster(null); } setAnalysisOverlay(overlay); }} />}
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
        onFileUpload={file => void handleFileUpload(file)}
        isComputing={isComputing}
        hasResults={dataPoints.length > 0}
        onRunComputation={() => void runPipeline()}
        onApplyClustering={() => void handleApplyClustering()}
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
        onSelectDataset={id => void handleSelectDataset(id)}
        onOpenRawDataModal={() => setIsRawDataModalOpen(true)}
        onOpenDatasetManager={() => openWorkspacePage('datasets')}
      />;
  };

  const renderDatasetManager = (importedOnly = false) => (
    <DatasetsPage importedOnly={importedOnly} datasets={datasetList} activeDatasetId={dataset ? activeDatasetId : ''} busy={isComputing}
      {...(nextDatasetOffset !== null && { onLoadMore: () => fetchDatasetList(nextDatasetOffset) })}
      activity={tr(loadingMessage)} notice={notice && { ...notice, message: tr(notice.message) }} onDismissNotice={() => setNotice(null)} onUpload={handleFileUpload}
      onRename={handleRenameDataset} onDelete={handleDeleteDataset} onSelect={async id => {
        const opened = (dataset && id === activeDatasetId) || await handleSelectDataset(id);
        const route = portalRoute(window.location.hash);
        if (opened && (route === 'datasets' || (importedOnly && route === 'library'))) openWorkspacePage('explore');
      }} />
  );
  const pageContent = page === 'datasets' ? renderDatasetManager() : page === 'methods' ? (
    <WorkspacePage title={tr("Methods")} description={datasetTitle ? tr("Configure the next analysis for ") + datasetTitle + '.' : tr("Choose methods for your next analysis.")}
      actions={<a className="lab-action lab-action-primary" href="#/explore">{tr("Review in Explore")}</a>}>
      {isComputing && <p className="lab-page-state" role="status">{tr(loadingMessage || 'Working…')}</p>}
      {renderSetup(true)}
    </WorkspacePage>
  ) : page === 'experiments' ? (
    <Suspense fallback={<WorkspacePage title={tr("Experiments")} description={tr("Find saved runs and reuse their settings.")}><p className="lab-page-state" role="status">{tr("Loading experiments…")}</p></WorkspacePage>}>
      <ExperimentsPage experiments={experiments} onRefresh={() => void fetchExperiments()} isLoading={historyLoading} error={historyError && tr(historyError)}
        storageLabel={dbStatus} activeDatasetId={dataset ? activeDatasetId : ''} availableFeatures={dataset?.featureColumns ?? []}
        isBusy={isComputing || isLiveAnimating}
        onApply={handleApplyExperiment} />
    </Suspense>
  ) : page === 'dashboard' ? (
    <Suspense fallback={<p className="lab-page-state" role="status">{tr('Preparing dashboard…')}</p>}>
      <DashboardPage input={dashboardInput} />
    </Suspense>
  ) : null;

  const plotTitleBadge = analysisOverlay && !livePreview ? analysisOverlay.title
    : livePreview ? tr('t-SNE preview') : isRawDataArea ? tr('Viewing · Raw data') : undefined;
  return (
    <div className="explorer-app font-sans">
      {importsHost && createPortal(renderDatasetManager(true), importsHost)}
      {notice && page !== 'datasets' && page !== 'dashboard' && (
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
        {...(analyzingRun && { analyzingConfiguration: describeRun(analyzingRun) })}
        pendingChanges={pendingChanges}
        previousResult={previousResult}
        analysisError={analysisError}
        onDismissError={() => setAnalysisError(null)}
        onRetry={() => void executeAnalysis(clusteringConfig)}
        selectedPoint={selectedPoint}
        focusedCluster={focusedCluster}
        resultsDirty={resultsDirty}
        isLiveAnimating={isLiveAnimating}
        isComputing={isComputing}
        canRun={Boolean(dataset) && selectedFeatures.length >= MIN_NUMERIC_FEATURES}
        canExport={!livePreview && (visiblePoints.length > 0 || Boolean(completedRun && dataPoints.length > 0))}
        onRun={() => void executeAnalysis(clusteringConfig)}
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
                  {...(plotTitleBadge !== undefined && { titleBadge: plotTitleBadge })}
                  showProjectionBadge={isRawDataArea || Boolean(livePreview)}
                  {...(isRawDataArea && !livePreview && { axisFeatures: rawAxisFeatures })}
                  {...(!isRawDataArea && !livePreview && pcaComponents && { pcaComponents })}
                  featureNames={completedRun?.features ?? selectedFeatures}
                  showBiplot={biplotVisible}
                  biplotTopK={biplotTopK}
                  theme={theme}
                  {...(showGmm && !analysisOverlay && !livePreview && !isRawDataArea && !isPruned
                    && completedRun?.clustering.method === 'GMM' && gmmResult && { gmm: gmmResult })}
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
            {...(!livePreview && {
              onFocusCluster: handleFocusCluster,
              onPruneOutliers: handlePruneOutliers,
              onRestorePoints: handleRestorePoints,
              onSelectPoint: handleSelectPoint,
              ...(dataPoints.length > 0 && { onDeletePoint: handleDeleteSinglePoint }),
            })}
            datasetName={datasetTitle ?? tr('No dataset')}
            totalRows={dataset ? dataset.totalRows : 0}
            hasGroundTruth={Boolean(dataset?.labelColumn)}
            hasResults={completedRun !== null}
            isComputing={isComputing || isLiveAnimating}
            normalization={completedRun ? tr(normalizationLabels[completedRun.reduction.normalization]) : '—'}
            isPruned={isPruned}
            prunedCount={prunedCount}
            dataPoints={dataPoints}
            onSaveExperiment={() => void handleSaveExperiment()}
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
          {...(completedRun && !livePreview && !isComputing && { onDeletePoint: handleDeleteSinglePoint })}
          theme={theme}
        />
              {!selectedPoint && <div className="workspace-inspector-empty"><p>{tr("Select a point to look closer.")}</p></div>}
            </section>
          </>
        )}
      />

      {active && page === 'explore' && isExportModalOpen && <ExportModal
        onClose={() => setIsExportModalOpen(false)} onDownload={handleExport} onSnapshot={() => primarySnapshotRef.current?.()}
        onOpenDashboard={() => {
          if (!exportReady) return;
          setIsExportModalOpen(false);
          openWorkspacePage('dashboard');
        }}
        hasImage={visiblePoints.length > 0} hasResults={exportReady} previousResult={previousResult}
        {...(completedRun && { configuration: describeRun(completedRun) })}
        focused={focusedCluster !== null} />}

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
              if (dataPoints.length > 0) void handleApplyClustering(updatedConfig);
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
                  const data: unknown = await res.json();
                  setDbStatus(isRecord(data) && typeof data.database === 'string' && data.database ? data.database : 'Online');
                }
              } catch {
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
