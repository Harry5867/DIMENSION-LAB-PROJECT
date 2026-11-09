import { useAppLanguage } from "./WelcomeLanguage";
import { useId } from 'react';
import type { MethodId } from '../data/theory';

const colors = ['var(--theory-teal,#16786d)', 'var(--theory-sage,#87956a)', 'var(--theory-slate,#8a8e9c)'];
function cloud(cx: number, cy: number, count: number, rx: number, ry: number, phase = 0) {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * 2.399963 + phase, radius = Math.sqrt((i + .5) / count);
    return { x: cx + Math.cos(angle) * rx * radius, y: cy + Math.sin(angle) * ry * radius };
  });
}
const groups = [cloud(91, 100, 31, 48, 35), cloud(260, 95, 30, 45, 36, .6), cloud(180, 203, 29, 47, 34, 1.2)];
const pcaPoints = cloud(0, 0, 82, 104, 32).map(p => ({ x: 175 + p.x * .87 + p.y * .5, y: 115 - p.x * .5 + p.y * .87 }));
const pcaProjection = (p: { x: number; y: number }) => 175 + (p.x - 175) * .87 - (p.y - 115) * .5;
const mixturePoints = [...cloud(134, 120, 42, 72, 43), ...cloud(224, 157, 39, 65, 43)].map(p => {
  const a = Math.exp(-.5 * (((p.x - 134) / 48) ** 2 + ((p.y - 120) / 30) ** 2)) / (48 * 30);
  const b = Math.exp(-.5 * (((p.x - 224) / 44) ** 2 + ((p.y - 157) / 30) ** 2)) / (44 * 30);
  const probability = a / (a + b);
  const color = [22, 120, 109].map((value, i) => Math.round(value * probability + [135, 149, 106][i] * (1 - probability)));
  return { ...p, color: `rgb(${color.join(',')})` };
});
const anomalyPoints = cloud(145, 158, 72, 68, 48, .3);
const noise = [{ x: 38, y: 49 }, { x: 315, y: 202 }, { x: 185, y: 244 }, { x: 311, y: 45 }];
const description: Record<MethodId, string> = {
  pca: 'A cloud of observations with perpendicular principal directions and projected positions along PC1.',
  tsne: 'Three colored neighborhoods arranged as separated islands in an embedding.',
  umap: 'A neighborhood graph with some local links drawn between observations.',
  kmeans: 'Three point groups with a cross marking the center of each group.',
  dbscan: 'Two curved dense groups, an epsilon neighborhood, and isolated points marked as noise.',
  gmm: 'Two overlapping, axis-aligned Gaussian contours around observations with soft memberships.',
  isolation: 'A dense group, distant observations, and random partition lines around one distant point.',
  apriori: 'A directed rule from Bread to Milk, surrounded by other transaction items.',
};

