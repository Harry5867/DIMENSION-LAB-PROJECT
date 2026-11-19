import { ArrowLeft, ChevronDown, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppTheme } from '../../../shared/providers/ThemeProvider';
import { useAppLanguage } from '../../../shared/providers/WelcomeLanguage';
import { createDashboardReport, serializeDashboardReport, type DashboardInput } from '../dashboardReport';
import { downloadText, safeFilename } from '../exportData';
import template from '../analysis-dashboard.html?raw';
import './dashboardPage.css';

export function DashboardPage({ input }: { input: DashboardInput | null }) {
  const { tr } = useAppLanguage();
  const { theme } = useAppTheme();
  const [includeSource, setIncludeSource] = useState(false);
  const [error, setError] = useState(false);
  const report = useMemo(() => {
    if (!input) return null;
    const fields = {
      THEME: theme,
      NONCE: Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join(''),
      PAYLOAD: serializeDashboardReport(createDashboardReport(input, includeSource)),
    };
    return template.replace(/%%(THEME|NONCE|PAYLOAD)%%/g, (_, key: keyof typeof fields) => fields[key]);
  }, [input, includeSource, theme]);

  const download = () => {
    if (!report || !input) return;
    try {
      setError(false);
      downloadText(report, safeFilename(input.dataset.name) + '_dashboard.html', 'text/html;charset=utf-8');
    } catch {
      setError(true);
    }
  };

  return <main className="dashboard-page" aria-labelledby="analysis-dashboard-title">
    <header className="dashboard-toolbar">
      <div className="dashboard-toolbar-context">
        <a href="#/explore" className="dashboard-back"><ArrowLeft size={16} aria-hidden="true" />{tr('Back to results')}</a>
        <h1 id="analysis-dashboard-title">{tr('Analysis Dashboard')}</h1>
      </div>
      {report && <div className="dashboard-toolbar-actions">
        <details className="dashboard-options" onKeyDown={event => {
          if (event.key !== 'Escape' || !event.currentTarget.open) return;
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }}>
          <summary className="lab-action">{tr('Export options')}<ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="dashboard-options-panel">
            <label><input type="checkbox" checked={includeSource} onChange={event => setIncludeSource(event.target.checked)} />
              {tr('Include original CSV columns')}</label>
            <p>{includeSource
              ? tr('The downloaded report will include original cell values for the points shown.')
              : tr('The downloaded report includes result coordinates, IDs and any available labels.')}</p>
          </div>
        </details>
        <button type="button" className="lab-action lab-action-primary" onClick={download}>
          <Download size={15} aria-hidden="true" />{tr('Download HTML')}
        </button>
      </div>}
    </header>
    {error && <p className="dashboard-download-error" role="alert">{tr('Could not download the dashboard. Try again.')}</p>}
    {report ? <iframe className="dashboard-report-view" title={tr('Analysis dashboard preview')} sandbox="allow-scripts"
      srcDoc={report.replace('<html lang="en"', '<html lang="en" data-embedded')} />
      : <div className="dashboard-empty">
        <h2>{tr('No analysis result in this session')}</h2>
        <p>{tr('Run an analysis in Explore to open its dashboard.')}</p>
        <a className="lab-action lab-action-primary" href="#/explore">{tr('Open Explore')}</a>
      </div>}
  </main>;
}
