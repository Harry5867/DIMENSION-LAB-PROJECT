import { useAppLanguage } from "./WelcomeLanguage";
import { useId, useState } from 'react';
import type { AssociationRule } from '../algorithms/apriori';

interface Props { formatItem?: (item: string) => string; rules: AssociationRule[]; onSelect: (rule: AssociationRule) => void }
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const describe = (items: string[]) => items.map(item => {
  try { const [feature, value] = JSON.parse(item) as string[]; return `${feature} = ${value}`; }
  catch { return item; }
}).join(' & ');

function extent(values: number[], full: boolean): [number, number] {
  if (full || !values.length) return [0, 1];
  const min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max(0.025, (max - min) * 0.12);
  return [Math.max(0, min - padding), Math.min(1, max + padding)];
}

export function RuleStrengthChart({ rules, onSelect, formatItem }: Props) {
  const { tr } = useAppLanguage();
  const describeItems = (items: string[]) => formatItem ? items.map(formatItem).join(' & ') : describe(items);
  const [fullScale, setFullScale] = useState(false);
  const [active, setActive] = useState<AssociationRule | null>(null);
  const clipId = useId();
  const visible = rules.slice(0, 200);
  const [xMin, xMax] = extent(visible.map(rule => rule.support), fullScale);
  const [yMin, yMax] = extent(visible.map(rule => rule.confidence), fullScale);
  const x = (value: number) => 66 + (value - xMin) / (xMax - xMin) * 464;
  const y = (value: number) => 278 - (value - yMin) / (yMax - yMin) * 244;
  const ticks = Array.from({ length: 5 }, (_, i) => i / 4);
  return <>
    <div className="rule-strength-controls"><label><input type="checkbox" checked={fullScale} onChange={event => setFullScale(event.target.checked)} />{tr("Show full 0–100% scale")}</label><span>{fullScale ? tr("Full scale") : tr("Zoomed to displayed rules")}</span></div>
    <svg className="rule-strength-plot" viewBox="0 0 560 340" role="group" aria-label={tr("Rule support versus confidence. Axes show percentages; circle area represents lift.")}>
      <defs><clipPath id={clipId}><rect x="55" y="22" width="488" height="268" /></clipPath></defs>
      {ticks.map(t => {
        const xv = xMin + (xMax - xMin) * t, yv = yMin + (yMax - yMin) * t;
        return <g key={t} className="rule-strength-ticks">
          <path d={`M${x(xv)} 34V278 M66 ${y(yv)}H530`} fill="none" stroke="currentColor" strokeOpacity="0.13" strokeDasharray="3 4" />
          <text x={x(xv)} y="301" textAnchor="middle">{percent(xv)}</text>
          <text x="56" y={y(yv) + 4} textAnchor="end">{percent(yv)}</text>
        </g>;
      })}
      <path d="M66 34V278H530" fill="none" stroke="currentColor" strokeOpacity="0.6" />
      <text x="66" y="17" className="rule-strength-axis">{tr("Confidence")}</text>
      <text x="298" y="330" textAnchor="middle" className="rule-strength-axis">{tr("Support")}</text>
      <g clipPath={`url(#${clipId})`}>{visible.map((rule, index) => <circle
        key={JSON.stringify([rule.antecedent, rule.consequent])}
        cx={x(rule.support)} cy={y(rule.confidence)} r={Math.min(9, Math.max(3, 3 * Math.sqrt(rule.lift)))}
        fill={active === rule ? '#fbbf24' : '#818cf8'} fillOpacity={active === rule ? 1 : 0.5}
        stroke={active === rule ? 'currentColor' : '#a5b4fc'} strokeWidth={active === rule ? 1.5 : 0.5}
        tabIndex={0} role="button" aria-label={`${tr('Rule')} ${index + 1}: ${tr('Support')} ${percent(rule.support)}, ${tr('Confidence')} ${percent(rule.confidence)}, ${tr('Lift')} ${rule.lift.toFixed(2)}`}
        onMouseEnter={() => setActive(rule)} onFocus={() => setActive(rule)}
        onClick={() => { setActive(rule); onSelect(rule); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(rule); onSelect(rule); } }}>
        <title>{describeItems(rule.antecedent)} → {describeItems(rule.consequent)}{tr("; support")} {percent(rule.support)}{tr("; confidence")} {percent(rule.confidence)}; lift {rule.lift.toFixed(2)}</title>
      </circle>)}</g>
    </svg>
    <div className="rule-strength-detail" aria-live="polite">{active ? <><strong>{describeItems(active.antecedent)} → {describeItems(active.consequent)}</strong><span>{tr("Support")} {percent(active.support)} {tr("· Confidence")} {percent(active.confidence)} · Lift {active.lift.toFixed(2)}×</span></> : <span>{tr("Hover or focus a point to see its values. Select it to explore the rule. Overlapping points share similar values.")}</span>}</div>
    <p className="rule-strength-note">{tr("Showing")} {visible.length} {tr('of')} {rules.length} {tr("rules in the current sort order. Larger circles indicate higher lift (size capped for readability).")}</p>
  </>;
}
