import { FileImage, FileJson, FileSpreadsheet, X } from 'lucide-react';
import { useDialogFocus } from '../utils/useDialogFocus';

interface Props {
  onClose: () => void;
  onDownload: (format: 'csv' | 'json') => void;
  onSnapshot: () => void;
  hasResults: boolean;
  hasImage: boolean;
  previousResult: boolean;
  configuration?: string;
  focused: boolean;
}

export function ExportModal({ onClose, onDownload, onSnapshot, hasResults, hasImage, previousResult, configuration, focused }: Props) {
  const dialogRef = useDialogFocus(true, onClose);
  return (
    <div className="lab-modal-backdrop" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="export-title" tabIndex={-1} className="lab-modal lab-confirm-dialog" onClick={event => event.stopPropagation()}>
        <header className="lab-modal-header">
          <div><h2 id="export-title">{previousResult ? 'Export previous result' : 'Export'}</h2>{configuration && <p>Viewing · {configuration}</p>}</div>
          <button type="button" className="workspace-icon" onClick={onClose} aria-label="Close export"><X size={16} /></button>
        </header>
        <div className="lab-modal-body lab-export-formats">
          <button className="lab-action" type="button" onClick={() => onDownload('csv')} disabled={!hasResults}><FileSpreadsheet size={16} /> Point data <small>.csv</small></button>
          <button className="lab-action" type="button" onClick={onSnapshot} disabled={!hasImage}><FileImage size={16} /> Current 3D view <small>.png</small></button>
          <button className="lab-action" type="button" onClick={() => onDownload('json')} disabled={!hasResults}><FileJson size={16} /> Experiment report <small>.json</small></button>
          {!hasResults && <p>Run analysis to export CSV or JSON.</p>}
          {hasResults && focused && <p>CSV and JSON include all result points. PNG captures the focused view.</p>}
        </div>
      </div>
    </div>
  );
}
