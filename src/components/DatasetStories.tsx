import { useAppLanguage } from "./WelcomeLanguage";
import { useState } from 'react';
import { ArrowUpRight, Download } from 'lucide-react';
import stories from '../data/case-studies.json';
const colors = ['var(--dataset-cluster-0,#1b6157)', 'var(--dataset-cluster-1,#a36336)', 'var(--dataset-cluster-2,#6775a7)'];

export default function DatasetStories() {
  const { tr } = useAppLanguage();
  const [selected, setSelected] = useState(0);
  const story = stories[selected];
  const xs = story.points.map(p => p.x), ys = story.points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const x = (value: number) => 52 + (value - minX) / (maxX - minX || 1) * 402;
  const y = (value: number) => 244 - (value - minY) / (maxY - minY || 1) * 212;
  return <div className="dataset-stories">
    <div className="portal-prose"><h2>{tr("Two datasets. A closer look.")}</h2><p>{tr("These charts are precomputed from the bundled CSV files using Z-score → 3D PCA → GMM. The scatter plot shows PC1 and PC2. Opening this page does not run an analysis or create a WebGL scene.")}</p></div>
    <div className="portal-story-picker" role="group" aria-label={tr("Choose a prepared dataset")}>{stories.map((item, index) => <button key={item.id} aria-pressed={selected === index} onClick={() => setSelected(index)}>{tr(item.name)}</button>)}</div>
    <article className="portal-case" aria-labelledby="case-title">
      <h2 id="case-title">{tr(story.name)}</h2><p>{tr(story.description)}</p>
      <div className="portal-case-stats"><span>{story.rowCount} {tr('ROWS')}</span><span>{story.features.length} {tr('FEATURES')}</span><span>{story.configuration.k} {tr('COMPONENTS')}</span><span>{(story.variance.reduce((a, b) => a + b, 0) * 100).toFixed(1)}{tr("% VARIANCE / 3 PCs")}</span></div>
      <div className="portal-case-chart">
        <figure><svg viewBox="0 0 500 290" role="img" aria-labelledby="scatter-title scatter-description"><title id="scatter-title">{tr("PCA projection —")} {tr(story.name)}</title><desc id="scatter-description">{story.rowCount} {tr("rows, colored by GMM cluster. Horizontal axis PC1; vertical axis PC2. The table below lists every cluster count.")}</desc>
          {[0, .5, 1].map(t => <g key={t} fill="var(--portal-muted,#68705f)" fontSize="10"><line x1="52" x2="454" y1={244 - t * 212} y2={244 - t * 212} stroke="var(--portal-line,#e0e1d7)" /><text x="45" y={248 - t * 212} textAnchor="end">{(minY + t * (maxY - minY)).toFixed(1)}</text><text x={52 + t * 402} y="263" textAnchor="middle">{(minX + t * (maxX - minX)).toFixed(1)}</text></g>)}
          <path d="M52 24V244H462" fill="none" stroke="var(--portal-muted,#929b89)" />
          {story.points.map(p => <circle key={p.row} cx={x(p.x)} cy={y(p.y)} r="3" opacity=".65" fill={colors[p.cluster % colors.length]}><title>{tr("Source row")} {p.row} {tr("· Cluster")} {p.cluster} · PC1 {p.x.toFixed(2)} · PC2 {p.y.toFixed(2)}</title></circle>)}
          <text x="258" y="285" textAnchor="middle" fill="var(--portal-muted,#575d50)" fontSize="11">PC1</text><text x="16" y="140" textAnchor="middle" fill="var(--portal-muted,#575d50)" fontSize="11" transform="rotate(-90 16 140)">PC2</text>
        </svg><figcaption>{tr("PC1–PC2 projection, colored by GMM clusters fitted on all three principal components. Clusters are not ground-truth labels.")}</figcaption></figure>
        <figure><svg viewBox="0 0 500 290" role="img" aria-labelledby="variance-title"><title id="variance-title">{tr("Explained variance by principal component")}</title>
          {[0, 25, 50, 75, 100].map(t => <g key={t}><line x1={75 + t * 3.2} x2={75 + t * 3.2} y1="35" y2="224" stroke="var(--portal-line,#e0e1d7)" /><text x={75 + t * 3.2} y="245" textAnchor="middle" fontSize="11" fill="var(--portal-muted,#68705f)">{t}%</text></g>)}
          {story.variance.map((v, i) => <g key={i}><text x="58" y={68 + i * 65} textAnchor="end" fontSize="12" fill="var(--portal-muted,#575d50)">PC{i + 1}</text><rect x="75" y={45 + i * 65} width={v * 320} height="34" rx="3" fill="var(--portal-accent,#8a9a78)" /><text x={85 + v * 320} y={68 + i * 65} fontSize="12" fill="var(--portal-muted,#575d50)">{(v * 100).toFixed(1)}%</text></g>)}
        </svg><figcaption>{tr("Variance retained by each principal component. The remaining variance is not represented by these three axes.")}</figcaption></figure>
      </div>
      <table className="portal-case-table"><caption>{tr("GMM cluster distribution")}</caption><thead><tr><th scope="col">{tr("Cluster")}</th><th scope="col">{tr("Rows")}</th><th scope="col">{tr("Share")}</th></tr></thead><tbody>{story.clusterCounts.map((count, i) => <tr key={i}><th scope="row"><span className="portal-legend-dot" style={{ background: colors[i] }} />{tr("Cluster")} {i}</th><td>{count}</td><td>{(count / story.rowCount * 100).toFixed(1)}%</td></tr>)}</tbody></table>
      <details className="portal-article"><summary>{tr("Analysis configuration")}</summary><dl><dt>{tr("Preprocessing / Reduction")}</dt><dd>{tr("Z-score; PCA with 3 components.")}</dd><dt>GMM</dt><dd>{tr("Diagonal covariance; k =")} {story.configuration.k}{tr("; seed = 42; max iterations = 100; tolerance = 0.00001.")} {story.converged ? tr("Converged") : tr("Reached the iteration limit")} {tr('after')} {story.iterations} {tr("iterations.")}</dd><dt>{tr("Selected features")}</dt><dd>{story.features.join(', ')}</dd><dt>{tr("Source")}</dt><dd>{tr("Bundled CSV:")} {story.file}{tr(". These examples use the same PCA and GMM implementations as Model.")}</dd></dl></details>
      {story.id === 'cancer_wdbc' && <p className="portal-note">{tr("This example supports data exploration for learning. Discovered clusters must not be interpreted as a clinical diagnosis.")}</p>}
      <div className="portal-case-actions"><a className="portal-action" href="#/datasets">{tr("Open dataset manager in Model")} <ArrowUpRight size={16} /></a><a className="portal-download" href={`/${story.file}`} download><Download size={15} /> {tr("Download source CSV")}</a></div>
    </article>
  </div>;
}
