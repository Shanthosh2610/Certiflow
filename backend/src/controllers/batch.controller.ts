import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import { batchUploadService } from '../services/batchUpload.service';
import { batchService } from '../services/batch.service';
import { AuthenticatedRequest } from '../middleware/rbac';

export class BatchController {
  /**
   * Validates an uploaded spreadsheet buffer without saving anything to DB.
   * Returns row-level errors and preview.
   */
  async validateSpreadsheet(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { message: 'No file uploaded. Please attach a .csv or .xlsx spreadsheet.' },
        });
      }

      const batchId = req.body.batchId as string | undefined;
      const result = await batchUploadService.validateSpreadsheetBuffer(
        req.file.buffer,
        req.file.originalname,
        batchId
      );

      return res.status(200).json({
        success: true,
        validation: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to process spreadsheet.' },
      });
    }
  }

  /**
   * Atomically commits the candidate roster to PostgreSQL.
   * Re-validates every row inside a transaction to prevent partial writes.
   */
  async commitUpload(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { batchId, candidates } = req.body;

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { message: 'Authentication required.' },
        });
      }

      if (!batchId) {
        return res.status(400).json({
          success: false,
          error: { message: 'batchId is required to commit candidates.' },
        });
      }

      if (!Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Candidate list cannot be empty.' },
        });
      }

      const committedBatch = await batchUploadService.commitBatchUpload(
        batchId,
        candidates,
        req.user.id
      );

      return res.status(201).json({
        success: true,
        message: `Successfully committed ${committedBatch.candidateCount} candidates to ${committedBatch.batchNumber}. Routed to District Review.`,
        batch: committedBatch,
      });
    } catch (error: any) {
      return res.status(422).json({
        success: false,
        error: { message: error.message || 'Failed to commit batch upload.' },
      });
    }
  }

  /**
   * Creates a new draft batch
   */
  async createBatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { courseName } = req.body;

      if (typeof courseName !== 'string' || !courseName.trim()) {
        return res.status(400).json({
          success: false,
          error: { message: 'courseName is mandatory.' },
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { message: 'Authentication required.' },
        });
      }

      const newBatch = await batchService.createBatch({ courseName }, req.user.id);

      return res.status(201).json({
        success: true,
        batch: newBatch,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * List all batches
   */
  async getBatches(req: Request, res: Response, next: NextFunction) {
    try {
      const batches = await prisma.batch.findMany({
        include: {
          district: true,
          trainingCentre: true,
          approvals: {
            include: { officer: { select: { name: true, role: true } } },
          },
          _count: { select: { candidates: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        batches,
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getOverdueBatches(req: Request, res: Response, next: NextFunction) {
    try {
      const overdue = await batchService.getOverdueBatches();
      return res.status(200).json({ success: true, ...overdue });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Get single batch by ID or batchNumber
   */
  async getBatchById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const batch = await prisma.batch.findFirst({
        where: {
          OR: [{ id }, { batchNumber: id }],
        },
        include: {
          district: true,
          trainingCentre: true,
          candidates: true,
          approvals: {
            include: { officer: { select: { name: true, role: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!batch) {
        return res.status(404).json({
          success: false,
          error: { message: `Batch ${id} not found.` },
        });
      }

      return res.status(200).json({
        success: true,
        batch,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Download official CSV template
   */
  async getSampleTemplate(req: Request, res: Response) {
    const csvContent =
      'fullName,phone,email,nationalId,grade,completionDate\n' +
      'Aarav Sharma,9876543210,aarav.sharma@example.com,AADHAAR-8901-XXXX-1001,A+,2026-11-20\n' +
      'Sneha Verma,9876543211,sneha.verma@example.com,AADHAAR-8901-XXXX-1002,A,2026-11-20\n' +
      'Vikram Patel,9876543212,vikram.patel@example.com,AADHAAR-8901-XXXX-1003,Pass,2026-11-20\n' +
      'Pooja Nair,9876543213,pooja.nair@example.com,AADHAAR-8901-XXXX-1004,B,2026-11-20\n' +
      'Mohit Khan,9876543214,mohit.khan@example.com,AADHAAR-8901-XXXX-1005,A,2026-11-20\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="candidates_template.csv"');
    return res.status(200).send(csvContent);
  }
}

export const batchController = new BatchController();
