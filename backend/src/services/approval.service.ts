import prisma from '../config/db';
import { Role, BatchStatus, ApprovalStage, ApprovalAction } from '@prisma/client';
import { certificateService } from './certificate.service';

export interface ReviewBatchInput {
  action: 'APPROVED' | 'REJECTED' | 'RETURNED';
  remarks?: string;
  expectedVersion?: number;
}

export interface ReviewerContext {
  id: string;
  name: string;
  role: Role;
  districtId?: string | null;
}

export class ApprovalWorkflowService {
  /**
   * Submit draft batch to district review
   */
  async submitBatch(batchId: string, user: ReviewerContext) {
    if (user.role !== Role.TRAINING_CENTRE) {
      throw new Error('Forbidden: Only the Training Centre can submit batches for review.');
    }

    return await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        include: { _count: { select: { candidates: true } } },
      });

      if (!batch) {
        throw new Error(`Batch ${batchId} not found.`);
      }

      if (batch.status !== BatchStatus.DRAFT) {
        throw new Error(`Cannot submit batch. Current status is "${batch.status}". Expected DRAFT.`);
      }

      if (batch._count.candidates === 0) {
        throw new Error('Cannot submit batch with 0 candidates. Upload candidate roster first.');
      }

      const updated = await tx.batch.update({
        where: { id: batchId, version: batch.version },
        data: {
          status: BatchStatus.UNDER_DISTRICT_REVIEW,
          submittedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'BATCH',
          entityId: batchId,
          action: 'BATCH_SUBMITTED',
          userId: user.id,
          details: {
            batchNumber: batch.batchNumber,
            candidateCount: batch.candidateCount,
            previousState: batch.status,
            newState: updated.status,
          },
          timestamp: new Date(),
        },
      });

      return updated;
    });
  }

  /**
   * Resubmit a RETURNED batch after corrections
   */
  async resubmitBatch(batchId: string, user: ReviewerContext) {
    if (user.role !== Role.TRAINING_CENTRE) {
      throw new Error('Forbidden: Only the Training Centre can resubmit batches.');
    }

    return await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw new Error(`Batch ${batchId} not found.`);
      }

      if (batch.status !== BatchStatus.RETURNED) {
        throw new Error(`Cannot resubmit batch. Current status is "${batch.status}". Expected RETURNED.`);
      }

      const updated = await tx.batch.update({
        where: { id: batchId, version: batch.version },
        data: {
          status: BatchStatus.UNDER_DISTRICT_REVIEW,
          returnReason: null,
          districtApprovalCount: 0,
          reviewRound: { increment: 1 },
          submittedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'BATCH',
          entityId: batchId,
          action: 'BATCH_RESUBMITTED',
          userId: user.id,
          details: {
            batchNumber: batch.batchNumber,
            previousStatus: 'RETURNED',
            previousState: batch.status,
            newState: updated.status,
            reviewRound: updated.reviewRound,
          },
          timestamp: new Date(),
        },
      });

      return updated;
    });
  }

  /**
   * Universal Review Engine with Concurrency Control & State Machine
   */
  async reviewBatch(batchId: string, input: ReviewBatchInput, user: ReviewerContext) {
    const { action, remarks, expectedVersion } = input;

    // Requirement: Rejections and returns strictly require a reason
    if ((action === 'RETURNED' || action === 'REJECTED') && (!remarks || remarks.trim().length === 0)) {
      throw new Error(`Rejection or return requires a mandatory reason explaining the decision.`);
    }

    const updatedBatch = await prisma.$transaction(async (tx) => {
      // 1. Fetch current batch state
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        include: {
          candidates: true,
          approvals: true,
          district: true,
        },
      });

      if (!batch) {
        throw new Error(`Batch ${batchId} not found.`);
      }

      // 2. Concurrency Lock: Optimistic Concurrency Control Check
      if (expectedVersion !== undefined && batch.version !== expectedVersion) {
        throw new Error(
          `CONCURRENCY_CONFLICT: Batch was modified by another officer simultaneously. Version mismatch (expected ${expectedVersion}, found ${batch.version}). Please refresh and try again.`
        );
      }

      let currentStage: ApprovalStage;
      let nextStatus: BatchStatus = batch.status;
      let newDistrictApprovalCount = batch.districtApprovalCount;

      // -------------------------------------------------------------
      // STAGE 1: DISTRICT OFFICER REVIEW
      // -------------------------------------------------------------
      if (batch.status === BatchStatus.UNDER_DISTRICT_REVIEW) {
        if (user.role !== Role.DISTRICT_OFFICER) {
          throw new Error(`Forbidden: Role "${user.role}" cannot review batches in District stage. Required: DISTRICT_OFFICER.`);
        }

        // District jurisdiction check
        if (user.districtId && user.districtId !== batch.districtId) {
          throw new Error(`Forbidden: Officer belongs to another district and cannot review batches for ${batch.district.name}.`);
        }

        currentStage = ApprovalStage.DISTRICT;

        // Prevent duplicate voting in same stage
        const alreadyVoted = await tx.batchApproval.findFirst({
          where: {
            batchId,
            officerId: user.id,
            stage: ApprovalStage.DISTRICT,
            reviewRound: batch.reviewRound,
          },
        });

        if (alreadyVoted) {
          throw new Error(`DUPLICATE_APPROVAL: Officer "${user.name}" has already submitted a decision for the District stage.`);
        }

        if (action === 'RETURNED') {
          nextStatus = BatchStatus.RETURNED;
          newDistrictApprovalCount = 0;
        } else if (action === 'REJECTED') {
          nextStatus = BatchStatus.REJECTED;
        } else if (action === 'APPROVED') {
          newDistrictApprovalCount = batch.districtApprovalCount + 1;
          if (newDistrictApprovalCount >= 2) {
            // Quorum of 2 district approvals achieved!
            // Check large batch threshold (> 50 candidates)
            const isLarge = batch.isLargeBatch || batch.candidateCount >= 50;
            nextStatus = isLarge ? BatchStatus.UNDER_QUALITY_REVIEW : BatchStatus.UNDER_STATE_REVIEW;
          } else {
            // 1st approval recorded, stays in UNDER_DISTRICT_REVIEW for second officer
            nextStatus = BatchStatus.UNDER_DISTRICT_REVIEW;
          }
        }
      }
      // -------------------------------------------------------------
      // STAGE 2: QUALITY TEAM SCRUTINY (For large batches > 50)
      // -------------------------------------------------------------
      else if (batch.status === BatchStatus.UNDER_QUALITY_REVIEW) {
        if (user.role !== Role.QUALITY_TEAM) {
          throw new Error(`Forbidden: Role "${user.role}" cannot review batches in Quality stage. Required: QUALITY_TEAM.`);
        }

        currentStage = ApprovalStage.QUALITY;

        const alreadyVoted = await tx.batchApproval.findFirst({
          where: {
            batchId,
            officerId: user.id,
            stage: ApprovalStage.QUALITY,
            reviewRound: batch.reviewRound,
          },
        });

        if (alreadyVoted) {
          throw new Error(`DUPLICATE_APPROVAL: Quality officer "${user.name}" has already reviewed this batch.`);
        }

        if (action === 'RETURNED') {
          nextStatus = BatchStatus.RETURNED;
          newDistrictApprovalCount = 0;
        } else if (action === 'REJECTED') {
          nextStatus = BatchStatus.REJECTED;
        } else if (action === 'APPROVED') {
          // Passed quality scrutiny, routes to State Office final sign-off
          nextStatus = BatchStatus.UNDER_STATE_REVIEW;
        }
      }
      // -------------------------------------------------------------
      // STAGE 3: STATE OFFICE FINAL APPROVAL
      // -------------------------------------------------------------
      else if (batch.status === BatchStatus.UNDER_STATE_REVIEW) {
        if (user.role !== Role.STATE_OFFICE) {
          throw new Error(`Forbidden: Role "${user.role}" cannot provide final State approval. Required: STATE_OFFICE.`);
        }

        currentStage = ApprovalStage.STATE;

        const alreadyVoted = await tx.batchApproval.findFirst({
          where: {
            batchId,
            officerId: user.id,
            stage: ApprovalStage.STATE,
            reviewRound: batch.reviewRound,
          },
        });

        if (alreadyVoted) {
          throw new Error(`DUPLICATE_APPROVAL: State Office has already acted on this batch.`);
        }

        if (action === 'REJECTED') {
          nextStatus = BatchStatus.REJECTED;
        } else if (action === 'RETURNED') {
          nextStatus = BatchStatus.RETURNED;
          newDistrictApprovalCount = 0;
        } else if (action === 'APPROVED') {
          // Final Approval -> COMPLETED
          nextStatus = BatchStatus.COMPLETED;
        }
      } else {
        throw new Error(`Invalid state transition: Batch is in "${batch.status}" and cannot accept review decisions.`);
      }

      // 3. Record the approval decision
      await tx.batchApproval.create({
        data: {
          batchId,
          officerId: user.id,
          role: user.role,
          stage: currentStage,
          action: action as ApprovalAction,
          reviewRound: batch.reviewRound,
          remarks: remarks || null,
          createdAt: new Date(),
        },
      });

      // 4. Update Batch State
      let updatedBatch;
      try {
        updatedBatch = await tx.batch.update({
          where: { id: batchId, version: batch.version },
          data: {
            status: nextStatus,
            districtApprovalCount: newDistrictApprovalCount,
            returnReason: action === 'RETURNED' ? remarks : batch.returnReason,
            rejectReason: action === 'REJECTED' ? remarks : batch.rejectReason,
            approvedAt: nextStatus === BatchStatus.COMPLETED ? new Date() : batch.approvedAt,
            version: { increment: 1 },
          },
          include: {
            approvals: { include: { officer: true } },
            candidates: true,
            district: true,
            trainingCentre: true,
          },
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2025'
        ) {
          throw new Error(
            'CONCURRENCY_CONFLICT: Batch was modified by another officer simultaneously. Please refresh and try again.'
          );
        }
        throw error;
      }

      // 5. Record Audit Log
      await tx.auditLog.create({
        data: {
          entityType: 'APPROVAL',
          entityId: batchId,
          action: `${currentStage}_${action}`,
          userId: user.id,
          details: {
            officerName: user.name,
            role: user.role,
            action,
            remarks,
            previousState: batch.status,
            newState: nextStatus,
            previousStatus: batch.status,
            newStatus: nextStatus,
            districtApprovals: newDistrictApprovalCount,
            reviewRound: batch.reviewRound,
          },
          timestamp: new Date(),
        },
      });

      return updatedBatch;
    });

    if (updatedBatch.status === BatchStatus.COMPLETED) {
      await certificateService.issueCertificatesForBatch(batchId, user.id);
      return {
        ...updatedBatch,
        candidates: updatedBatch.candidates.map((candidate) => ({
          ...candidate,
          status: candidate.status === 'FAILED' ? candidate.status : 'CERTIFIED',
        })),
      };
    }

    return updatedBatch;
  }
}

export const approvalWorkflowService = new ApprovalWorkflowService();
