import { Queue, Worker } from 'bullmq';
import { redisOptions } from '../config/redis';
import { initCertificateDeliveryQueue } from './certificateDelivery.queue';

export let healthQueue: Queue | null = null;
export let healthWorker: Worker | null = null;

export const initQueues = async () => {
  if (!healthQueue) {
    healthQueue = new Queue('health-check-queue', {
      connection: redisOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
      },
    });
  }
  if (!healthWorker) {
    healthWorker = new Worker(
      'health-check-queue',
      async (job) => {
        return { status: 'processed', timestamp: Date.now() };
      },
      { connection: redisOptions }
    );
    healthWorker.on('error', (err) => {
      console.error('[BullMQ] Health worker error:', err);
    });
  }

  initCertificateDeliveryQueue();
  console.log('[BullMQ] Health and certificate delivery workers initialized');
};
