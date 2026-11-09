import { useAppLanguage } from "./WelcomeLanguage";
import React, { useState } from 'react';

export function ResultTable<T>({ rows, headers, render, label }: { rows: T[]; headers: string[]; render: (row: T, index: number) => React.ReactNode; label: string }) {
  const { tr, t } = useAppLanguage();
  const [page, setPage] = useState(0), [size, setSize] = useState(25);
  const last = Math.max(0, Math.ceil(rows.length / size) - 1), current = Math.min(page, last);
  const start = current * size;
  return <div className="analysis-result-table">
    <div className="analysis-table-toolbar"><span>{rows.length ? `${start + 1}–${Math.min(start + size, rows.length)} ${t('of', 'trên')} ${rows.length}` : tr("No matching results")}</span><label>{tr("Rows per page")}<select value={size} onChange={e => { setSize(Number(e.target.value)); setPage(0); }}>{[10, 25, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label></div>
    <div className="unsupervised-table"><table aria-label={tr(label)}><thead><tr>{headers.map(h => <th key={h} scope="col">{tr(h)}</th>)}</tr></thead><tbody>{rows.slice(start, start + size).map((row, i) => render(row, start + i))}</tbody></table></div>
    <nav className="analysis-table-toolbar" aria-label={t(`${label} pagination`, `Phân trang ${tr(label)}`)}><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>{tr("Previous")}</button><span>{tr("Page")} {current + 1} / {last + 1}</span><button type="button" disabled={current === last} onClick={() => setPage(current + 1)}>{tr("Next")}</button></nav>
  </div>;
}
