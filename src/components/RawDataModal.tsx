import { useAppLanguage } from "./WelcomeLanguage";
import { csvText, downloadText, safeFilename } from '../utils/exportData';
import { useDialogFocus } from '../utils/useDialogFocus';
import React, { useState, useMemo, useEffect } from 'react';
import { DatasetRow } from '../types';
import { X, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download } from 'lucide-react';

interface RawDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetName: string;
  headers: string[];
  rawRows: DatasetRow[];
  totalRows: number;
  labelColumn?: string | null;
  previewOnly?: boolean;
}

export const RawDataModal: React.FC<RawDataModalProps> = ({
  isOpen,
  onClose,
  datasetName,
  headers,
  rawRows,
  totalRows,
  labelColumn,
  previewOnly = false,
}) => {
  const { tr, t } = useAppLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const dialogRef = useDialogFocus(isOpen, onClose);

  // Reset page when search or dataset changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, datasetName]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rawRows;
    const term = searchTerm.toLowerCase().trim();
    return rawRows.filter((row) =>
      headers.some((header) => {
        const val = row[header];
        return val != null && String(val).toLowerCase().includes(term);
      })
    );
  }, [rawRows, headers, searchTerm]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRows.length);
  const currentRows = useMemo(() => {
    return filteredRows.slice(startIndex, endIndex);
  }, [filteredRows, startIndex, endIndex]);

  const handleExportCSV = () => {
    if (filteredRows.length === 0) return;
    downloadText(csvText(filteredRows, headers), safeFilename(datasetName) + (searchTerm.trim() ? '_filtered_rows.csv' : '_raw_data.csv'), 'text/csv;charset=utf-8');
  };

  if (!isOpen) return null;

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="raw-data-modal-title" className="lab-modal-backdrop">
      <div className="lab-modal raw-data-dialog">
        <header className="lab-modal-header">
          <div>
            <h2 id="raw-data-modal-title">{tr("Raw data ·")} {datasetName}</h2>
            <p>{previewOnly ? t(`First ${rawRows.length} of ${totalRows} rows`, `${rawRows.length} hàng đầu trong tổng số ${totalRows} hàng`)
              : <>{totalRows.toLocaleString('en-US')} {tr("rows ·")} {headers.length} {tr('columns')}</>}</p>
          </div>
          <button type="button" className="workspace-icon" onClick={onClose} aria-label={tr("Close raw data")}><X size={18} /></button>
        </header>
        <div className="raw-data-toolbar">
          <label className="lab-search"><Search size={15} /><input aria-label={tr("Search raw values")} value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)} placeholder={tr("Search values…")} /></label>
          <label>{tr("Rows per page")} <select value={pageSize} onChange={event => {
            setPageSize(Number(event.target.value));
            setCurrentPage(1);
          }}>
            {[25, 50, 100, 200].map(size => <option key={size}>{size}</option>)}
          </select></label>
        </div>
        <div className="raw-data-table custom-scrollbar" tabIndex={0} role="region" aria-label={tr("Raw data table")}>
          <table>
            <thead><tr><th scope="col">#</th>{headers.map(header => <th key={header} scope="col">
              {header}{header === labelColumn && <span className="lab-tag">{tr("Label")}</span>}
            </th>)}</tr></thead>
            <tbody>
              {currentRows.length === 0 && <tr><td colSpan={headers.length + 1}>{tr("No matching rows.")}</td></tr>}
              {currentRows.map((row, index) => <tr key={startIndex + index}>
                <td>{startIndex + index + 1}</td>
                {headers.map(header => <td key={header} title={row[header] == null ? undefined : String(row[header])}>{row[header] == null ? '—' : String(row[header])}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
        <footer className="lab-modal-footer raw-data-footer">
          <span>{filteredRows.length > 0 ? startIndex + 1 : 0}–{endIndex} {tr('of')} {filteredRows.length.toLocaleString('en-US')} {tr("rows")}</span>
          <div className="lab-row-actions">
            <button onClick={() => setCurrentPage(1)} disabled={validCurrentPage <= 1} aria-label={tr("First page")}><ChevronsLeft size={15} /></button>
            <button onClick={() => setCurrentPage(validCurrentPage - 1)} disabled={validCurrentPage <= 1} aria-label={tr("Previous page")}><ChevronLeft size={15} /></button>
            <span>{validCurrentPage} / {totalPages}</span>
            <button onClick={() => setCurrentPage(validCurrentPage + 1)} disabled={validCurrentPage >= totalPages} aria-label={tr("Next page")}><ChevronRight size={15} /></button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={validCurrentPage >= totalPages} aria-label={tr("Last page")}><ChevronsRight size={15} /></button>
          </div>
          {!previewOnly && <button onClick={handleExportCSV} disabled={filteredRows.length === 0} title={tr("Export all filtered rows")}><Download size={14} /> {tr("Export CSV")}</button>}
        </footer>
      </div>
    </div>
  );
};
