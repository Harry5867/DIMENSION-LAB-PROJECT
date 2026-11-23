import { readSavedAnalysisRuns } from '@dimension-lab/algorithms/savedRuns';
import { atlasMode } from '../database/atlas';
import { AppError, BadRequestError, ForbiddenError } from '../http/errors';
import { loadHistory, prependHistory } from '../repositories/analysisHistory';

function requirePersistentHistory() {
  if (!atlasMode) throw new ForbiddenError('Account history requires Atlas storage.');
}

export async function readAnalysisHistory(ownerId: string) {
  requirePersistentHistory();
  return (await loadHistory(ownerId)).map(run => JSON.parse(run) as unknown);
}

export async function saveAnalysisHistory(ownerId: string, body: unknown) {
  requirePersistentHistory();
  const [run] = readSavedAnalysisRuns([body]);
  if (!run) throw new BadRequestError('Invalid analysis run.');
  const serialized = JSON.stringify(run);
  // Five bounded runs fit in a single MongoDB document, so retention is atomic.
  if (Buffer.byteLength(serialized) > 3 * 1024 * 1024) {
    throw new AppError('This run exceeds the 3 MiB history limit. Export JSON to keep it.', 413, 'PAYLOAD_TOO_LARGE');
  }
  return (await prependHistory(ownerId, serialized, 5)).map(item => JSON.parse(item) as unknown);
}
