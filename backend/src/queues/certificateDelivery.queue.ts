import { Job, Queue, Worker } from 'bullmq';
import prisma from '../config/db';
import { redisOptions } from '../config/redis';
import {
  simulatedWhatsAppProvider,
  WhatsAppProvider,
} from '../services/whatsappProvider';

export const CERTIFICATE_DELIVERY_QUEUE = 'certificate-delivery';
export const CERTIFICATE_DELIVERY_ATTEMPTS = 4;

export interface CertificateDeliveryJobData {
  deliveryLogId: string;
}

let deliveryQueue: Queue<CertificateDeliveryJobData> | null = null;
let deliveryWorker: Worker<CertificateDeliveryJobData> | null = null;
const namedQueues = new Map<string, Queue<CertificateDeliveryJobData>>();

const getDeliveryQueue = (queueName = CERTIFICATE_DELIVERY_QUEUE) => {
  if (queueName !== CERTIFICATE_DELIVERY_QUEUE) {
    let namedQueue = namedQueues.get(queueName);
    if (!namedQueue) {
      namedQueue = new Queue<CertificateDeliveryJobData>(queueName, {
        connection: redisOptions,
        defaultJobOptions: {
          attempts: CERTIFICATE_DELIVERY_ATTEMPTS,
          backoff: { type: 'exponential', delay: 250 },
          removeOnComplete: { age: 24 * 60 * 60, count: 10000 },
          removeOnFail: { age: 30 * 24 * 60 * 60, count: 50000 },
        },
      });
      namedQueues.set(queueName, namedQueue);
    }
    return namedQueue;
  }

  if (!deliveryQueue) {
    deliveryQueue = new Queue<CertificateDeliveryJobData>(queueName, {
      connection: redisOptions,
      defaultJobOptions: {
        attempts: CERTIFICATE_DELIVERY_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 10000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 50000 },
      },
    });
  }
  return deliveryQueue;
};

const processDelivery = async (
  job: Job<CertificateDeliveryJobData>,
  provider: WhatsAppProvider
) => {
  const delivery = await prisma.whatsAppDeliveryLog.findUnique({
    where: { id: job.data.deliveryLogId },
    include: {
      certificate: {
        include: {
          candidate: true,
        },
      },
    },
  });

  if (!delivery) {
    throw new Error(`Delivery log ${job.data.deliveryLogId} not found.`);
  }
  if (delivery.status === 'DELIVERED') {
    return { status: 'DELIVERED', duplicateSuppressed: true };
  }

  await prisma.whatsAppDeliveryLog.update({
    where: { id: delivery.id },
    data: {
      status: delivery.attempts > 0 ? 'RETRYING' : 'SENDING',
      attempts: { increment: 1 },
      lastError: null,
    },
  });

  try {
    const result = await provider.send({
      idempotencyKey: delivery.id,
      recipient: delivery.phone,
      certificateNumber: delivery.certificate.certificateNumber,
      downloadUrl: delivery.certificate.pdfUrl,
      verificationUrl: delivery.certificate.qrCodeUrl,
    });

    await prisma.whatsAppDeliveryLog.updateMany({
      where: { id: delivery.id, status: { not: 'DELIVERED' } },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        lastError: null,
      },
    });
    return { status: 'DELIVERED', providerMessageId: result.providerMessageId };
  } catch (error) {
    const attempts = job.opts.attempts || CERTIFICATE_DELIVERY_ATTEMPTS;
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    await prisma.whatsAppDeliveryLog.updateMany({
      where: { id: delivery.id, status: { not: 'DELIVERED' } },
      data: {
        status: finalAttempt ? 'FAILED' : 'RETRYING',
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
};

export const createCertificateDeliveryWorker = (
  provider: WhatsAppProvider = simulatedWhatsAppProvider,
  queueName = CERTIFICATE_DELIVERY_QUEUE
) => new Worker<CertificateDeliveryJobData>(
  queueName,
  (job) => processDelivery(job, provider),
  { connection: redisOptions, concurrency: 5 }
);

export const initCertificateDeliveryQueue = (
  provider: WhatsAppProvider = simulatedWhatsAppProvider
) => {
  getDeliveryQueue();
  if (!deliveryWorker) {
    deliveryWorker = createCertificateDeliveryWorker(provider);
    deliveryWorker.on('error', (error) => {
      console.error('[BullMQ] Certificate delivery worker error:', error);
    });
    deliveryWorker.on('failed', (job, error) => {
      if (job) {
        console.warn(`[BullMQ] Delivery ${job.data.deliveryLogId} attempt failed: ${error.message}`);
      }
    });
  }
};

export const enqueueCertificateDelivery = async (
  deliveryLogId: string,
  queueName = CERTIFICATE_DELIVERY_QUEUE
) => {
  const queue = getDeliveryQueue(queueName);
  const jobId = `whatsapp-${deliveryLogId}`;
  const existingJob = await queue.getJob(jobId);

  if (existingJob) {
    const state = await existingJob.getState();
    if (['waiting', 'active', 'delayed', 'waiting-children', 'prioritized'].includes(state)) {
      return existingJob;
    }
    await existingJob.remove();
  }

  return queue.add(
    'send-certificate',
    { deliveryLogId },
    { jobId }
  );
};

export const retryCertificateDeliveryJob = async (
  deliveryLogId: string,
  queueName = CERTIFICATE_DELIVERY_QUEUE
) => {
  const queue = getDeliveryQueue(queueName);
  const jobId = `whatsapp-${deliveryLogId}`;

  for (let check = 0; check < 100; check += 1) {
    const existingJob = await queue.getJob(jobId);
    if (!existingJob) {
      return queue.add('send-certificate', { deliveryLogId }, { jobId });
    }

    const state = await existingJob.getState();
    if (state === 'failed' || state === 'completed') {
      await existingJob.remove();
      return queue.add('send-certificate', { deliveryLogId }, { jobId });
    }

    if (existingJob.attemptsMade === 0) {
      return existingJob;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Delivery job ${jobId} did not finish before retry could be scheduled.`);
};

export const removeCertificateDeliveryJob = async (
  deliveryLogId: string,
  queueName = CERTIFICATE_DELIVERY_QUEUE
) => {
  const queue = getDeliveryQueue(queueName);
  const job = await queue.getJob(`whatsapp-${deliveryLogId}`);
  if (job) {
    await job.remove();
  }
};

export const closeCertificateDeliveryQueue = async (queueName = CERTIFICATE_DELIVERY_QUEUE) => {
  if (queueName === CERTIFICATE_DELIVERY_QUEUE) {
    await deliveryWorker?.close();
    await deliveryQueue?.close();
    deliveryWorker = null;
    deliveryQueue = null;
    return;
  }
  const namedQueue = namedQueues.get(queueName);
  if (namedQueue) {
    await namedQueue.close();
    namedQueues.delete(queueName);
  }
};
