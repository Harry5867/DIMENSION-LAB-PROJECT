import { useAppLanguage } from "./WelcomeLanguage";
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Activity, GitBranch, X } from 'lucide-react';
import { useDialogFocus } from '../utils/useDialogFocus';
import './analysis-dashboard.css';

interface Props {
  title: string;
  dataset: string;
  createdAt: string;
  kind: 'anomaly' | 'association';
  stats: { label: string; value: string; hint: string }[];
  children: React.ReactNode;
  onClose: () => void;
}

/** Portal keeps the result workspace outside the sidebar's scroll and clipping boundaries. */
export function AnalysisDashboard({ title, dataset, createdAt, kind, stats, children, onClose }: Props) {
  const { language, tr } = useAppLanguage();
  const ref = useDialogFocus(true, onClose, '[data-dashboard-close]');
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  const Icon = kind === 'anomaly' ? Activity : GitBranch;
  return createPortal(
    <div className="analysis-dashboard-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="analysis-dashboard" ref={ref} role="dialog" aria-modal="true" aria-labelledby="analysis-dashboard-title" tabIndex={-1}>
        <header className="analysis-dashboard-header">
          <div className="analysis-dashboard-heading"><span className="analysis-dashboard-icon"><Icon size={22} /></span><div>
            <p className="analysis-dashboard-eyebrow">{tr("ANALYSIS DASHBOARD")}</p>
            <h2 id="analysis-dashboard-title">{tr(title)}</h2>
            <p>{dataset} · {new Date(createdAt).toLocaleString(language)}</p>
          </div></div>
          <button type="button" data-dashboard-close onClick={onClose} className="analysis-dashboard-close" aria-label={tr("Close analysis dashboard")}><X size={20} /></button>
        </header>
        <div className="analysis-dashboard-scroll">
          <section className="analysis-dashboard-stats" aria-label={tr("Summary statistics")}>
            {stats.map(stat => <article key={stat.label}><p>{tr(stat.label)}</p><strong>{stat.value}</strong><small>{tr(stat.hint)}</small></article>)}
          </section>
          <div className="unsupervised-body analysis-dashboard-results">{children}</div>
        </div>
        <footer className="analysis-dashboard-footer"><span>{tr("Results from the completed run · close to return to the 3D workspace")}</span><button type="button" onClick={onClose}>{tr("Back to workspace")}</button></footer>
      </div>
    </div>, document.body
  );
}
