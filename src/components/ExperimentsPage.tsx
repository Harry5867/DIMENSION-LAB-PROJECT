import { useAppLanguage } from "./WelcomeLanguage";
import { useMemo, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import { ExperimentRecord } from '../types';
import { experimentConfiguration } from '../utils/history';
import { downloadText, safeFilename } from '../utils/exportData';
import { normalizationLabels } from '../utils/exploration';
import { WorkspacePage } from './WorkspacePage';

interface Props {
  experiments: ExperimentRecord[];
  onRefresh: () => void;
  isLoading: boolean;
  error: string | null;
  storageLabel: string;
  activeDatasetId: string;
  availableFeatures: readonly string[];
  isBusy: boolean;
  onApply: (record: ExperimentRecord) => void;
}

export function ExperimentsPage(props: Props) {
  const { language, tr } = useAppLanguage();
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => props.experiments
    .filter(record => [record.dataset_name, record.reduction_method, record.clustering_method].join(' ').toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)), [props.experiments, search]);
  const score = (value: number | null) => value !== null && Number.isFinite(value) ? value.toFixed(3) : '—';
  return <WorkspacePage title={tr("Experiments")} description={tr("Find saved runs and reuse their settings.")}
    actions={<button className="lab-action" onClick={props.onRefresh} disabled={props.isLoading}><RefreshCw size={15} /> {tr("Refresh")}</button>}>
      <label className="lab-search"><Search size={16} /><input aria-label={tr("Search experiments")} value={search} onChange={event => setSearch(event.target.value)} placeholder={tr("Search by dataset or method…")} /></label>
      <div className="lab-page-section" aria-busy={props.isLoading}>
        {props.storageLabel.includes('In-Memory') && <p className="lab-page-state">{tr("In-memory history clears when the server restarts.")}</p>}
        {props.isLoading && <p role="status" className="lab-page-state">{tr("Loading experiments…")}</p>}
        {props.error && <div role="alert" className="lab-page-state lab-page-notice" data-type="error"><span>{props.error}{props.experiments.length > 0 && tr(' Showing previously loaded experiments.')}</span><button className="lab-action" onClick={props.onRefresh} disabled={props.isLoading}>{tr("Try again")}</button></div>}
        {!props.isLoading && !props.error && filtered.length === 0 && <div className="lab-page-state"><strong>{search ? tr("No matching experiments") : tr("No saved experiments")}</strong><p>{search ? tr("Try another dataset name or method.") : tr("Run analysis, then choose Save experiment in Insights.")}</p></div>}
        {filtered.length > 0 && <ul className="lab-list">{filtered.map(record => {
          const configuration = experimentConfiguration(record);
          const restoreReason = !configuration ? 'Saved settings are incomplete.' :
            record.dataset_id !== props.activeDatasetId ? 'Open the original dataset to restore these settings.' :
            configuration.features.some(feature => !props.availableFeatures.includes(feature)) ? 'The dataset is missing features required by this experiment.' :
            props.isBusy ? 'Wait until the current operation finishes.' : null;
          const reduction = configuration?.reduction;
          const clustering = configuration?.clustering;
          return <li className="lab-list-row lab-experiment-row" key={record.id}>
            <div className="lab-row-main">
              <h3>{record.dataset_id === 'cancer_wdbc' || record.dataset_id === 'wholesale_customers' ? tr(record.dataset_name) : record.dataset_name}</h3>
              <p>{record.reduction_method} · {record.clustering_method === 'None' ? tr("No clustering") : record.clustering_method}</p>
            </div>
            <div className="lab-experiment-metrics"><span>Silhouette <strong>{score(record.silhouette_score)}</strong></span><span>ARI <strong>{score(record.ari)}</strong></span></div>
            <time className="lab-row-time" dateTime={record.created_at}>{new Date(record.created_at).toLocaleString(language)}</time>
            <details className="lab-experiment-details">
              <summary>{tr("Saved configuration")}</summary>
              {configuration && reduction && clustering ? <dl className="lab-config">
                <div><dt>{tr("Normalization")}</dt><dd>{tr(normalizationLabels[reduction.normalization])}</dd></div>
                {reduction.method === 'UMAP' && <div><dt>{tr("Neighbors / Minimum distance")}</dt><dd>{reduction.nNeighbors} / {reduction.minDist}</dd></div>}
                {reduction.method === 't-SNE' && <div><dt>{tr("Perplexity / Learning rate / Iterations")}</dt><dd>{reduction.perplexity} / {reduction.learningRate} / {reduction.iterations}</dd></div>}
                {clustering.method === 'K-Means' && <div><dt>{tr("Cluster count")}</dt><dd>{clustering.k}</dd></div>}
                {clustering.method === 'DBSCAN' && <div><dt>{tr("Radius (ε) / Minimum points")}</dt><dd>{clustering.epsilon} / {clustering.minPts}</dd></div>}
                <div><dt>{tr("Features (")}{configuration.features.length})</dt><dd>{configuration.features.join(', ')}</dd></div>
              </dl> : <p>{tr("Configuration details are unavailable for this record.")}</p>}
              <div className="lab-row-actions">
                <button className="lab-action" onClick={() => downloadText(JSON.stringify(record, null, 2), safeFilename(record.dataset_name) + '_experiment_' + safeFilename(String(record.id)) + '.json', 'application/json')}><Download size={14} /> {tr("Export JSON")}</button>
                <button className="lab-action lab-action-primary" onClick={() => props.onApply(record)} disabled={Boolean(restoreReason)}>{tr("Restore settings")}</button>
              </div>
              {restoreReason && <p className="lab-row-time">{tr(restoreReason)}</p>}
            </details>
          </li>;
        })}</ul>}
      </div>
  </WorkspacePage>;
}
