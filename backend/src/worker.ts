import { atlasMode, closeAtlas } from './database/atlas';
import { isMongoConnected, initDatabase } from './repositories/db';
import './services/apiJobHandlers';
import { startApiJobWorker, stopApiJobWorker } from './services/apiJobs';

async function main() {
  if (!atlasMode) throw new Error('The standalone job worker requires LAB_STORAGE_MODE=atlas.');
  await initDatabase();
  if (!isMongoConnected) throw new Error('MongoDB is unavailable; the job worker cannot start.');
  startApiJobWorker();
  console.log(JSON.stringify({ event: 'api_job_worker_started', pid: process.pid }));

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ event: 'api_job_worker_stopping', signal }));
    void stopApiJobWorker()
      .then(closeAtlas)
      .then(() => { process.exitCode = 0; })
      .catch(error => {
        console.error(JSON.stringify({
          event: 'api_job_worker_shutdown_failed',
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }));
        process.exitCode = 1;
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main().catch(async error => {
  console.error(JSON.stringify({
    event: 'api_job_worker_startup_failed',
    errorName: error instanceof Error ? error.name : 'UnknownError',
  }));
  try {
    await closeAtlas();
  } catch (closeError) {
    console.error(JSON.stringify({ event: 'api_job_worker_cleanup_failed', error: String(closeError) }));
  }
  process.exitCode = 1;
});
