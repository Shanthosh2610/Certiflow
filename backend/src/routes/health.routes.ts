import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { getRedisStatus } from '../config/redis';
import { healthQueue } from '../queues/test.queue';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Test Database connectivity with 1000ms timeout
  let dbStatus: { connected: boolean; latencyMs?: number; error?: string } = {
    connected: false,
  };
  try {
    const dbStart = Date.now();
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB query timeout')), 1000)),
    ]);
    dbStatus = {
      connected: true,
      latencyMs: Date.now() - dbStart,
    };
  } catch (error: any) {
    dbStatus = {
      connected: false,
      error: error?.message || 'Database unavailable',
    };
  }

  // Test Redis connectivity
  const redisStatus = await getRedisStatus();

  // Test BullMQ Queue Readiness
  let bullMqStatus: { active: boolean; error?: string } = {
    active: false,
  };
  if (redisStatus.connected && healthQueue) {
    bullMqStatus = { active: true };
  } else {
    bullMqStatus = {
      active: false,
      error: 'Redis offline - BullMQ queued jobs deferred until Redis starts',
    };
  }

  const isHealthy = dbStatus.connected && redisStatus.connected;

  res.status(200).json({
    status: isHealthy ? 'OK' : 'DEGRADED',
    message: isHealthy
      ? 'CertiFlow Core API is fully operational'
      : 'CertiFlow API is running. (Postgres/Redis offline - start via docker-compose up postgres redis)',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    responseTimeMs: Date.now() - startTime,
    components: {
      api: {
        status: 'UP',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
      database: {
        status: dbStatus.connected ? 'UP' : 'DOWN',
        latencyMs: dbStatus.latencyMs,
        error: dbStatus.error,
      },
      redis: {
        status: redisStatus.connected ? 'UP' : 'DOWN',
        latencyMs: redisStatus.latencyMs,
        error: redisStatus.error,
      },
      bullmq: {
        status: bullMqStatus.active ? 'READY' : 'STANDBY',
        error: bullMqStatus.error,
      },
    },
  });
});

export default router;