export function TheoryIllustration({ method, cover = false }: { method: MethodId; cover?: boolean }) {
  const { tr } = useAppLanguage();
  const id = useId().replace(/:/g, '');
  const points = (list: { x: number; y: number }[], color = 'var(--theory-cloud,#8fa38c)', radius = 2.7) => list.map((p, i) =>
    <circle key={i} cx={p.x} cy={p.y} r={radius} fill={color} opacity={.6 + (i % 4) * .1} />);
  return <svg className="theory-illustration" viewBox="0 0 360 280" fill="none" role={cover ? undefined : 'img'}
    aria-hidden={cover || undefined} aria-labelledby={cover ? undefined : id + '-title'}>
    {!cover && <title id={id + '-title'}>{tr(description[method])}</title>}
    <defs>
      <marker id={id + '-arrow'} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 9 5 1 9" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker>
    </defs>
    <g className="theory-plot-grid" stroke="var(--theory-grid,#c4ccbc)" strokeWidth=".65" opacity=".6">
      <path d="M24 24h14m-7-7v14M322 24h14m-7-7v14M24 256h14m-7-7v14M322 256h14m-7-7v14" />
    </g>
    {method === 'pca' && <>
      <g stroke="var(--theory-grid,#c4cebd)" strokeWidth=".7" strokeDasharray="3 4">{pcaPoints.filter((_, i) => i % 7 === 0).map((p, i) => <path key={i} d={`M${p.x} ${p.y}L${pcaProjection(p)} 230`} />)}</g>
      {points(pcaPoints)}
      <g stroke="var(--theory-teal,#16786d)" strokeWidth="1.5" markerEnd={`url(#${id}-arrow)`} color="var(--theory-teal,#16786d)"><path d="M104 156 280 56" /><path d="M175 115 140 54" /></g>
      <path d="M50 230h262" stroke="#879b88" />
      {points(pcaPoints.filter((_, i) => i % 4 === 0).map(p => ({ x: pcaProjection(p), y: 230 })), 'var(--theory-teal,#16786d)', 2.3)}
      <g fill="var(--theory-text,#4e675b)"><text x="279" y="46">PC1</text><text x="117" y="47">PC2</text><text x="128" y="254">{tr("PC1 projection")}</text></g>
    </>}
    {(method === 'tsne' || method === 'umap' || method === 'kmeans') && <>
      {method === 'umap' && <g stroke="#839d86" strokeWidth=".7" opacity=".45">{groups.map((group, gi) => <g key={gi}>{group.map((p, i) => <path key={i} d={`M${p.x} ${p.y}L${group[(i + 5) % group.length].x} ${group[(i + 5) % group.length].y}`} />)}</g>)}<path d="M129 121 148 183M219 183 235 124" strokeDasharray="3 4" /></g>}
      {groups.map((group, i) => <g key={i}>
        {method === 'kmeans' && <ellipse cx={[91, 260, 180][i]} cy={[100, 95, 203][i]} rx="61" ry="45" stroke={colors[i]} opacity=".3" transform={`rotate(${[-24, -28, 12][i]} ${[91, 260, 180][i]} ${[100, 95, 203][i]})`} />}
        {points(group, colors[i])}
        {method === 'kmeans' && <path d={`M${[91, 260, 180][i] - 7} ${[100, 95, 203][i]}h14m-7-7v14`} stroke={colors[i]} strokeWidth="2.5" />}
      </g>)}
    </>}
    {method === 'dbscan' && <>
      {[0, 1].map(group => <g key={group}>{points(Array.from({ length: 42 }, (_, i) => {
        const theta = i / 41 * Math.PI, radius = 65 + Math.sin(i * 5) * 7;
        return { x: (group ? 222 : 130) + Math.cos(theta) * radius, y: (group ? 148 : 128) + Math.sin(theta) * radius * (group ? 1 : -1) };
      }), colors[group])}</g>)}
      <circle cx="143" cy="62" r="31" stroke="var(--theory-teal,#16786d)" strokeDasharray="4 4" /><text x="174" y="56" fill="var(--theory-teal,#16786d)">ε</text>
      {noise.map((p, i) => <g key={i} stroke="#71776e"><circle cx={p.x} cy={p.y} r="4" /><path d={`M${p.x - 2} ${p.y - 2}l4 4m0-4-4 4`} /></g>)}
      <text x="244" y="250" fill="var(--theory-text,#596655)">{tr("○ noise")}</text>
    </>}
    {method === 'gmm' && <>
      {[1, .75, .5].map(scale => <g key={scale} strokeWidth="1" opacity=".4"><ellipse cx="134" cy="120" rx={78 * scale} ry={47 * scale} stroke={colors[0]} /><ellipse cx="224" cy="157" rx={72 * scale} ry={48 * scale} stroke={colors[1]} /></g>)}
      {mixturePoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.7" fill={p.color} opacity=".85" />)}
      <path d="M182 202v24" stroke="#73896f" strokeDasharray="3 3" /><text x="115" y="246" fill="var(--theory-text,#4e675b)">{tr("overlapping membership")}</text>
    </>}
    {method === 'isolation' && <>
      {points(anomalyPoints)}{points([{ x: 300, y: 205 }, { x: 55, y: 67 }], '#648f7d', 3)}
      <g stroke="#8ba28c" strokeWidth=".9" strokeDasharray="5 4"><path d="M245 32v214M245 112h82" /></g>
      <circle cx="289" cy="66" r="17" stroke="var(--theory-teal,#16786d)" /><circle cx="289" cy="66" r="4" fill="var(--theory-teal,#16786d)" />
      <path d="M206 118 270 80" stroke="#7a9280" strokeDasharray="3 4" />
      {!cover && <text x="252" y="34" fill="var(--theory-teal,#16786d)">{tr('isolated')}</text>}
    </>}
    {method === 'apriori' && <>
      <g stroke="#91a18a" strokeWidth="1"><path d="M66 157 112 75 195 160 132 230 66 157M132 230 195 160 300 167M195 160 256 66M256 66 300 167" /></g>
      <g stroke="var(--theory-teal,#16786d)" strokeWidth="1.6" markerEnd={`url(#${id}-arrow)`} color="var(--theory-teal,#16786d)"><path d="M127 85 183 145M211 160l73 5" /></g>
      <g fill="#f3f2e9" stroke="#6d8875"><circle cx="66" cy="157" r="10" /><circle cx="112" cy="75" r="14" /><circle cx="195" cy="160" r="17" /><circle cx="132" cy="230" r="10" /><circle cx="300" cy="167" r="12" /><circle cx="256" cy="66" r="9" /></g>
      <g fill="#315f52"><text x="91" y="51">{tr("Bread")}</text><text x="179" y="195">{tr("Milk")}</text><text x="232" y="116">A → B</text></g>
    </>}
  </svg>;
}
