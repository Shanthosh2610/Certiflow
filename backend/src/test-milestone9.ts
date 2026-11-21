import prisma from './config/db';
import { batchService } from './services/batch.service';
import { auditService } from './services/audit.service';
import { approvalWorkflowService } from './services/approval.service';
import { closeCertificateDeliveryQueue } from './queues/certificateDelivery.queue';
import { redisConnection } from './config/redis';

async function runMilestone9Tests() {
  const [trainingCentreUser, districtOfficer] = await Promise.all([
    prisma.user.findFirst({ where: { email: 'anika@training.certiflow.gov.in' } }),
    prisma.user.findFirst({ where: { email: 'dev@district.certiflow.gov.in' } }),
  ]);
  if (!trainingCentreUser || !districtOfficer) {
    throw new Error('Database not seeded. Run npm run prisma:seed first.');
  }

  const createdBatchIds: string[] = [];
  const originalThreshold = process.env.BATCH_OVERDUE_HOURS;

  try {
    const batch = await batchService.createBatch(
      { courseName: `Milestone 9 Audit Test ${Date.now()}` },
      trainingCentreUser.id
    );
    createdBatchIds.push(batch.id);
    await prisma.candidate.create({
      data: {
        batchId: batch.id,
        fullName: 'Audit Test Candidate',
        phone: '+919999000001',
        nationalId: `AUDIT-TEST-${Date.now()}`,
        grade: 'A',
      },
    });

    await approvalWorkflowService.submitBatch(batch.id, trainingCentreUser);
    await approvalWorkflowService.reviewBatch(
      batch.id,
      { action: 'APPROVED', remarks: 'Audit test review' },
      districtOfficer
    );

    const history = await auditService.getHistory(1000);
    const createdEvent = history.find(
      (entry) => entry.entityId === batch.id && entry.action === 'BATCH_CREATED'
    );
    const submittedEvent = history.find(
      (entry) => entry.entityId === batch.id && entry.action === 'BATCH_SUBMITTED'
    );
    const approvalEvent = history.find(
      (entry) => entry.entityId === batch.id && entry.action === 'DISTRICT_APPROVED'
    );

    if (
      !createdEvent ||
      createdEvent.userId !== trainingCentreUser.id ||
      createdEvent.timestamp.getTime() <= 0 ||
      (createdEvent.details as Record<string, unknown>).previousState !== null ||
      (createdEvent.details as Record<string, unknown>).newState !== 'DRAFT'
    ) {
      throw new Error('Batch creation audit entry is missing its actor, timestamp, or state transition.');
    }

    if (
      !submittedEvent ||
      submittedEvent.userId !== trainingCentreUser.id ||
      (submittedEvent.details as Record<string, unknown>).previousState !== 'DRAFT' ||
      (submittedEvent.details as Record<string, unknown>).newState !== 'UNDER_DISTRICT_REVIEW'
    ) {
      throw new Error('Batch submission audit entry is missing its actor or state transition.');
    }

    if (
      !approvalEvent ||
      approvalEvent.userId !== districtOfficer.id ||
      (approvalEvent.details as Record<string, unknown>).previousState !== 'UNDER_DISTRICT_REVIEW' ||
      (approvalEvent.details as Record<string, unknown>).newState !== 'UNDER_DISTRICT_REVIEW'
    ) {
      throw new Error('Approval audit entry is missing its actor or state transition.');
    }
    console.log('PASS: batch creation, submission, and approval audit actor/state details.');

    const oldUpdatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.batch.update({
      where: { id: batch.id },
      data: { updatedAt: oldUpdatedAt },
    });
    process.env.BATCH_OVERDUE_HOURS = '24';
    const now = new Date();
    const overdue = await batchService.getOverdueBatches(now);

    if (
      overdue.thresholdHours !== 24 ||
      !overdue.batches.some((item) => item.id === batch.id)
    ) {
      throw new Error('Configured overdue threshold did not identify an aged review batch.');
    }
    const stricterThreshold = await batchService.getOverdueBatches(now, 26);
    if (stricterThreshold.batches.some((item) => item.id === batch.id)) {
      throw new Error('Overdue detection ignored the configured threshold boundary.');
    }
    console.log('PASS: configurable threshold, review-state filtering, and overdue age detection.');
  } finally {
    if (originalThreshold === undefined) {
      delete process.env.BATCH_OVERDUE_HOURS;
    } else {
      process.env.BATCH_OVERDUE_HOURS = originalThreshold;
    }
    if (createdBatchIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: createdBatchIds } } });
      await prisma.batch.deleteMany({ where: { id: { in: createdBatchIds } } });
    }
    await prisma.$disconnect();
    await closeCertificateDeliveryQueue();
    redisConnection.disconnect();
  }
}

runMilestone9Tests().catch((error) => {
  console.error('Milestone 9 test failed:', error);
  process.exitCode = 1;
});
