import prisma from '../config/db';
import { parseSpreadsheet, validateCandidateRows, ValidationResult, CandidateRowInput } from '../utils/validation';

export class BatchUploadService {
  /**
   * Parses an uploaded CSV/Excel buffer and returns preview and row-by-row validation.
   * Does NOT write anything to database.
   */
  async validateSpreadsheetBuffer(buffer: Buffer, filename: string, batchId?: string): Promise<ValidationResult> {
    const rawRows = parseSpreadsheet(buffer, filename);
    const result = validateCandidateRows(rawRows);

    // If batchId is provided, also check against database for existing duplicates in this batch
    if (batchId && result.preview.length > 0) {
      const existingCandidates = await prisma.candidate.findMany({
        where: { batchId },
        select: { nationalId: true },
      });

      const existingSet = new Set(existingCandidates.map((c) => c.nationalId.toUpperCase()));

      result.preview.forEach((row) => {
        if (existingSet.has(row.nationalId.toUpperCase())) {
          const msg = `Candidate with ID "${row.nationalId}" is already enrolled in this batch in the database.`;
          row.errors.push(msg);
          result.errors.push({
            row: row.row,
            field: 'nationalId',
            value: row.nationalId,
            message: msg,
          });
        }
      });

      result.errorRowsCount = result.preview.filter((p) => p.errors.length > 0).length;
      result.validRowsCount = result.preview.length - result.errorRowsCount;
      result.isValid = result.errors.length === 0;
    }

    return result;
  }

  /**
   * Commits the batch upload atomically.
   * If even a single candidate row is invalid, the entire transaction rolls back.
   * Zero partial batch writes guaranteed.
   */
  async commitBatchUpload(
    batchId: string,
    candidates: CandidateRowInput[],
    userId: string
  ) {
    if (!candidates || candidates.length === 0) {
      throw new Error('Cannot commit an empty candidate roster.');
    }

    // Run strict re-validation
    const validation = validateCandidateRows(candidates);
    if (!validation.isValid) {
      const errorSummary = validation.errors
        .slice(0, 5)
        .map((e) => `Row ${e.row} [${e.field}]: ${e.message}`)
        .join('; ');
      throw new Error(`Validation failed (${validation.errors.length} errors). Aborting commit: ${errorSummary}`);
    }

    // Execute atomic PostgreSQL ACID transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Verify batch exists and is in an editable state (DRAFT or RETURNED)
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw new Error(`Batch with ID "${batchId}" not found.`);
      }

      if (batch.status !== 'DRAFT' && batch.status !== 'RETURNED') {
        throw new Error(`Batch is in "${batch.status}" status and cannot accept new candidate uploads.`);
      }

      // 2. Clear any old candidates if this was a RETURNED batch being resubmitted
      await tx.candidate.deleteMany({
        where: { batchId },
      });

      // 3. Insert all candidate rows in bulk
      const candidateData = candidates.map((c) => {
        const rawDate = c.completionDate ? String(c.completionDate).replace(/[\r\n]/g, '').trim() : '';
        const d = rawDate ? new Date(rawDate) : new Date();
        const validDate = isNaN(d.getTime()) ? new Date() : d;

        return {
          batchId,
          fullName: c.fullName,
          phone: c.phone,
          email: c.email || null,
          nationalId: c.nationalId,
          grade: c.grade,
          completionDate: validDate,
          status: 'PENDING' as const,
        };
      });

      await tx.candidate.createMany({
        data: candidateData,
      });

      // 4. Update Batch status to UNDER_DISTRICT_REVIEW and flag isLargeBatch
      const candidateCount = candidateData.length;
      const isLargeBatch = candidateCount >= 50;

      const updatedBatch = await tx.batch.update({
        where: { id: batchId },
        data: {
          candidateCount,
          isLargeBatch,
          status: 'UNDER_DISTRICT_REVIEW',
          districtApprovalCount: 0,
          ...(batch.status === 'RETURNED' ? { reviewRound: { increment: 1 } } : {}),
          returnReason: null,
          submittedAt: new Date(),
          version: { increment: 1 },
        },
        include: {
          candidates: true,
          trainingCentre: true,
          district: true,
        },
      });

      // 5. Create immutable audit log entry
      await tx.auditLog.create({
        data: {
          entityType: 'BATCH',
          entityId: batchId,
          action: batch.status === 'RETURNED' ? 'BATCH_RESUBMITTED' : 'BATCH_UPLOAD_COMMITTED',
          userId,
          details: {
            batchNumber: updatedBatch.batchNumber,
            candidateCount,
            isLargeBatch,
            previousState: batch.status,
            newState: updatedBatch.status,
            reviewRound: updatedBatch.reviewRound,
          },
          timestamp: new Date(),
        },
      });

      return updatedBatch;
    });
  }
}

export const batchUploadService = new BatchUploadService();
