import type { Server } from 'node:http';
import { disconnectAtlas } from './database/atlas';
import { initDatabase } from './repositories/db';
import { createApp } from './app';

const app = createApp();
const port = Number(process.env.PORT || 5000);
const host = process.env.LAB_BIND_HOST || '127.0.0.1';
let server: Server | undefined;
let stopping = false;
const initialized = initDatabase();

async function shutdown(signal: string, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ event: 'server.shutdown', signal }));
  const deadline = setTimeout(() => {
    console.error(JSON.stringify({ event: 'server.shutdown_timeout' }));
    server?.closeAllConnections();
    process.exit(1);
  }, 25_000);
  try {
    await initialized.catch(() => undefined);
    const listening = server;
    if (listening) await new Promise<void>(resolve => listening.close(() => resolve()));
    await disconnectAtlas();
    process.exitCode = exitCode;
  } catch {
    console.error(JSON.stringify({ event: 'server.shutdown_failed' }));
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

void initialized.then(() => {
  if (stopping) return;
  server = app.listen(port, host, () => console.log('Running on http://localhost:' + port));
  server.once('error', () => { void shutdown('listen_error', 1); });
}).catch(() => { void shutdown('startup_error', 1); });
