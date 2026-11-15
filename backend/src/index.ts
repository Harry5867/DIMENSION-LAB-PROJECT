import { initDatabase } from './repositories/db';
import { createApp } from './app';

const app = createApp();
const PORT = process.env.PORT || 5000;
const HOST = process.env.LAB_BIND_HOST || '127.0.0.1';

// 14. Initialize Database & Graceful Start
initDatabase()
  .then(() => {
    app.listen(Number(PORT), HOST, () => {
      console.log(`🚀 [Fullstack Backend] Running on http://localhost:${PORT}`);
      console.log(`🛡️  [Security RBAC] Authentication & Role Guard (HTTP 401/403) Active`);
      console.log(`⚡ [Performance Middleware] Gzip Compression Enabled`);
      console.log(`🧠 [Compute Caching] Multi-tier SHA-256 LRU + MongoDB Cache Active`);
    });
  })
  .catch(console.error);

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 [Server] Đang đóng ứng dụng an toàn...');
  process.exit(0);
});
