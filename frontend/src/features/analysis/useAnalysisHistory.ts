import { useEffect, useRef, useState } from 'react';
import type { SavedRun } from '@dimension-lab/algorithms/savedRuns';
import { appendAnalysisHistory, listAnalysisHistory } from './analysisApi';

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
      void listAnalysisHistory(controller.signal).then(runs => {
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
      const runs = await appendAnalysisHistory(run);
      if (version === revision.current) { setSaved(runs); setHistoryError(''); }
    } finally { if (version === revision.current) setSaving(false); }
  }
  return { persistent, saved, saving, historyError, save };
}
