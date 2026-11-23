import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExperimentRecord } from '@dimension-lab/contracts';
import { getErrorMessage } from '../../shared/api/typeGuards';
import { createExperiment, listExperiments, type ExperimentInput } from './experimentsApi';

export function useExperiments(showHistory: boolean) {
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isSavingExperiment, setIsSavingExperiment] = useState(false);
  const revision = useRef(0);

  const fetchExperiments = useCallback(async () => {
    const request = ++revision.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await listExperiments();
      if (request === revision.current) setExperiments(data);
    } catch (error) {
      if (request === revision.current) setHistoryError(getErrorMessage(error));
    } finally {
      if (request === revision.current) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { if (showHistory) void fetchExperiments(); }, [showHistory, fetchExperiments]);

  const saveExperiment = async (input: ExperimentInput) => {
    setIsSavingExperiment(true);
    try {
      await createExperiment(input);
      await fetchExperiments();
    } finally {
      setIsSavingExperiment(false);
    }
  };
  return { experiments, historyLoading, historyError, setHistoryError, isSavingExperiment, fetchExperiments, saveExperiment };
}
