import { useEffect, useRef, useState } from 'react';
import { readSavedAnalysisRuns, type SavedRun } from '@dimension-lab/algorithms/savedRuns';
import { fetchWithTimeout } from '../../shared/api/network';
import { isRecord } from '../../shared/api/typeGuards';

const path = '/api/unsupervised/history';
async function readResponse(response: Response) {
  if (!response.ok) throw new Error(response.status === 413
    ? 'This run is too large to save. Export JSON to keep it.' : 'Account history is unavailable. Please try again.');
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.data)) throw new Error('Invalid history response.');
  return readSavedAnalysisRuns(body.data);
}

export function useAnalysisHistory(persistent: boolean) {
  const [saved, setSaved] = useState<SavedRun[]>([]);
  const [saving, setSaving] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const version = ++revision.current;
    setSaved([]); setHistoryError('');
    if (persistent) {
      void fetchWithTimeout(path, { signal: controller.signal }).then(readResponse).then(runs => {
        if (version === revision.current) setSaved(runs);
      }).catch(() => {
        if (version === revision.current) setHistoryError('Could not load account history.');
      });
    }
    return () => { revision.current++; controller.abort(); };
  }, [persistent]);

  async function save(run: SavedRun) {
    if (!persistent) {
      setSaved(previous => [run, ...previous].slice(0, 5));
      return;
    }
    const version = ++revision.current;
    setSaving(true);
    try {
      const runs = await readResponse(await fetchWithTimeout(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run),
      }));
      if (version === revision.current) { setSaved(runs); setHistoryError(''); }
    } finally { if (version === revision.current) setSaving(false); }
  }
  return { persistent, saved, saving, historyError, save };
}
