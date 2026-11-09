import { useAppLanguage } from "./WelcomeLanguage";
import { ResultTable } from './ResultTable';
import { compareRow, describeItem, ruleRows } from '../utils/analysisPresentation';
import { RuleStrengthChart } from './RuleStrengthChart';
import { AnalysisDashboard } from './AnalysisDashboard';
import { Activity, GitBranch, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { RangeNumber } from './RangeNumber';
import { useEffect, useRef, useState } from 'react';
import { DataPoint, NormalizationMethod, ParsedDataset } from '../types';
import { AnalysisTask, AnalysisTaskResult, parseAnalysisTask } from '../algorithms/analysisTasks';
import { AssociationRule } from '../algorithms/apriori';
import { csvText, downloadText } from '../utils/exportData';
import './unsupervised.css';

export interface AnalysisOverlay { scores?: number[]; rows: number[]; title: string }
interface SavedRun { dataset: string; createdAt: string; task: AnalysisTask; result: AnalysisTaskResult }
interface Props { active?: boolean; projection: string; onRestoreSettings: (features: string[], normalization: NormalizationMethod) => void; dataset: ParsedDataset; features: string[]; normalization: NormalizationMethod; points: DataPoint[]; onSelect: (point: DataPoint) => void; onOverlay: (overlay: AnalysisOverlay | null) => void }


export function UnsupervisedPanel({ active = true, dataset, features, normalization, points, onSelect, onOverlay, projection, onRestoreSettings }: Props) {
  const { language, tr, t } = useAppLanguage();
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<'anomaly' | 'association'>('anomaly');
  const [trees, setTrees] = useState(100), [sampleSize, setSampleSize] = useState(256), [contamination, setContamination] = useState(0.05), [seed, setSeed] = useState(42);
  const [support, setSupport] = useState(0.15), [confidence, setConfidence] = useState(0.7), [lift, setLift] = useState(1), [bins, setBins] = useState(3), [maxSize, setMaxSize] = useState(3);
  const [columns, setColumns] = useState<string[]>(() => dataset.headers.filter(f => f !== dataset.idColumn && f !== dataset.labelColumn).slice(0, 10));
  const [runs, setRuns] = useState<Partial<Record<'anomaly' | 'association', SavedRun>>>({});
  const run = runs[kind] ?? null;
  const setRun = (r: SavedRun) => setRuns(previous => ({ ...previous, [r.task.kind]: r }));
  const [query, setQuery] = useState(''), [ruleSupport, setRuleSupport] = useState(0), [ruleConfidence, setRuleConfidence] = useState(0), [ruleLift, setRuleLift] = useState(0);
  const [inspectedRow, setInspectedRow] = useState<number | null>(null), [memberScope, setMemberScope] = useState<'antecedent' | 'both' | 'exceptions'>('both');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [selectedRule, setSelectedRule] = useState<AssociationRule | null>(null), [minimumScore, setMinimumScore] = useState(0), [onlyAnomalies, setOnlyAnomalies] = useState(true), [sort, setSort] = useState<'lift' | 'confidence' | 'support'>('lift');
  const detailRef = useRef<HTMLDivElement>(null), rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (dashboardOpen && selectedRule) detailRef.current?.scrollIntoView({ block: 'nearest' }); }, [selectedRule]);
  useEffect(() => { if (dashboardOpen && inspectedRow !== null) rowRef.current?.scrollIntoView({ block: 'nearest' }); }, [inspectedRow]);
  useEffect(() => { setQuery(''); setInspectedRow(null); setSelectedRule(null); setRuleSupport(0); setRuleConfidence(0); setRuleLift(0); }, [kind]);
  const [saved, setSaved] = useState<SavedRun[]>([]);
  const generation = useRef(0);
  const worker = useRef<Worker | null>(null), cache = useRef(new Map<string, AnalysisTaskResult>());
  useEffect(() => {
    if (active) return;
    generation.current++; worker.current?.terminate(); worker.current = null;
    setBusy(false); setDashboardOpen(false);
  }, [active]);
  useEffect(() => { try { const value = JSON.parse(localStorage.getItem('unsupervised-runs-v1') ?? '[]'); if (Array.isArray(value)) setSaved(value.filter(r => { try { parseAnalysisTask(r.task); return r.result?.kind === r.task.kind && (r.result.kind !== 'anomaly' || (r.result.scores?.length === r.task.rows.length && r.result.scores.every((score: unknown) => typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1) && r.result.anomalies?.length === r.task.rows.length && r.result.anomalies.every((flag: unknown) => typeof flag === 'boolean') && Number.isFinite(r.result.threshold))) && typeof r.dataset === 'string' && typeof r.createdAt === 'string' && r.result && ((r.result.kind === 'anomaly' && Array.isArray(r.result.scores) && Array.isArray(r.result.anomalies)) || (r.result.kind === 'association' && Array.isArray(r.result.rules) && Array.isArray(r.result.transactions) && Array.isArray(r.result.binning))); } catch { return false; } }).slice(0, 5)); } catch { /* Storage unavailable. */ } return () => worker.current?.terminate(); }, []);
  const task: AnalysisTask = kind === 'anomaly' ? { kind, rows: dataset.rawRows, features, normalization, options: { trees, sampleSize, contamination, seed } }
    : { kind, rows: dataset.rawRows, features: columns, options: { support, confidence, lift, bins, maxSize } };
  const dirty = run !== null && JSON.stringify(task) !== JSON.stringify(run.task);
  const execute = () => {
    const operation = ++generation.current;
    worker.current?.terminate(); setDashboardOpen(false); onOverlay(null); setBusy(true); setInspectedRow(null); setQuery(''); setError(''); setSelectedRule(null); setStatus('');
    const snapshot = structuredClone(task), key = JSON.stringify(snapshot);
    setRuleSupport(0); setRuleConfidence(0); setRuleLift(0); setMinimumScore(0); setOnlyAnomalies(true); setMemberScope('both');
    const finish = (result: AnalysisTaskResult, fromCache = false) => {
      setKind(snapshot.kind); setRun({ dataset: dataset.name, createdAt: new Date().toISOString(), task: snapshot, result }); setBusy(false); setDashboardOpen(true);
      if (result.kind === 'anomaly') onOverlay({ scores: result.scores, rows: result.anomalies.flatMap((flag, i) => flag ? [i] : []), title: 'Isolation Forest · anomaly score' });
      setStatus(fromCache ? 'Loaded identical input from session cache.' : 'Analysis complete.');
      if (cache.current.size >= 3) cache.current.delete(cache.current.keys().next().value!); cache.current.set(key, result);
    };
    const cached = cache.current.get(key); if (cached) { finish(cached, true); return; }
    try {
      const w = new Worker(new URL('../algorithms/analysis.worker.ts', import.meta.url), { type: 'module' }); worker.current = w;
      w.onmessage = event => { if (operation !== generation.current) return; w.terminate(); worker.current = null; if (event.data.error) { setError(event.data.error); setBusy(false); } else finish(event.data.result); };
      w.onerror = () => { if (operation !== generation.current) return; w.terminate(); worker.current = null; setBusy(false); setError('Analysis worker failed. Reduce data size and retry.'); };
      w.postMessage(snapshot);
    } catch (e) { setBusy(false); setError(e instanceof Error ? e.message : 'Unable to start worker.'); }
  };
  const selectRow = (index: number) => { setInspectedRow(index); };
  const viewRow3D = (index: number) => { const p = points.find(p => p.rowIndex === index); if (p) { onSelect(p); setDashboardOpen(false); } else setError('This row is not present in the current 3D view. Restore removed points or select at least three numeric features.'); };
  const applyRule = (rule: AssociationRule, both: boolean, highlight = false) => {
    if (run?.result.kind !== 'association') return;
    setSelectedRule(rule);
    setMemberScope(both ? 'both' : 'antecedent');
    const rows = ruleRows(run.result.transactions, rule, both ? 'both' : 'antecedent');
    if (highlight) onOverlay({ rows, title: both ? 'Rows matching both rule sides' : 'Rows matching antecedent' });
  };
  const exportRun = () => { if (run) downloadText(JSON.stringify(run, null, 2), 'unsupervised-result.json', 'application/json'); };
  const save = () => { if (!run) return; try { const next = [run, ...saved].slice(0, 5); localStorage.setItem('unsupervised-runs-v1', JSON.stringify(next)); setSaved(next); setStatus('Saved in this browser.'); } catch { setError('Browser storage is full or unavailable. Export JSON to retain this result.'); } };
  const restore = (r: SavedRun) => {
    if (JSON.stringify(r.task.rows) !== JSON.stringify(dataset.rawRows)) { setError('Select the original dataset before restoring this run.'); return; }
    setKind(r.task.kind); setExpanded(true); setRun(r); setDashboardOpen(true); setInspectedRow(null); setQuery(''); onOverlay(r.result.kind === 'anomaly' ? { scores: r.result.scores, rows: r.result.anomalies.flatMap((v, i) => v ? [i] : []), title: 'Isolation Forest · anomaly score' } : null); setSelectedRule(null); setError('');
    if (r.task.kind === 'anomaly') { onRestoreSettings(r.task.features, r.task.normalization); const o = r.task.options; setTrees(o.trees); setSampleSize(o.sampleSize); setContamination(o.contamination); setSeed(o.seed); }
    else { const o = r.task.options; setColumns(r.task.features); setSupport(o.support); setConfidence(o.confidence); setLift(o.lift); setBins(o.bins); setMaxSize(o.maxSize); }
    setStatus('Restored saved result and its settings.');
  };
  const number = (label: string, value: number, change: (v: number) => void, min: number, max: number, step = 1) => <RangeNumber label={label} value={value} min={min} max={max} step={step} onChange={change} disabled={busy} />;
  const result = run?.result;
  const itemLabel = (item: string) => describeItem(item, result?.kind === 'association' ? result.binning : []);
  const rowId = (i: number) => String(run?.task.rows[i]?.[dataset.idColumn ?? ''] ?? i + 1);
  const matchesQuery = (i: number) => !query.trim() || `${i + 1} ${rowId(i)}`.toLowerCase().includes(query.trim().toLowerCase());
  const histogram = Array<number>(20).fill(0);
  if (result?.kind === 'anomaly') result.scores.forEach(score => histogram[Math.min(19, Math.max(0, Math.floor(score * 20)))]++);
  const histogramPeak = Math.max(1, ...histogram);
  const anomalyPercent = result?.kind === 'anomaly' ? 100 * result.anomalies.filter(Boolean).length / result.scores.length : 0;
  const anomalyRows = result?.kind === 'anomaly' ? result.scores.map((score, row) => ({ score, row, anomaly: result.anomalies[row] })).filter(r => r.score >= minimumScore && (!onlyAnomalies || r.anomaly) && matchesQuery(r.row)).sort((a, b) => b.score - a.score) : [];
  const rules = result?.kind === 'association' ? result.rules.filter(r => r.support >= ruleSupport && r.confidence >= ruleConfidence && r.lift >= ruleLift && [...r.antecedent, ...r.consequent].map(itemLabel).join(' ').toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b[sort] - a[sort]) : [];
  const networkRules = rules.slice(0, 30);
  const networkItems = [...new Set(networkRules.flatMap(r => [...r.antecedent, ...r.consequent]))].slice(0, 24);
  const position = (item: string) => { const angle = networkItems.indexOf(item) * Math.PI * 2 / Math.max(1, networkItems.length); return { x: 180 + 115 * Math.cos(angle), y: 140 + 100 * Math.sin(angle) }; };
  const matchRows = result?.kind === 'association' && selectedRule ? ruleRows(result.transactions, selectedRule, memberScope) : [];
  const body = <div className="unsupervised-body">
      <div className="grid grid-cols-1 gap-1.5"><button type="button" className="unsupervised-method" aria-pressed="true">{kind === 'anomaly' ? 'Isolation Forest' : 'Apriori'}</button></div>
      {kind === 'anomaly' ? <><p>{tr("Isolation Forest runs on")} {features.length} {tr("selected numeric features with")} {normalization === 'none' ? tr('No normalization') : normalization} {tr("preprocessing. Higher scores indicate easier isolation. DBSCAN noise is a separate result.")}</p><div className="unsupervised-fields">{number('Trees', trees, setTrees, 1, 500)}{number('Sample size', sampleSize, setSampleSize, 2, 4096)}{number('Expected anomaly fraction', contamination, setContamination, 0.001, 0.5, 0.01)}{number('Random seed', seed, setSeed, 0, 4294967295)}</div></>
      : <><p>{tr("Apriori uses original rows. Numeric values use equal-width bins; missing values create no item. ID is excluded; the label is opt-in.")}</p><details><summary>{tr("Columns (")}{columns.length})</summary><div className="unsupervised-columns">{dataset.headers.filter(f => f !== dataset.idColumn).map(f => <label key={f}><input type="checkbox" checked={columns.includes(f)} disabled={busy} onChange={() => setColumns(columns.includes(f) ? columns.filter(c => c !== f) : [...columns, f])} />{f}{f === dataset.labelColumn ? tr(" (label)") : ''}</label>)}</div></details><div className="unsupervised-fields">{number('Minimum support (0–1)', support, setSupport, 0.001, 1, 0.05)}{number('Minimum confidence (0–1)', confidence, setConfidence, 0.001, 1, 0.05)}{number('Minimum lift', lift, setLift, 0, 100, 0.1)}{number('Bins', bins, setBins, 2, 10)}{number('Maximum itemset size', maxSize, setMaxSize, 2, 4)}</div></>}
      <button className="unsupervised-run" disabled={busy || !(kind === 'anomaly' ? features.length : columns.length)} onClick={execute}><Play size={12} />{busy ? tr("Computing in background…") : `${tr('Run')} ${kind === 'anomaly' ? 'Isolation Forest' : 'Apriori'}`}</button>
      {busy && <button onClick={() => { generation.current++; worker.current?.terminate(); worker.current = null; setBusy(false); setStatus('Cancelled.'); }}>{tr("Cancel")}</button>}
      {error && <p role="alert">{tr(error)}</p>}{status && <p role="status">{tr(status)}</p>}
      {run && run.task.kind === kind && <button type="button" className="unsupervised-run" onClick={() => setDashboardOpen(true)}>{tr("Open results dashboard")}</button>}
      {!!saved.length && <details><summary>{tr("Local analysis history (")}{saved.length}/5)</summary>{saved.map((r, i) => <p key={i}><button disabled={busy} onClick={() => restore(r)}>{r.dataset} · {tr(r.task.kind)} · {new Date(r.createdAt).toLocaleString(language)}</button></p>)}</details>}
    </div>;
  const stats = result?.kind === 'anomaly' ? [
    { label: 'Rows analyzed', value: result.scores.length.toLocaleString(), hint: 'Source rows in the completed run' },
    { label: 'Anomalies', value: result.anomalies.filter(Boolean).length.toLocaleString(), hint: 'Points at or above the score threshold' },
    { label: 'Anomaly rate', value: (100 * result.anomalies.filter(Boolean).length / result.scores.length).toFixed(1) + '%', hint: 'Threshold ties are included' },
    { label: 'Score threshold', value: result.threshold.toFixed(4), hint: 'Higher score means easier isolation' },
  ] : result?.kind === 'association' ? [
    { label: 'Transactions', value: result.transactions.length.toLocaleString(), hint: 'One transaction per source row' },
    { label: 'Frequent itemsets', value: result.frequentItemsets.toLocaleString(), hint: 'Itemsets meeting minimum support' },
    { label: 'Association rules', value: result.rules.length.toLocaleString(), hint: result.truncated ? 'First 5,000 qualifying rules retained' : 'Rules meeting all configured thresholds' },
    { label: 'Highest lift', value: result.rules.length ? Math.max(...result.rules.map(r => r.lift)).toFixed(2) + '×' : '—', hint: 'Strength relative to baseline occurrence' },
  ] : [];
  const dashboard = active && dashboardOpen && run && <AnalysisDashboard title={run.result.kind === 'anomaly' ? tr("Anomaly Detection · Isolation Forest") : tr("Association Rules · Apriori")} dataset={dataset.id === 'cancer_wdbc' || dataset.id === 'wholesale_customers' ? tr(run.dataset) : run.dataset} createdAt={run.createdAt} kind={run.result.kind} stats={stats} onClose={() => setDashboardOpen(false)}>
      {run && <section><p className="analysis-projection-note">{tr("3D view:")} {tr(projection)}{tr(". Anomaly scores use the selected input features; rule membership uses original rows. Removed points are excluded from the 3D view.")}</p><p><strong>{tr("Viewing")} {run.result.kind === 'anomaly' ? 'Isolation Forest' : 'Apriori'}</strong> · {new Date(run.createdAt).toLocaleString(language)}{dirty ? tr(" · Settings changed; rerun to update") : ''}</p>
        <details><summary>{tr("Completed run configuration")}</summary><pre>{JSON.stringify({ ...run.task, rows: `${run.task.rows.length} source rows` }, null, 2)}</pre></details>
        <p>{tr("CSV buttons distinguish the complete result from the currently filtered rows. JSON includes the completed configuration and result.")}</p><div className="unsupervised-tabs"><button onClick={save}>{tr("Save locally")}</button><button onClick={exportRun}>{tr("Export JSON")}</button><button onClick={() => onOverlay(null)}>{tr("Clear 3D overlay")}</button></div>
        {result?.kind === 'anomaly' && <>
          <details><summary>{tr("Missing-value handling")}</summary><p>{tr("Invalid or missing numeric values are replaced with the mean of the valid values in the same column before normalization.")}</p>{result.preprocessing ? <ResultTable rows={result.preprocessing} label={tr("Numeric preprocessing")} headers={['Feature', 'Values replaced', 'Replacement mean']} render={p => <tr key={p.feature}><td>{p.feature}</td><td>{p.missing}</td><td>{p.mean.toPrecision(6)}</td></tr>} /> : <p>{tr("Detailed preprocessing counts are unavailable for this older saved run. Rerun to refresh.")}</p>}</details>
          <p>{result.anomalies.filter(Boolean).length} / {result.scores.length} {tr("anomalies (")}{(100 * result.anomalies.filter(Boolean).length / result.scores.length).toFixed(1)}{tr("%). Threshold:")} {result.threshold.toFixed(4)}{tr(". Ties at the threshold are included.")}</p>
          <div className="analysis-chart-card"><h3>{tr("Anomaly score distribution")}</h3><svg viewBox="0 0 360 120" role="img" aria-label={tr("Anomaly score histogram, low scores left and high scores right")}>{Array.from({ length: 20 }, (_, bin) => { const count = histogram[bin]; return <rect key={bin} x={bin * 18} y={95 - 85 * count / histogramPeak} width="16" height={85 * count / histogramPeak} fill={(bin + 1) / 20 > result.threshold ? '#f87171' : '#818cf8'}><title>{(bin / 20).toFixed(2)}–{((bin + 1) / 20).toFixed(2)}: {count} {tr("rows")}</title></rect>; })}<line x1={result.threshold * 360} y1="5" x2={result.threshold * 360} y2="95" stroke="currentColor" strokeDasharray="3 3"><title>{tr("Threshold:")} {result.threshold.toFixed(4)}</title></line><text x="0" y="112" fontSize="10" fill="currentColor">0</text><text x="350" y="112" fontSize="10" fill="currentColor">1</text></svg>
          <p>{tr("Score: 0 (left) → 1 (right). Bar height shows the number of rows in each interval.")}</p></div><div className="analysis-chart-card"><h3>{tr("Normal vs anomalous rows")}</h3><svg viewBox="0 0 360 170" role="img" aria-label={t(`${anomalyPercent.toFixed(1)} percent anomalous rows`, `${anomalyPercent.toFixed(1)} phần trăm dòng bất thường`)}><circle cx="100" cy="85" r="58" fill="none" stroke="#818cf8" strokeWidth="18" /><circle cx="100" cy="85" r="58" fill="none" stroke="#f87171" strokeWidth="18" pathLength="100" strokeDasharray={`${anomalyPercent} ${100 - anomalyPercent}`} transform="rotate(-90 100 85)" /><text x="100" y="90" textAnchor="middle" fill="currentColor" fontSize="20">{anomalyPercent.toFixed(1)}%</text><circle cx="190" cy="66" r="5" fill="#f87171" /><text x="202" y="70" fontSize="12" fill="currentColor">{tr("Anomalies")}</text><circle cx="190" cy="96" r="5" fill="#818cf8" /><text x="202" y="100" fontSize="12" fill="currentColor">{tr("Normal rows")}</text></svg><p>{tr("Scores are calculated from the selected numeric features, independently of the 3D projection.")}</p><p>{tr("Use the table to inspect source rows, or return to the workspace to color points by anomaly score.")}</p><p>{tr("Threshold ties can make the observed anomaly rate higher than the requested fraction.")}</p></div>
          <button disabled={!points.length} onClick={() => { onOverlay({ scores: result.scores, rows: result.anomalies.flatMap((v, i) => v ? [i] : []), title: 'Isolation Forest score (low → high)' }); setDashboardOpen(false); }}>{tr("Color 3D by anomaly score")}</button>
          <button onClick={() => downloadText(csvText(result.scores.map((score, i) => ({ source_row: i + 1, anomaly_score: score, is_anomaly: result.anomalies[i] }))), 'anomalies-all.csv', 'text/csv')}>{tr("Export all scores CSV")}</button>
          {number('Minimum displayed score', minimumScore, setMinimumScore, 0, 1, 0.01)}<label><input type="checkbox" checked={onlyAnomalies} onChange={e => setOnlyAnomalies(e.target.checked)} />{tr("Anomalies only")}</label>
          <label>{tr("Search source row or ID")}<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("Row number or ID…")} /></label>
          <div className="unsupervised-tabs"><button onClick={() => downloadText(csvText(anomalyRows.map(r => ({ source_row: r.row + 1, id: rowId(r.row), anomaly_score: r.score, is_anomaly: r.anomaly }))), 'anomalies-filtered.csv', 'text/csv')}>{tr("Export filtered scores (")}{anomalyRows.length})</button><button onClick={() => { setQuery(''); setMinimumScore(0); setOnlyAnomalies(false); }}>{tr("Clear filters")}</button></div>
          <ResultTable key={query + minimumScore + onlyAnomalies} rows={anomalyRows} label={tr("Anomaly results")} headers={['Source row', 'ID', 'Score', 'Flag', 'Inspect']} render={r => <tr key={r.row}><td>{r.row + 1}</td><td>{rowId(r.row)}</td><td>{r.score.toFixed(4)}</td><td>{r.anomaly ? tr("Anomaly") : tr("Normal")}</td><td><button onClick={() => selectRow(r.row)}>{tr("Inspect row")}</button></td></tr>} />

        </>}
        {result?.kind === 'association' && <>
          <p>{result.frequentItemsets} {tr("frequent itemsets ·")} {result.rules.length} {tr("rules.")} {result.truncated ? tr("Rule limit reached: first 5,000 qualifying rules retained.") : ''}</p>
          <details><summary>{tr("Item preview and numeric bin ranges")}</summary><pre>{JSON.stringify(result.binning, null, 2)}</pre>{result.transactions.slice(0, 3).map((t, i) => <p key={i}>{tr("Row")} {i + 1}: {t.map(itemLabel).join('; ')}</p>)}</details>
          <div className="analysis-filters"><label>{tr("Search feature or item")}<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("Feature or value…")} /></label>{number('Filter support ≥', ruleSupport, setRuleSupport, 0, 1, 0.01)}{number('Filter confidence ≥', ruleConfidence, setRuleConfidence, 0, 1, 0.01)}{number('Filter lift ≥', ruleLift, setRuleLift, 0, 100, 0.1)}<button onClick={() => { setQuery(''); setRuleSupport(0); setRuleConfidence(0); setRuleLift(0); }}>{tr("Clear filters")}</button></div>
          <p>{rules.length} {tr('of')} {result.rules.length} {tr("retained rules match the display filters. Summary cards describe the complete run.")}</p>
          {!rules.length ? <p>{tr("No matching rules. Clear display filters, or lower the algorithm thresholds and rerun.")}</p> : <>
          <div className="analysis-chart-card"><h3>{tr("Rule strength")}</h3><p>{tr("Explore support and confidence for the first 200 sorted rules. Axes adapt to the displayed values.")}</p>
          <RuleStrengthChart formatItem={itemLabel} rules={rules} onSelect={rule => applyRule(rule, true)} />
          </div><details open className="analysis-chart-card"><summary>{tr("Item association network (first 30 rules, up to 24 items)")}</summary><p>{tr("Edges connect antecedent items to consequent items. Select an edge to inspect its rule; hover a node for its item.")}</p><svg viewBox="0 0 360 280" role="img" aria-label={tr("Association item network")}><defs><marker id="association-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#818cf8" /></marker></defs>{networkRules.flatMap((r, i) => r.antecedent.flatMap(a => r.consequent.filter(b => networkItems.includes(a) && networkItems.includes(b)).map(b => { const p = position(a), q = position(b); return <line key={i + a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#818cf8" strokeOpacity="0.5" strokeWidth="3" markerEnd="url(#association-arrow)" tabIndex={0} role="button" aria-label={r.antecedent.map(itemLabel).join(' & ') + tr(" implies ") + r.consequent.map(itemLabel).join(' & ')} onClick={() => applyRule(r, true)} onKeyDown={e => { if (e.key === 'Enter') applyRule(r, true); }}><title>Lift {r.lift.toFixed(2)}</title></line>; })))}{networkItems.map((item, i) => { const p = position(item); return <g key={item}><circle cx={p.x} cy={p.y} r="8" fill="#fbbf24"><title>{itemLabel(item)}</title></circle><text x={p.x + 10} y={p.y + 4} fontSize="9" fill="currentColor">{i + 1}</text></g>; })}</svg><ol>{networkItems.map(item => <li key={item}>{itemLabel(item)}</li>)}</ol></details>
          <label>{tr("Sort rules")}<select value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="lift">Lift</option><option value="confidence">{tr("Confidence")}</option><option value="support">{tr("Support")}</option></select></label>
          <button onClick={() => downloadText(csvText(result.rules.map(r => ({ antecedent: r.antecedent.map(itemLabel).join('; '), consequent: r.consequent.map(itemLabel).join('; '), support: r.support, confidence: r.confidence, lift: r.lift, count: r.count }))), 'association-rules.csv', 'text/csv')}>{tr("Export all rules CSV")}</button>
          <button onClick={() => downloadText(csvText(rules.map(r => ({ antecedent: r.antecedent.map(itemLabel).join('; '), consequent: r.consequent.map(itemLabel).join('; '), support: r.support, confidence: r.confidence, lift: r.lift, count: r.count }))), 'association-filtered.csv', 'text/csv')}>{tr("Export filtered rules (")}{rules.length})</button>
          <ResultTable key={query + ruleSupport + ruleConfidence + ruleLift + sort} rows={rules} label={tr("Association rules")} headers={['Rule', 'Support', 'Confidence', 'Lift', 'Rows']} render={r => <tr key={JSON.stringify([r.antecedent, r.consequent])}><td><button onClick={() => { setSelectedRule(r); setMemberScope('both'); }}>{r.antecedent.map(itemLabel).join(' & ')} → {r.consequent.map(itemLabel).join(' & ')}</button></td><td>{(r.support * 100).toFixed(1)}%</td><td>{(r.confidence * 100).toFixed(1)}%</td><td>{r.lift.toFixed(2)}×</td><td>{r.count}</td></tr>} />

          </>}
          {selectedRule && <div ref={detailRef} className="analysis-detail"><h3>{tr("Selected rule")}</h3><p>{selectedRule.antecedent.map(itemLabel).join(' & ')} → {selectedRule.consequent.map(itemLabel).join(' & ')}</p><p>{(selectedRule.confidence * 100).toFixed(1)}{tr("% of antecedent rows also satisfy the consequent. Lift:")} {selectedRule.lift.toFixed(2)}{tr("×. Association does not establish causation.")}</p><label>{tr("Related rows")}<select value={memberScope} onChange={e => setMemberScope(e.target.value as typeof memberScope)}><option value="both">{tr("Both sides")}</option><option value="antecedent">{tr("Antecedent")}</option><option value="exceptions">{tr("Antecedent without consequent")}</option></select></label><button disabled={!points.length} onClick={() => { onOverlay({ rows: matchRows, title: `Association · ${memberScope} · ${matchRows.length} matching rows` }); setDashboardOpen(false); }}>{tr("Show these rows in 3D")}</button><button onClick={() => downloadText(csvText(matchRows.map(i => ({ ...run.task.rows[i], source_row: i + 1 }))), 'rule-matching-rows.csv', 'text/csv')}>{tr("Export matching source rows")}</button><ResultTable key={JSON.stringify(selectedRule) + memberScope} rows={matchRows} label={tr("Rule members")} headers={['Source row', 'ID', 'Details']} render={i => <tr key={i}><td>{i + 1}</td><td>{rowId(i)}</td><td><button onClick={() => selectRow(i)}>{tr("Inspect row")}</button></td></tr>} /></div>}
        </>}
        {inspectedRow !== null && <div ref={rowRef} className="analysis-detail"><h3>{tr("Source row")} {inspectedRow + 1} · ID {rowId(inspectedRow)}</h3><button disabled={!points.some(p => p.rowIndex === inspectedRow)} onClick={() => viewRow3D(inspectedRow)}>{tr("Locate row in 3D")}</button><p>{tr("Feature values compared with the full source dataset. Standard deviation differences are descriptive; they are not model feature contributions.")}</p><ResultTable rows={compareRow(run.task.rows, inspectedRow, run.task.features)} label={tr("Row feature comparison")} headers={['Feature', 'Value', 'Dataset mean', 'Difference (SD)']} render={r => <tr key={r.feature}><td>{r.feature}</td><td>{String(run.task.rows[inspectedRow]?.[r.feature] ?? tr("Missing"))}</td><td>{r.mean?.toPrecision(5) ?? '—'}</td><td>{r.deviation?.toFixed(2) ?? '—'}</td></tr>} /></div>}
      </section>}
      {status && <p role="status">{tr(status)}</p>}{error && <p role="alert">{tr(error)}</p>}
    </AnalysisDashboard>;
  return <>{(['anomaly', 'association'] as const).map(taskKind => {
    const open = expanded && kind === taskKind;
    const title = taskKind === 'anomaly' ? 'Anomaly Detection' : 'Association Rules';
    const Icon = taskKind === 'anomaly' ? Activity : GitBranch;
    return <div key={taskKind} className="unsupervised-accordion rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
      <button type="button" aria-expanded={open} aria-controls={`setup-${taskKind}`} onClick={() => { setKind(taskKind); setStatus(''); setError(''); setExpanded(!open); }}
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-interactive)] hover:bg-[var(--bg-hover)] transition-colors text-left">
        <span className="font-semibold text-[11px] uppercase tracking-wide text-[var(--text-main)] flex items-center gap-1.5"><Icon size={13} className="text-[var(--accent-primary)]" />{tr(title)}</span>
        <div className="flex items-center gap-1.5"><span className="text-[10px] font-mono text-[var(--accent-primary)] font-bold">{taskKind === 'anomaly' ? 'Isolation Forest' : 'Apriori'}</span>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</div>
      </button>
      <div id={`setup-${taskKind}`} hidden={!open}>{open && body}</div>
    </div>;
  })}{dashboard}</>;
}
