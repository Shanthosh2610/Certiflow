import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  connectTimeout: 1500,
  retryStrategy(times: number) {
    return Math.min(times * 300, 5000);
  },
};

export const redisConnection = new Redis(redisOptions);

let hasLoggedWarning = false;

redisConnection.on('connect', () => {
  console.log(`[Redis] Connected to ${REDIS_HOST}:${REDIS_PORT}`);
  hasLoggedWarning = false;
});

redisConnection.on('error', (err) => {
  if (!hasLoggedWarning) {
    console.warn(`[Redis] Standby notice: Redis not reached on ${REDIS_HOST}:${REDIS_PORT}. BullMQ queue deferred.`);
    hasLoggedWarning = true;
  }
});

export const getRedisStatus = async (): Promise<{ connected: boolean; latencyMs?: number; error?: string }> => {
  return new Promise((resolve) => {
    let settled = false;
    const start = Date.now();

    const probe = new Redis({
      ...redisOptions,
      connectTimeout: 800,
      retryStrategy: () => null,
      lazyConnect: false,
    });

    // CRITICAL: Attach error handler to prevent unhandled EventEmitter exception in Node
    probe.on('error', (err) => {
      if (!settled) {
        settled = true;
        try { probe.disconnect(); } catch {}
        resolve({
          connected: false,
          error: err?.message || 'Redis connection unavailable',
        });
      }
    });

    probe.ping()
      .then((res) => {
        if (!settled) {
          settled = true;
          const latencyMs = Date.now() - start;
          try { probe.disconnect(); } catch {}
          resolve({
            connected: res === 'PONG',
            latencyMs,
          });
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          try { probe.disconnect(); } catch {}
          resolve({
            connected: false,
            error: err?.message || 'Redis ping failed',
          });
        }
      });

    // Timeout safety
    setTimeout(() => {
      if (!settled) {
        settled = true;
        try { probe.disconnect(); } catch {}
        resolve({
          connected: false,
          error: 'Redis check timed out (800ms)',
        });
      }
    }, 900);
  });
};
