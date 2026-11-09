import { useAppLanguage } from "./WelcomeLanguage";
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { DataPoint } from '../types';

interface Props {
  cluster: number;
  points: DataPoint[];
  onChange: (cluster: number | null) => void;
}

/** Filters the view only. All analysis, metrics and export still use the complete result. */
export function ClusterFocus({ cluster, points, onChange }: Props) {
  const { tr } = useAppLanguage();
  const counts = new Map<number, number>();
  points.forEach(point => counts.set(point.cluster, (counts.get(point.cluster) ?? 0) + 1));
  const name = (id: number) => id === -1 ? tr('Noise') : tr('Cluster') + ' ' + id;
  return (
    <section className="cluster-focus" aria-label={tr("Cluster Focus")}>
      <div className="cluster-focus-heading"><button onClick={() => onChange(null)}><ArrowLeft size={14} />{tr("All points")}</button><span className="workspace-eyebrow">{tr("CLUSTER FOCUS / ESC TO EXIT")}</span></div>
      <div className="cluster-focus-title"><div><h2>{name(cluster)} <ArrowUpRight size={20} /></h2><p>{counts.get(cluster)?.toLocaleString('en-US')} / {points.length.toLocaleString('en-US')} {tr("points · View only")}</p></div><button onClick={() => onChange(null)} aria-label={tr("Exit cluster focus")}>×</button></div>
      <nav aria-label={tr("Switch focused cluster")}>{[...counts].sort(([a], [b]) => a - b).map(([id, count]) => <button key={id} aria-pressed={id === cluster} onClick={() => onChange(id)}>{name(id)} <small>{count}</small></button>)}</nav>
    </section>
  );
}
