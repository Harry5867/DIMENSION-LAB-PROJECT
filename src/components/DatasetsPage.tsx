import { useAppLanguage } from "./WelcomeLanguage";
import { useId, useRef, useState } from 'react';
import { ArrowRight, MoreHorizontal, Search, Upload } from 'lucide-react';
import type { DatasetSummary } from '../types';
import { useDialogFocus } from '../utils/useDialogFocus';
import { WorkspacePage } from './WorkspacePage';

interface Props {
  datasets: DatasetSummary[];
  activeDatasetId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpload: (file: File) => void;
  busy: boolean;
  activity: string;
  notice: { type: 'success' | 'error' | 'info'; message: string } | null;
  onDismissNotice: () => void;
}

export function DatasetsPage(props: Props) {
  const { language, tr, t } = useAppLanguage();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<DatasetSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const deleteDialog = useDialogFocus(Boolean(deleting), () => setDeleting(null), '[data-cancel-delete]');
  const rowMenuName = useId();
  const query = search.trim().toLowerCase();
  const displayName = (dataset: DatasetSummary) => dataset.is_preloaded ? tr(dataset.name) : dataset.name;
  const datasets = props.datasets.filter(dataset => [dataset.name, displayName(dataset), dataset.filename].some(value => value.toLowerCase().includes(query)));

  return <WorkspacePage title={tr("Datasets")} description={tr("Choose a sample dataset or import your own CSV.")}
    actions={<>
      <button type="button" className="lab-action lab-action-primary" disabled={props.busy} onClick={() => fileInput.current?.click()}>
        <Upload size={16} /> {tr("Import CSV")}
      </button>
      <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) props.onUpload(file);
      }} />
    </>}>
    {props.busy && <div className="lab-page-state" role="status"><progress aria-label={props.activity || tr("Working")} /> {props.activity || tr("Working…")}</div>}
    {props.notice && <div className="lab-page-state lab-page-notice" data-type={props.notice.type} role={props.notice.type === 'error' ? 'alert' : 'status'}>
      <span>{props.notice.message}</span><button type="button" onClick={props.onDismissNotice} aria-label={tr("Dismiss notification")}>×</button>
    </div>}
    <label className="lab-search"><Search size={16} /><input aria-label={tr("Search datasets")} placeholder={tr("Search datasets…")} value={search} onChange={event => setSearch(event.target.value)} /></label>
    {([true, false] as const).map(sample => {
      const rows = datasets.filter(dataset => Boolean(dataset.is_preloaded) === sample);
      return <section key={String(sample)} className="lab-page-section" aria-labelledby={sample ? 'sample-datasets' : 'imported-datasets'}>
        <h2 id={sample ? 'sample-datasets' : 'imported-datasets'}>{sample ? tr("Sample datasets") : tr("Imported datasets")}</h2>
        {rows.length === 0 ? <p className="lab-page-state">{query ? tr("No matching datasets.") : sample ? tr("No samples available.") : tr("No CSV files imported yet.")}</p> :
          <ul className="lab-list">{rows.map(dataset => {
            const active = dataset.id === props.activeDatasetId;
            return <li key={dataset.id} className="lab-list-row">
              <div className="lab-row-main">
                {editing?.id === dataset.id ? <form className="lab-inline-form" onSubmit={event => {
                  event.preventDefault();
                  const name = editing.name.trim();
                  if (name && !props.busy) { props.onRename(dataset.id, name); setEditing(null); }
                }}>
                  <input autoFocus aria-label={tr("New dataset name")} value={editing.name} onChange={event => setEditing({ id: dataset.id, name: event.target.value })}
                    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setEditing(null); } }} />
                  <button className="lab-action" disabled={props.busy || !editing.name.trim()}>{tr("Save")}</button>
                  <button className="lab-action" type="button" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
                </form> : <h3>{displayName(dataset)}{active && <span className="lab-tag">{tr("Active")}</span>}{dataset.is_local && <span className="lab-tag">{tr("Session only")}</span>}</h3>}
                <p>{dataset.total_rows.toLocaleString(language)} {tr("rows ·")} {dataset.features_count ?? '—'} {tr("numeric features")}</p>
              </div>
              <div className="lab-row-actions">
                <button type="button" className="lab-action" disabled={props.busy}
                  onClick={() => props.onSelect(dataset.id)}>{active ? tr("Open Explore") : tr("Use dataset")} <ArrowRight size={14} /></button>
                <details className="lab-row-menu" name={rowMenuName}>
                  <summary aria-label={t(`Actions for ${displayName(dataset)}`, `Thao tác với ${displayName(dataset)}`)}><MoreHorizontal size={18} /></summary>
                  <div>
                    <button type="button" disabled={props.busy} onClick={event => {
                      const menu = event.currentTarget.closest('details');
                      if (menu) menu.open = false;
                      setEditing({ id: dataset.id, name: dataset.name });
                    }}>{tr("Rename")}</button>
                    {!sample && <button type="button" disabled={props.busy} onClick={() => setDeleting(dataset)}>{tr("Delete")}</button>}
                  </div>
                </details>
              </div>
            </li>;
          })}</ul>}
      </section>;
    })}
    {deleting && <div ref={deleteDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dataset-delete-title" className="lab-modal-backdrop">
      <div className="lab-modal lab-confirm-dialog">
        <header className="lab-modal-header"><h2 id="dataset-delete-title">{tr("Delete dataset?")}</h2></header>
        <div className="lab-modal-body"><p>{deleting.name} {tr("will be removed from your dataset list.")}</p></div>
        <footer className="lab-modal-footer">
          <button type="button" data-cancel-delete onClick={() => setDeleting(null)}>{tr("Cancel")}</button>
          <button type="button" className="lab-action-danger" disabled={props.busy} onClick={() => {
            props.onDelete(deleting.id);
            setDeleting(null);
          }}>{tr("Delete dataset")}</button>
        </footer>
      </div>
    </div>}
  </WorkspacePage>;
}
