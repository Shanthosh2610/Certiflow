import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { auditService } from '../services/audit.service';

export class AuditController {
  async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const requestedLimit = req.query.limit ? Number(req.query.limit) : 500;
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
        return res.status(400).json({
          success: false,
          error: { message: 'limit must be a positive integer.' },
        });
      }

      const logs = await auditService.getHistory(requestedLimit);
      return res.status(200).json({ success: true, logs });
    } catch (error) {
      return next(error);
    }
  }
}

export const auditController = new AuditController();
