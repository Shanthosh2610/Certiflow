import crypto from 'crypto';
import fs from 'fs';
import prisma from './config/db';
import { getRedisStatus, redisConnection } from './config/redis';
import { certificatePdfService } from './services/certificatePdf.service';
import { CertificateService } from './services/certificate.service';
import {
  closeCertificateDeliveryQueue,
  createCertificateDeliveryWorker,
  enqueueCertificateDelivery,
  removeCertificateDeliveryJob,
  retryCertificateDeliveryJob,
} from './queues/certificateDelivery.queue';
import { SimulatedDeliveryOutcome, SimulatedWhatsAppProvider } from './services/whatsappProvider';

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function waitForDeliveryStatus(
  deliveryLogId: string,
  expectedStatus: string,
  provider: SimulatedWhatsAppProvider,
  timeoutMs = 15000
) {
  const deadline = Date.now() + timeoutMs;
  const observedStatuses = new Set<string>();
  let latestDelivery: { status: string; attempts: number; lastError: string | null } | null = null;

  while (Date.now() < deadline) {
    const delivery = await prisma.whatsAppDeliveryLog.findUnique({
      where: { id: deliveryLogId },
    });
    if (delivery) {
      latestDelivery = delivery;
      observedStatuses.add(delivery.status);
      if (delivery.status === expectedStatus) {
        return { delivery, observedStatuses };
      }
    }
    await delay(25);
  }

  throw new Error(
    `Timed out waiting for delivery ${deliveryLogId} to reach ${expectedStatus}; ` +
    `last state: ${JSON.stringify(latestDelivery)}, provider sends: ${provider.sendAttemptCount}.`
  );
}

