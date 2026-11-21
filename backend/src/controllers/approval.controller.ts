import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { approvalWorkflowService } from '../services/approval.service';

export class ApprovalController {
  async submitBatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!req.user) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const updated = await approvalWorkflowService.submitBatch(id, req.user);
      return res.status(200).json({
        success: true,
        message: `Batch ${updated.batchNumber} submitted for district review.`,
        batch: updated,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to submit batch' },
      });
    }
  }

  async resubmitBatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!req.user) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const updated = await approvalWorkflowService.resubmitBatch(id, req.user);
      return res.status(200).json({
        success: true,
        message: `Batch ${updated.batchNumber} resubmitted for review.`,
        batch: updated,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to resubmit batch' },
      });
    }
  }

  async reviewBatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { action, remarks, expectedVersion } = req.body;

      if (!req.user) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      if (!action || !['APPROVED', 'REJECTED', 'RETURNED'].includes(action)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid action. Must be APPROVED, REJECTED, or RETURNED.' },
        });
      }

      const updated = await approvalWorkflowService.reviewBatch(
        id,
        { action, remarks, expectedVersion },
        req.user
      );

      return res.status(200).json({
        success: true,
        message: `Batch decision [${action}] recorded successfully. Status is now ${updated.status}.`,
        batch: updated,
      });
    } catch (error: any) {
      const isConflict =
        error.message.includes('CONCURRENCY_CONFLICT') ||
        error.message.includes('DUPLICATE_APPROVAL') ||
        error.code === 'P2025';
      const isForbidden = error.message.includes('Forbidden');

      const statusCode = isConflict ? 409 : isForbidden ? 403 : 400;
      return res.status(statusCode).json({
        success: false,
        error: { message: error.message || 'Failed to record review decision.' },
      });
    }
  }
}

export const approvalController = new ApprovalController();
