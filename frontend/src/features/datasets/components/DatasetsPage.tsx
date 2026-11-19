import { useAppLanguage } from "../../../shared/providers/WelcomeLanguage";
import { useId, useRef, useState } from 'react';
import { ArrowRight, MoreHorizontal, Search, Upload } from 'lucide-react';
import { getSampleDataset, type DatasetRow, type DatasetSummary } from '@dimension-lab/contracts';
import { parseCSVString } from '@dimension-lab/algorithms/dataParser';
import { useDialogFocus } from '../../../shared/hooks/useDialogFocus';
import { fetchWithTimeout } from '../../../shared/api/network';
import { getApiDataRecord, getErrorMessage, isDatasetRow, isRecord } from '../../../shared/api/typeGuards';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { RawDataModal } from './RawDataModal';

interface Props {
  importedOnly?: boolean;
  datasets: DatasetSummary[];
  activeDatasetId: string;
  onSelect: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  busy: boolean;
  activity: string;
  notice: { type: 'success' | 'error' | 'info'; message: string } | null;
  onDismissNotice: () => void;
  onLoadMore?: () => Promise<void>;
}

export function DatasetsPage(props: Props) {
  const { language, tr, t } = useAppLanguage();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<DatasetSummary | null>(null);
  const [preview, setPreview] = useState<{ dataset: DatasetSummary; rows: DatasetRow[] } | null>(null);
  const [requestError, setRequestError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const deleteDialog = useDialogFocus(Boolean(deleting), () => setDeleting(null), '[data-cancel-delete]');
  const rowMenuName = useId();
  const sectionId = useId();
  const query = search.trim().toLowerCase();
  const displayName = (dataset: DatasetSummary) => dataset.is_preloaded ? tr(dataset.name) : dataset.name;
  const datasets = props.datasets.filter(dataset => [dataset.name, displayName(dataset), dataset.filename,
    getSampleDataset(dataset.id)?.preset?.topic ?? ''].some(value => value.toLowerCase().includes(query)));
  const requestDataset = async (dataset: DatasetSummary, action: 'preview' | 'download') => {
    setRequesting(true); setRequestError('');
    try {
      const sample = getSampleDataset(dataset.id);
      const response = await fetchWithTimeout(sample ? import.meta.env.BASE_URL + sample.assetPath
        : '/api/datasets/' + encodeURIComponent(dataset.id) + '/' + action);
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = isRecord(body) && isRecord(body.error) ? body.error.message : undefined;
        throw new Error(typeof message === 'string' ? message : 'Could not open the dataset (HTTP ' + response.status + ').');
      }
      if (action === 'preview') {
        const rows = sample ? parseCSVString(await response.text(), sample.name).rawRows.slice(0, 20)
          : getApiDataRecord(await response.json())?.rows;
        if (!Array.isArray(rows) || !rows.every(isDatasetRow)) throw new Error('Invalid dataset preview.');
        setPreview({ dataset, rows });
      } else {
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = dataset.filename;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) { setRequestError(getErrorMessage(error)); }
    finally { setRequesting(false); }
  };

  const actions = <>
      <button type="button" className="lab-action lab-action-primary" disabled={props.busy} onClick={() => fileInput.current?.click()}>
        <Upload size={16} /> {tr("Import CSV")}
      </button>
      <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void props.onUpload(file);
      }} />
    </>;
  const content = <>
    {props.busy && <div className="lab-page-state" role="status"><progress aria-label={props.activity || tr("Working")} /> {props.activity || tr("Working…")}</div>}
    {props.notice && <div className="lab-page-state lab-page-notice" data-type={props.notice.type} role={props.notice.type === 'error' ? 'alert' : 'status'}>
      <span>{props.notice.message}</span><button type="button" onClick={props.onDismissNotice} aria-label={tr("Dismiss notification")}>×</button>
    </div>}
    {requestError && <p className="lab-page-state" role="alert">{tr(requestError)}</p>}
    <label className="lab-search"><Search size={16} /><input aria-label={tr("Search datasets")} placeholder={tr("Search datasets…")} value={search} onChange={event => setSearch(event.target.value)} /></label>
    {(props.importedOnly ? [false] : [true, false]).map(sample => {
      const rows = datasets.filter(dataset => Boolean(dataset.is_preloaded) === sample);
      const heading = sectionId + (sample ? '-sample' : '-imported');
      return <section key={String(sample)} className="lab-page-section" aria-labelledby={heading}>
        <div className="lab-dataset-section-heading">
          <h2 id={heading}>{sample ? tr("Sample datasets") : tr("Imported datasets")}</h2>
          {props.importedOnly && actions}
        </div>
        {rows.length === 0 ? <p className="lab-page-state">{query ? tr("No matching datasets.") : sample ? tr("No samples available.") : tr("No CSV files imported yet.")}</p> :
          <ul className="lab-list">{rows.map(dataset => {
            const active = dataset.id === props.activeDatasetId;
            const preset = getSampleDataset(dataset.id)?.preset;
            return <li key={dataset.id} className="lab-list-row">
              <div className="lab-row-main">
                {editing?.id === dataset.id ? <form className="lab-inline-form" onSubmit={event => {
                  event.preventDefault();
                  const name = editing.name.trim();
                  if (name && !props.busy) { void props.onRename(dataset.id, name); setEditing(null); }
                }}>
                  <input autoFocus aria-label={tr("New dataset name")} value={editing.name} onChange={event => setEditing({ id: dataset.id, name: event.target.value })}
                    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setEditing(null); } }} />
                  <button className="lab-action" disabled={props.busy || !editing.name.trim()}>{tr("Save")}</button>
                  <button className="lab-action" type="button" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
                </form> : <h3>{displayName(dataset)}{active && <span className="lab-tag">{tr("Active")}</span>}{dataset.is_local && <span className="lab-tag">{tr("Session only")}</span>}</h3>}
                <p>{dataset.total_rows.toLocaleString(language)} {tr("rows ·")} {dataset.features_count ?? '—'} {tr("numeric features")}</p>
                {preset && <>
                  <p>{tr(preset.topic)} · {tr(preset.description)}</p>
                  <p>{t('Suggested run', 'Phân tích gợi ý')} · {preset.reduction.method} + {preset.clustering.method}
                    {' · '}<a href={preset.source} target="_blank" rel="noreferrer" title={preset.credit}>{t('Source', 'Nguồn')} ({preset.license})</a>
                  </p>
                </>}
              </div>
              <div className="lab-row-actions">
                <button type="button" className="lab-action" disabled={props.busy}
                  onClick={() => void props.onSelect(dataset.id)}>{active ? tr("Open Explore") : tr("Use dataset")} <ArrowRight size={14} /></button>
                <details className="lab-row-menu" name={rowMenuName}>
                  <summary aria-label={t(`Actions for ${displayName(dataset)}`, `Thao tác với ${displayName(dataset)}`)}><MoreHorizontal size={18} /></summary>
                  <div>
                    {!dataset.is_local && <>
                      <button type="button" disabled={requesting} onClick={() => void requestDataset(dataset, 'preview')}>{t('Preview first 20 rows', 'Xem trước 20 hàng đầu')}</button>
                      <button type="button" disabled={requesting} onClick={() => void requestDataset(dataset, 'download')}>{t('Download original CSV', 'Tải CSV gốc')}</button>
                    </>}
                    {!sample && <button type="button" disabled={props.busy} onClick={event => {
                      const menu = event.currentTarget.closest('details');
                      if (menu) menu.open = false;
                      setEditing({ id: dataset.id, name: dataset.name });
                    }}>{tr("Rename")}</button>}
                    {!sample && <button type="button" disabled={props.busy} onClick={() => setDeleting(dataset)}>{tr("Delete")}</button>}
                  </div>
                </details>
              </div>
            </li>;
          })}</ul>}
      </section>;
    })}
    {props.onLoadMore && <button className="lab-action" disabled={props.busy || requesting} onClick={() => {
      setRequesting(true); void props.onLoadMore?.().finally(() => setRequesting(false));
    }}>{t('Load more datasets', 'Tải thêm bộ dữ liệu')}</button>}
    {preview && <RawDataModal isOpen onClose={() => setPreview(null)} datasetName={displayName(preview.dataset)}
      headers={Object.keys(preview.rows[0] ?? {})} rawRows={preview.rows} totalRows={preview.dataset.total_rows}
      labelColumn={preview.dataset.label_column} previewOnly />}
    {deleting && <div ref={deleteDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dataset-delete-title" className="lab-modal-backdrop">
      <div className="lab-modal lab-confirm-dialog">
        <header className="lab-modal-header"><h2 id="dataset-delete-title">{tr("Delete dataset?")}</h2></header>
        <div className="lab-modal-body"><p>{deleting.name} {tr("will be removed from your dataset list.")}</p></div>
        <footer className="lab-modal-footer">
          <button type="button" data-cancel-delete onClick={() => setDeleting(null)}>{tr("Cancel")}</button>
          <button type="button" className="lab-action-danger" disabled={props.busy} onClick={() => {
            void props.onDelete(deleting.id);
            setDeleting(null);
          }}>{tr("Delete dataset")}</button>
        </footer>
      </div>
    </div>}
  </>;
  if (props.importedOnly) return <div className="lab-dataset-library">{content}</div>;
  return <WorkspacePage title={tr("Datasets")} description={tr("Choose a sample dataset or import your own CSV.")} actions={actions}>{content}</WorkspacePage>;
}
