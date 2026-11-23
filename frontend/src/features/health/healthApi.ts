import { requestApi } from '../../shared/api/network';
import { isRecord, isSystemHealth } from '../../shared/api/typeGuards';

export async function getDatabaseStatus() {
  const data = await requestApi('/api/health');
  return isRecord(data) && typeof data.database === 'string' && data.database ? data.database : 'Online';
}

export async function getSystemHealth() {
  const data = await requestApi('/api/system-health');
  if (!isSystemHealth(data)) throw new Error('The server returned invalid system health data.');
  return data;
}

export function testDatabase() { return requestApi('/api/test-db', { method: 'POST' }); }
export function clearComputeCache() { return requestApi('/api/cache', { method: 'DELETE' }); }
