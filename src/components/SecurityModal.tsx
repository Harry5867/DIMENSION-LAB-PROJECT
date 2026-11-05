import { useDialogFocus } from '../utils/useDialogFocus';
import React, { useState, useEffect } from 'react';
import { SystemHealth } from '../types';
import { getErrorMessage, isRecord, isSystemHealth } from '../utils/typeGuards';
import {
  X,
  Shield,
  Lock,
  Wifi,
  Database,
  CheckCircle2,
  AlertTriangle,
  Server,
  Share2,
  Copy,
  Check,
  RefreshCw,
  KeyRound,
  Globe2,
  Activity,
  Cpu,
  Trash2,
  Zap,
} from 'lucide-react';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbStatus: string;
  onRefreshDb: () => Promise<void>;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  dbStatus,
  onRefreshDb,
}) => {
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/system-health');
      if (res.ok) {
        const data: unknown = await res.json();
        if (isSystemHealth(data)) setSystemHealth(data);
      }
    } catch (e: unknown) {
      // Backend may be offline
      console.warn('Could not load system status:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
    }
  }, [isOpen]);

  const dialogRef = useDialogFocus(isOpen, onClose);
  if (!isOpen) return null;

  const isCloudConnected = dbStatus.toLowerCase().includes('connected') || dbStatus.toLowerCase().includes('cloud');

  const handlePingTest = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const res = await fetch('/api/test-db', { method: 'POST' });
      const data: unknown = await res.json();
      if (isRecord(data) && data.connected === true) {
        setPingResult('Connected to MongoDB Atlas.');
      } else {
        const message = isRecord(data) && typeof data.message === 'string'
          ? data.message
          : 'Database unavailable. Using in-memory storage.';
        setPingResult(`⚠️ ${message}`);
      }
      await onRefreshDb();
      await fetchHealth();
    } catch (err: unknown) {
      setPingResult('Connection check failed: ' + getErrorMessage(err));
    } finally {
      setIsPinging(false);
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    setCacheMsg(null);
    try {
      const res = await fetch('/api/cache', { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not clear cache (HTTP ' + res.status + ').');
      const data: unknown = await res.json();
      const message = isRecord(data) && typeof data.message === 'string'
        ? data.message
        : 'Cache cleared.';
      setCacheMsg(message);
      await fetchHealth();
    } catch (err: unknown) {
      setCacheMsg('Could not clear cache: ' + getErrorMessage(err));
    } finally {
      setIsClearingCache(false);
    }
  };

  const copyHostCommand = () => {
    navigator.clipboard.writeText('npm run dev:host').then(() => { setCopiedCmd(true); setTimeout(() => setCopiedCmd(false), 2000); }).catch(() => setPingResult('Could not copy. Command: npm run dev:host'));
  };

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="SecurityModal-title" className="lab-modal-backdrop">
      <div className="lab-modal max-w-3xl">
        {/* Header */}
        <header className="lab-modal-header">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Shield size={24} />
            </div>
            <div>
              <h2 id="SecurityModal-title" className="text-lg font-bold text-[var(--text-main)] flex items-center gap-2">
                Workspace help
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Shortcuts, connection status, and local sharing.
              </p>
            </div>
          </div>
          <button
            aria-label="Close help" onClick={onClose}
            className="workspace-icon"
          >
            <X size={20} />
          </button>
        </header>

        {/* Content */}
        <div className="lab-modal-body space-y-6">
          {/* 1. Trạng thái kết nối Cloud Database thời gian thực */}
          <div className="p-4 rounded-xl bg-[var(--bg-main)]/70 border border-[var(--border-subtle)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Database size={18} className={isCloudConnected ? 'text-emerald-400' : 'text-amber-400'} />
                <span className="text-sm font-bold text-[var(--text-main)]">Database status:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 ${
                    isCloudConnected
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isCloudConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {dbStatus}
                </span>
              </div>

              <button
                onClick={handlePingTest}
                disabled={isPinging}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-[var(--text-main)] transition-all shadow-md shadow-indigo-600/30 disabled:opacity-50"
              >
                <RefreshCw size={13} className={isPinging ? 'animate-spin' : ''} />
                <span>{isPinging ? 'Checking…' : 'Check connection'}</span>
              </button>
            </div>

            {pingResult && (
              <div className="text-xs p-2.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-main)]">
                {pingResult}
              </div>
            )}
          </div>

          {/* 2. Giám sát Hiệu năng Backend & Caching (Real-Time Metrics) */}
          {systemHealth && (
            <div className="p-4 rounded-xl bg-[var(--bg-main)]/80 border border-indigo-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <Activity size={14} /> Server status
                </span>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  Uptime: {systemHealth.uptime}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                {/* RAM Metric */}
                <div className="p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <Cpu size={14} className="text-cyan-400" />
                    <span>Node.js memory</span>
                  </div>
                  <div className="font-mono text-cyan-300 font-bold text-sm">
                    {systemHealth.memory?.heapUsedMb} <span className="text-[11px] font-normal text-[var(--text-muted)]">/ {systemHealth.memory?.heapTotalMb}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">RSS: {systemHealth.memory?.rssMb}</span>
                </div>

                {/* Database Latency */}
                <div className="p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <Server size={14} className="text-emerald-400" />
                    <span>Database latency</span>
                  </div>
                  <div className="font-mono text-emerald-400 font-bold text-sm">
                    {systemHealth.database?.latency || 'N/A'}
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">Documents: {systemHealth.database?.totalDocuments || 0}</span>
                </div>

                {/* Compute Cache */}
                <div className="p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <Zap size={14} className="text-amber-400" />
                    <span>Cache</span>
                  </div>
                  <div className="font-mono text-amber-300 font-bold text-sm">
                    {systemHealth.cache?.memoryEntries || 0} entries
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">Stored analysis results.</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Cache and compression are enabled.
                </span>
                <button
                  onClick={handleClearCache}
                  disabled={isClearingCache}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-interactive)] hover:bg-slate-700 text-rose-300 text-[11px] border border-rose-900/40 transition-colors"
                >
                  <Trash2 size={12} />
                  <span>{isClearingCache ? 'Clearing…' : 'Clear cache'}</span>
                </button>
              </div>

              {cacheMsg && (
                <div className="text-[11px] p-2 rounded-lg bg-[var(--bg-panel)] border border-indigo-900 text-indigo-300">
                  {cacheMsg}
                </div>
              )}
            </div>
          )}

          {/* 3. Bốn trụ cột bảo vệ dữ liệu */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
              <Lock size={14} className="text-indigo-400" />
              Data and storage
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-[var(--bg-interactive)]/40 border border-[var(--border-subtle)]/60 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                  <KeyRound size={15} />
                  <span>Server credentials</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Database credentials are configured in the server’s <code className="text-indigo-300">.env</code> file.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-interactive)]/40 border border-[var(--border-subtle)]/60 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                  <Shield size={15} />
                  <span>Encryption in transit</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  MongoDB Atlas connections use TLS.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-interactive)]/40 border border-[var(--border-subtle)]/60 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
                  <Globe2 size={15} />
                  <span>Database access</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Atlas controls which IP addresses can connect.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-interactive)]/40 border border-[var(--border-subtle)]/60 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                  <Server size={15} />
                  <span>In-memory storage</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  When Atlas is unavailable, the server can store results in memory.
                </p>
              </div>
            </div>
          </div>

          <section className="keyboard-help"><h3>Keyboard shortcuts</h3><p><kbd>Ctrl / ⌘ + Enter</kbd> Run analysis</p><p><kbd>Escape</kbd> Close the active dialog or panel, then exit cluster focus</p><p><kbd>R</kbd> Reset camera · <kbd>+</kbd> / <kbd>−</kbd> Zoom in or out</p><p>Camera shortcuts are disabled while typing or while a dialog is open.</p></section>
          {/* 4. Hướng dẫn chia sẻ mạng nội bộ LAN */}
          <div className="p-4 rounded border border-[var(--border-subtle)] bg-[var(--bg-main)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi size={18} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-[var(--text-main)]">Share on your local network</h3>
              </div>
            </div>

            <p className="text-xs text-[var(--text-main)] leading-relaxed">
              Run this command to open the explorer to devices on your local network:
            </p>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] font-mono text-xs">
              <span className="text-emerald-400 font-bold select-all">npm run dev:host</span>
              <button
                onClick={copyHostCommand}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-interactive)] hover:bg-slate-700 text-[var(--text-main)] text-[11px] transition-colors"
              >
                {copiedCmd ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copiedCmd ? 'Copied' : 'Copy command'}</span>
              </button>
            </div>

            <p className="text-[11px] text-[var(--text-muted)]">
              Open the network address printed by Vite on a device connected to the same network.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="lab-modal-footer">
          <div className="text-xs text-[var(--text-muted)]">
            Status reflects the connected server.
          </div>
          <button
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
