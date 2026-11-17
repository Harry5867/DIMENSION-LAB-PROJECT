import { initDatabase, isMongoConnected } from './repositories/db';
import { closeAtlas, atlasMode } from './database/atlas';
import { createApp } from './app';
import { startApiJobWorker, stopApiJobWorker } from './services/apiJobs';

const app = createApp();
const PORT = process.env.PORT || 5000;
const HOST = process.env.LAB_BIND_HOST || '127.0.0.1';

// 14. Initialize Database & Graceful Start
initDatabase()
  .then(() => {
    const workerSetting = process.env.LAB_API_JOB_WORKER_ENABLED;
    if (atlasMode && workerSetting !== undefined && workerSetting !== 'true' && workerSetting !== 'false') {
      throw new Error('LAB_API_JOB_WORKER_ENABLED must be true or false.');
    }
    if (atlasMode && isMongoConnected && workerSetting !== 'false') startApiJobWorker();
    const server = app.listen(Number(PORT), HOST, () => {
      console.log(`🚀 [Fullstack Backend] Running on http://localhost:${PORT}`);
      console.log(`🛡️  [Security RBAC] Authentication & Role Guard (HTTP 401/403) Active`);
      console.log(`⚡ [Performance Middleware] Gzip Compression Enabled`);
      console.log(`🧠 [Compute Caching] Multi-tier SHA-256 LRU + MongoDB Cache Active`);
    });
    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(JSON.stringify({ event: 'server_shutdown_started', signal }));
      const forceClose = setTimeout(() => server.closeAllConnections(), 10_000);
      forceClose.unref();
      server.close(() => {
        void stopApiJobWorker()
          .then(closeAtlas)
          .then(() => {
            clearTimeout(forceClose);
            process.exitCode = 0;
          })
          .catch(error => {
            console.error(JSON.stringify({
              event: 'server_shutdown_failed',
              errorName: error instanceof Error ? error.name : 'UnknownError',
            }));
            process.exitCode = 1;
          });
      });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch(async error => {
    console.error(JSON.stringify({
      event: 'server_startup_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
    try {
      await closeAtlas();
    } catch (closeError) {
      console.error(JSON.stringify({
        event: 'server_startup_cleanup_failed',
        errorName: closeError instanceof Error ? closeError.name : 'UnknownError',
      }));
    }
    process.exitCode = 1;
  });
