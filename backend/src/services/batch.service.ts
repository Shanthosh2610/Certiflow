import { BatchStatus, Role } from '@prisma/client';
import prisma from '../config/db';

const REVIEW_STATUSES: BatchStatus[] = [
  BatchStatus.UNDER_DISTRICT_REVIEW,
  BatchStatus.UNDER_QUALITY_REVIEW,
  BatchStatus.UNDER_STATE_REVIEW,
];

export interface CreateBatchInput {
  courseName: string;
}

export class BatchService {
  async createBatch(input: CreateBatchInput, actorId: string) {
    const courseName = input.courseName.trim();
    if (!courseName) {
      throw new Error('Course name is required.');
    }

    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      include: { trainingCentre: true },
    });

    const trainingCentre = actor?.trainingCentre;
    if (!actor || actor.role !== Role.TRAINING_CENTRE || !trainingCentre) {
      throw new Error('Only an assigned Training Centre user can create a batch.');
    }

    const count = await prisma.batch.count();
    const batchNumber = `BATCH-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    return prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          batchNumber,
          courseName,
          trainingCentreId: actor.trainingCentreId!,
          districtId: trainingCentre.districtId,
          createdById: actor.id,
          status: BatchStatus.DRAFT,
        },
        include: {
          district: true,
          trainingCentre: true,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'BATCH',
          entityId: batch.id,
          action: 'BATCH_CREATED',
          userId: actor.id,
          details: {
            batchNumber: batch.batchNumber,
            previousState: null,
            newState: batch.status,
          },
        },
      });

      return batch;
    });
  }

  async getOverdueBatches(now = new Date(), thresholdHours = this.getConfiguredThresholdHours()) {
    if (!Number.isFinite(thresholdHours) || thresholdHours <= 0) {
      throw new Error('Overdue threshold must be a positive number of hours.');
    }

    const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000);
    const batches = await prisma.batch.findMany({
      where: {
        status: { in: REVIEW_STATUSES },
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        batchNumber: true,
        courseName: true,
        status: true,
        updatedAt: true,
        candidateCount: true,
        district: { select: { name: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    return {
      thresholdHours,
      batches: batches.map((batch) => ({
        ...batch,
        hoursWaiting: Math.floor((now.getTime() - batch.updatedAt.getTime()) / (60 * 60 * 1000)),
      })),
    };
  }

  private getConfiguredThresholdHours() {
    const configured = process.env.BATCH_OVERDUE_HOURS;
    if (!configured) {
      return 48;
    }

    const thresholdHours = Number(configured);
    if (!Number.isFinite(thresholdHours) || thresholdHours <= 0) {
      throw new Error('BATCH_OVERDUE_HOURS must be a positive number of hours.');
    }

    return thresholdHours;
  }
}

export const batchService = new BatchService();