async function runCertificateDeliveryTests() {
  const redisStatus = await getRedisStatus();
  if (!redisStatus.connected) {
    throw new Error(`Redis is required for delivery tests: ${redisStatus.error || 'unavailable'}`);
  }

  const [stateOffice, trainingCentreUser, district, trainingCentre] = await Promise.all([
    prisma.user.findFirst({ where: { email: 'farah@state.certiflow.gov.in' } }),
    prisma.user.findFirst({ where: { email: 'anika@training.certiflow.gov.in' } }),
    prisma.district.findFirst({ where: { name: 'Bhopal' } }),
    prisma.trainingCentre.findFirst(),
  ]);
  if (!stateOffice || !trainingCentreUser || !district || !trainingCentre) {
    throw new Error('Database not seeded. Run npm run prisma:seed first.');
  }

  const testId = crypto.randomUUID();
  const queueName = `certificate-delivery-test-${testId}`;
  const idempotencyPrefix = `whatsapp:test:${testId}`;
  const outcomes: SimulatedDeliveryOutcome[] = [
    'TIMEOUT',
    'FAILURE',
    'FAILURE',
    'FAILURE',
    'SUCCESS',
  ];
  const providerTimeoutMs = 1500;
  const provider = new SimulatedWhatsAppProvider({
    idempotencyPrefix,
    requestTimeoutMs: providerTimeoutMs,
    latencyMs: 0,
    outcomeFor: () => outcomes.shift() || 'SUCCESS',
  });
  const worker = createCertificateDeliveryWorker(provider, queueName);
  worker.on('error', (error) => console.error('[Delivery test worker]', error));
  worker.on('failed', (job, error) => {
    console.log(`[Delivery test] job ${job?.id} attempt ${job?.attemptsMade} failed: ${error.message}`);
  });

  let batchId: string | undefined;
  let deliveryLogId: string | undefined;
  let certificateNumber: string | undefined;

  try {
    const batch = await prisma.batch.create({
      data: {
        batchNumber: `DELIVERY-TEST-${testId}`,
        courseName: 'Asynchronous Messaging Reliability',
        districtId: district.id,
        trainingCentreId: trainingCentre.id,
        createdById: trainingCentreUser.id,
        status: 'COMPLETED',
        candidateCount: 1,
        approvedAt: new Date(),
        candidates: {
          create: {
            fullName: 'Delivery Retry Candidate',
            phone: '+919876500001',
            nationalId: `DELIVERY-TEST-${testId}`,
            grade: 'A',
            status: 'PENDING',
          },
        },
      },
    });
    batchId = batch.id;

    const testCertificateService = new CertificateService(
      (id) => enqueueCertificateDelivery(id, queueName),
      (id) => retryCertificateDeliveryJob(id, queueName)
    );

    console.log('Issuing one certificate and enqueueing one asynchronous delivery job...');
    const issuanceStartedAt = Date.now();
    const certificates = await testCertificateService.issueCertificatesForBatch(
      batch.id,
      stateOffice.id
    );
    const issuanceDuration = Date.now() - issuanceStartedAt;
    if (issuanceDuration >= providerTimeoutMs) {
      throw new Error('Issuance waited for the simulated provider timeout instead of returning asynchronously.');
    }
    if (certificates.length !== 1) {
      throw new Error(`Expected one certificate, got ${certificates.length}.`);
    }

    certificateNumber = certificates[0].certificateNumber;
    deliveryLogId = certificates[0].deliveryLogs[0]?.id;
    if (!deliveryLogId || certificates[0].deliveryLogs[0].status !== 'QUEUED') {
      throw new Error('Issuance did not create a queued delivery record.');
    }

    const failedResult = await waitForDeliveryStatus(deliveryLogId, 'FAILED', provider);
    if (failedResult.delivery.attempts !== 4 || !failedResult.observedStatuses.has('RETRYING')) {
      throw new Error(
        `Expected four attempts including retrying states; got ${failedResult.delivery.attempts}.`
      );
    }
    console.log(`Automatic retries ended in FAILED after ${failedResult.delivery.attempts} attempts.`);

    const retryResult = await testCertificateService.retryCertificateDelivery(
      certificateNumber,
      stateOffice.id
    );
    if (retryResult.status !== 'QUEUED' && retryResult.status !== 'RETRYING') {
      throw new Error(`Manual retry did not queue delivery (status: ${retryResult.status}).`);
    }
    console.log(`Manual retry was accepted with status ${retryResult.status}.`);

    const deliveredResult = await waitForDeliveryStatus(deliveryLogId, 'DELIVERED', provider);
    const certificateCount = await prisma.certificate.count({ where: { batchId: batch.id } });
    const deliveryCount = await prisma.whatsAppDeliveryLog.count({
      where: { certificate: { batchId: batch.id } },
    });
    const retryIssuance = await testCertificateService.issueCertificatesForBatch(
      batch.id,
      stateOffice.id
    );

    if (
      certificateCount !== 1 ||
      deliveryCount !== 1 ||
      retryIssuance.length !== 1 ||
      deliveredResult.delivery.attempts !== 5 ||
      provider.successfulDeliveryCount !== 1
    ) {
      throw new Error('Retry duplicated a certificate/delivery or failed to deliver exactly once.');
    }

    console.log(
      `Manual retry delivered ${certificateNumber} on attempt ${deliveredResult.delivery.attempts}.`
    );
    console.log('Verified: one certificate, one delivery record, and one successful provider delivery.');
  } finally {
    await worker.close();
    if (deliveryLogId) {
      await removeCertificateDeliveryJob(deliveryLogId, queueName);
    }
    await closeCertificateDeliveryQueue(queueName);

    if (deliveryLogId) {
      await redisConnection.del(`${idempotencyPrefix}:${deliveryLogId}`);
    }
    if (batchId) {
      const certificates = await prisma.certificate.findMany({
        where: { batchId },
        select: { certificateNumber: true },
      });
      await prisma.whatsAppDeliveryLog.deleteMany({
        where: { certificate: { batchId } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: [batchId, ...certificates.map((certificate) => certificate.certificateNumber)] } },
      });
      await prisma.certificate.deleteMany({ where: { batchId } });
      await prisma.candidate.deleteMany({ where: { batchId } });
      for (const certificate of certificates) {
        const pdfPath = certificatePdfService.getFilePath(certificate.certificateNumber);
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      }
      await prisma.batch.delete({ where: { id: batchId } });
    }
    await prisma.$disconnect();
    redisConnection.disconnect();
  }
}

runCertificateDeliveryTests().catch((error) => {
  console.error('Certificate delivery test failed:', error);
  process.exitCode = 1;
});
