import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { initQueues } from './queues/test.queue';

const PORT = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`🚀 CertiFlow Backend running on port ${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=========================================`);

  // Initialize BullMQ worker gracefully in background
  initQueues().catch((err) => {
    console.warn('[BullMQ] Queue check warning:', err.message);
  });
});

const gracefulShutdown = () => {
  console.log('\n[Server] Shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
