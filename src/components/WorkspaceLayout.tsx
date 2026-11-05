import { useDialogFocus } from '../utils/useDialogFocus';
import React, { useEffect, useRef, useState } from 'react';
import { DataPoint } from '../types';
import { ArrowDownToLine, PanelLeft, PanelRight, Play, HelpCircle, LogOut } from 'lucide-react';
import { LabMark } from './LabMark';

export const workspacePages = ['explore', 'datasets', 'methods', 'experiments'] as const;
export type WorkspacePage = typeof workspacePages[number];

interface WorkspaceLayoutProps {
  onSignOut?: () => void;
  page: WorkspacePage;
  pageContent: React.ReactNode;
  controls: React.ReactNode;
  visualization: (view: { isFullscreen: boolean; onToggleFullscreen: () => void; toolbarHost: HTMLDivElement | null }) => React.ReactNode;
  insights: React.ReactNode;
  selection: React.ReactNode;
  pendingChanges: string[];
  previousResult: boolean;
  analyzingConfiguration?: string;
  datasetName: string;
  pointCount: number;
  featureCount: number;
  isComputing: boolean;
  canRun: boolean;
  canExport: boolean;
  activity: string;
  analysisError: string | null;
  onDismissError: () => void;
  onRetry: () => void;
  focusedCluster?: number | null;
  resultsDirty?: boolean;
  selectedPoint?: DataPoint | null;
  isLiveAnimating?: boolean;
  onRun: () => void;
  onExport: () => void;
  onHelp: () => void;
}

