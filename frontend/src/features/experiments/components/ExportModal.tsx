import { useAppLanguage } from "../../../shared/providers/WelcomeLanguage";
import { FileImage, FileJson, FileSpreadsheet, LayoutDashboard, X } from 'lucide-react';
import { useDialogFocus } from '../../../shared/hooks/useDialogFocus';

interface Props {
  onClose: () => void;
  onDownload: (format: 'csv' | 'json') => void;
  onSnapshot: () => void;
  hasResults: boolean;
  hasImage: boolean;
  previousResult: boolean;
  configuration?: string;
  focused: boolean;
  onOpenDashboard: () => void;
}

export function ExportModal({ onClose, onDownload, onSnapshot, hasResults, hasImage, previousResult, configuration, focused, onOpenDashboard }: Props) {
  const { tr } = useAppLanguage();
  const dialogRef = useDialogFocus(true, onClose);
  const title = previousResult ? 'Export previous result' : 'Export';
  return (
    <div className="lab-modal-backdrop" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="export-title" tabIndex={-1} className="lab-modal lab-confirm-dialog" onClick={event => event.stopPropagation()}>
        <header className="lab-modal-header">
          <div><h2 id="export-title">{tr(title)}</h2>{configuration && <p>{tr("Viewing ·")} {tr(configuration)}</p>}</div>
          <button type="button" className="workspace-icon" onClick={onClose} aria-label={tr("Close export")}><X size={16} /></button>
        </header>
        <div className="lab-modal-body lab-export-formats">
          <button className="lab-action lab-action-primary" type="button" disabled={!hasResults}
            onClick={onOpenDashboard}><LayoutDashboard size={16} /> {tr('Analysis Dashboard')} <small>.html</small></button>
          <button className="lab-action" type="button" onClick={() => onDownload('csv')} disabled={!hasResults}><FileSpreadsheet size={16} /> {tr("Point data")} <small>.csv</small></button>
          <button className="lab-action" type="button" onClick={onSnapshot} disabled={!hasImage}><FileImage size={16} /> {tr("Current 3D view")} <small>.png</small></button>
          <button className="lab-action" type="button" onClick={() => onDownload('json')} disabled={!hasResults}><FileJson size={16} /> {tr("Experiment report")} <small>.json</small></button>
          {!hasResults && <p>{tr("Run analysis to export the dashboard, CSV or JSON.")}</p>}
          {hasResults && focused && <p>{tr("Dashboard, CSV and JSON include all result points. PNG captures the focused view.")}</p>}
        </div>
      </div>
    </div>
  );
}