/** Presentation shell; analysis state stays owned by App. Panels remain mounted. */
export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  const exploring = props.page === 'explore';
  const pageRef = useRef<HTMLDivElement>(null);
  const previousPage = useRef(props.page);
  useEffect(() => {
    if (previousPage.current === props.page) return;
    previousPage.current = props.page;
    pageRef.current?.focus();
  }, [props.page]);
  const [insightsTab, setInsightsTab] = useState<'metrics' | 'selection'>('metrics');
  const tabListRef = useRef<HTMLDivElement>(null);
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth >= 1100);
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth >= 1100);
  const [compact, setCompact] = useState(() => window.innerWidth < 1100);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const isFullscreen = nativeFullscreen || expanded;
  const wasFullscreen = useRef(false);
  const fullscreenRequest = useRef(false);
  const stageRef = useDialogFocus<HTMLElement>(isFullscreen, () => { void toggleFullscreen(); }, '[data-fullscreen-toggle]');

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage || fullscreenRequest.current) return;
    if (expanded) {
      setExpanded(false);
      return;
    }
    fullscreenRequest.current = true;
    try {
      if (document.fullscreenElement === stage) await document.exitFullscreen();
      else if (document.fullscreenEnabled) await stage.requestFullscreen();
      else setExpanded(true);
    } catch {
      if (stage.isConnected && document.fullscreenElement !== stage) setExpanded(true);
    } finally {
      fullscreenRequest.current = false;
    }
  }

  useEffect(() => {
    const updateFullscreen = () => setNativeFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, [stageRef]);

  useEffect(() => {
    if (exploring) return;
    setExpanded(false);
    if (document.fullscreenElement && document.fullscreenElement === stageRef.current) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [exploring, stageRef]);

  useEffect(() => {
    if (wasFullscreen.current && !isFullscreen && exploring) {
      toolbarHost?.querySelector<HTMLButtonElement>('[data-fullscreen-toggle]')?.focus();
    }
    wasFullscreen.current = isFullscreen;
  }, [exploring, isFullscreen, toolbarHost]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1099px)');
    const update = () => {
      setCompact(query.matches);
      if (query.matches) { setLeftOpen(false); setRightOpen(false); }
    };
    query.addEventListener('change', update);
    const escape = (event: KeyboardEvent) => {
      if (exploring && event.key === 'Escape' && !event.defaultPrevented && !document.fullscreenElement && query.matches) { setLeftOpen(false); setRightOpen(false); }
    };
    window.addEventListener('keydown', escape);
    return () => { query.removeEventListener('change', update); window.removeEventListener('keydown', escape); };
  }, [exploring]);
  const toggleLeft = () => { setLeftOpen(!leftOpen); if (compact) setRightOpen(false); };
  const toggleRight = () => { setRightOpen(!rightOpen); if (compact) setLeftOpen(false); };
  useEffect(() => {
    if (!props.selectedPoint && props.focusedCluster == null) return;
    setInsightsTab('selection');
    setRightOpen(true);
    if (compact) setLeftOpen(false);
  }, [props.selectedPoint, props.focusedCluster, compact]);

  const focusPanelsRef = useRef<{ left: boolean; right: boolean } | null>(null);
  useEffect(() => {
    if (props.focusedCluster != null) {
      focusPanelsRef.current ??= { left: leftOpen, right: rightOpen };
      setLeftOpen(false);
    } else if (focusPanelsRef.current) {
      setLeftOpen(focusPanelsRef.current.left && (!compact || !focusPanelsRef.current.right));
      setRightOpen(focusPanelsRef.current.right);
      focusPanelsRef.current = null;
    }
  }, [props.focusedCluster, compact]);

  const setupDialog = useDialogFocus(exploring && compact && leftOpen && !isFullscreen, () => setLeftOpen(false));
  const insightsDialog = useDialogFocus(exploring && compact && rightOpen && !isFullscreen, () => setRightOpen(false), '[role="tab"][aria-selected="true"]');
  useEffect(() => {
    if (!exploring) return;
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        event.preventDefault();
        if (props.canRun && !props.isComputing && !props.isLiveAnimating) props.onRun();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [exploring, props.onRun, props.canRun, props.isComputing, props.isLiveAnimating]);

  return (
    <div className={'workspace-layout' + (props.focusedCluster != null ? ' focus-active' : '')}>
      <a className="workspace-skip" href="#workspace" onClick={event => {
        event.preventDefault();
        pageRef.current?.focus();
      }}>Skip to content</a>
      <header className="workspace-header">
        <a className="workspace-brand" href="#/explore" aria-label="Dimension Lab home"><LabMark className="brand-mark" /> DIMENSION <span className="brand-slash">/</span> LAB</a>
        <nav aria-label="Main navigation">
          {workspacePages.map(page => <a key={page} href={'#/' + page} aria-current={props.page === page ? 'page' : undefined}>{page.toUpperCase()}</a>)}
        </nav>
        <button className="workspace-icon" onClick={props.onHelp} aria-label="Workspace help"><HelpCircle size={18} /></button>
        {props.onSignOut && <button className="workspace-signout" onClick={props.onSignOut} aria-label="Sign out of demo account"><LogOut size={15} /><span>Sign out</span></button>}
      </header>

      <div id="workspace" ref={pageRef} tabIndex={-1} className="workspace-content">
      <div className="workspace-explore" hidden={!exploring}>
      {compact && <div className="explore-panelbar">
        <button onClick={toggleLeft} aria-expanded={leftOpen} aria-controls="workspace-setup"><PanelLeft size={15} /> Setup <span aria-hidden="true">{leftOpen ? '−' : '+'}</span></button>
        <button onClick={toggleRight} aria-expanded={rightOpen} aria-controls="workspace-insights"><PanelRight size={15} /> Insights <span aria-hidden="true">{rightOpen ? '−' : '+'}</span></button>
      </div>}
      {props.isComputing && <div className="workspace-activity" role="status">
        <progress aria-label={props.analyzingConfiguration ? 'Analyzing' : 'Loading data'} />
        <span>{props.activity || 'Preparing analysis…'}</span>
        {props.analyzingConfiguration && <strong>{props.analyzingConfiguration}</strong>}
      </div>}
      {props.analysisError && <div className="workspace-run-error" role="alert">
        <div><strong>Analysis could not finish</strong><p>{props.analysisError}</p>{props.previousResult && <small>Your previous results are still available.</small>}</div>
        <button onClick={props.onRetry} disabled={!props.canRun || props.isComputing || props.isLiveAnimating}>Try again</button>
        <button onClick={props.onDismissError} aria-label="Dismiss analysis error">×</button>
      </div>}

      <div className={'workspace-body' + (leftOpen ? ' setup-open' : '') + (rightOpen ? ' insights-open' : '')}>
        {compact && (leftOpen || rightOpen) && <button className="workspace-scrim" onClick={() => { setLeftOpen(false); setRightOpen(false); }} aria-label="Close panel" />}
        <aside className="workspace-setup" aria-label="Analysis configuration" hidden={compact && !leftOpen}>
          <div className="workspace-panel-content" ref={setupDialog} role={compact && leftOpen && !isFullscreen ? 'dialog' : undefined} aria-modal={compact && leftOpen && !isFullscreen ? true : undefined} aria-label="Analysis configuration" tabIndex={-1}>
            <header className="workspace-panel-heading">
              <button type="button" className="workspace-panel-toggle" onClick={toggleLeft}
                aria-expanded={leftOpen} aria-controls="workspace-setup" aria-label={leftOpen ? 'Collapse Setup' : 'Open Setup'}
                title={leftOpen ? 'Collapse Setup' : 'Open Setup'}>
                <span>Setup</span><PanelLeft size={15} aria-hidden="true" />
              </button>
              {leftOpen && <div className="explore-context">
                <h1>{props.datasetName}</h1>
                <p>{props.pointCount.toLocaleString('en-US')} points · {props.featureCount} features</p>
              </div>}
            </header>
            <div id="workspace-setup" className="workspace-setup-controls" hidden={!leftOpen}>{props.controls}</div>
          </div>
        </aside>
        <main ref={stageRef} tabIndex={0} className={'workspace-stage' + (expanded ? ' is-expanded' : '')}
          role={isFullscreen ? 'dialog' : undefined} aria-modal={isFullscreen || undefined} aria-label="3D visualization">
          {props.visualization({ isFullscreen, onToggleFullscreen: () => { void toggleFullscreen(); }, toolbarHost })}
        </main>
        <aside className="workspace-insights" aria-label="Exploration insights" hidden={compact && !rightOpen}>
          <div className="workspace-panel-content" ref={insightsDialog} role={compact && rightOpen && !isFullscreen ? 'dialog' : undefined} aria-modal={compact && rightOpen && !isFullscreen ? true : undefined} aria-label="Exploration insights" tabIndex={-1}>
            <header className="workspace-panel-heading">
              <button type="button" className="workspace-panel-toggle" onClick={toggleRight}
                aria-expanded={rightOpen} aria-controls="workspace-insights" aria-label={rightOpen ? 'Collapse Insights' : 'Open Insights'}
                title={rightOpen ? 'Collapse Insights' : 'Open Insights'}>
                <span>Insights</span><PanelRight size={15} aria-hidden="true" />
              </button>
            </header>
            <div id="workspace-insights" className="workspace-insights-controls" hidden={!rightOpen}>
              <div className="explore-insights-tabs" role="tablist" aria-label="Insights" ref={tabListRef} onKeyDown={event => {
                const key = event.key;
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
                event.preventDefault();
                const next = key === 'Home' ? 'metrics' : key === 'End' ? 'selection' : insightsTab === 'metrics' ? 'selection' : 'metrics';
                setInsightsTab(next);
                tabListRef.current?.querySelector<HTMLButtonElement>('#explore-tab-' + next)?.focus();
              }}>
                {(['metrics', 'selection'] as const).map(tab => <button key={tab} id={'explore-tab-' + tab}
                  role="tab" aria-selected={insightsTab === tab} tabIndex={insightsTab === tab ? 0 : -1}
                  aria-controls={'explore-panel-' + tab} onClick={() => setInsightsTab(tab)}>
                  {tab === 'metrics' ? 'Metrics' : 'Selection'}
                </button>)}
              </div>
              <div className="explore-insights-content custom-scrollbar">
                <div id="explore-panel-metrics" role="tabpanel" aria-labelledby="explore-tab-metrics" tabIndex={0} hidden={insightsTab !== 'metrics'}>{props.insights}</div>
                <div id="explore-panel-selection" role="tabpanel" aria-labelledby="explore-tab-selection" tabIndex={0} hidden={insightsTab !== 'selection'}>{props.selection}</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <footer className="workspace-footer">
        <p className="explore-pending" role="status">
          {props.pendingChanges.length > 0 && <><strong>Pending · </strong>{props.pendingChanges.join(' · ')}</>}
        </p>
        <div className="workspace-view-tools" ref={setToolbarHost} />
        <div className="workspace-actions">
          <button aria-keyshortcuts="Control+Enter Meta+Enter" title="Run analysis (Ctrl or Command + Enter)" className="workspace-run" onClick={props.onRun} disabled={!props.canRun || props.isComputing || props.isLiveAnimating}>
            <Play size={14} fill="currentColor" />{props.analyzingConfiguration ? 'Analyzing…' : props.isComputing ? 'Loading…' : props.resultsDirty ? 'Rerun analysis' : 'Run analysis'}
          </button>
          <button className="workspace-export" aria-haspopup="dialog" onClick={props.onExport} disabled={!props.canExport || props.isComputing || props.isLiveAnimating}>
            <ArrowDownToLine size={15} />{props.previousResult ? 'Export previous result' : 'Export'}
          </button>
        </div>
      </footer>
      </div>
      {!exploring && props.pageContent}
      </div>
    </div>
  );
}
