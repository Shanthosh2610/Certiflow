import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import { certificateService } from '../services/certificate.service';
import { AuthenticatedRequest } from '../middleware/rbac';

export class CertificateController {
  /**
   * List all certificates with candidate and batch details
   */
  async getCertificates(req: Request, res: Response, next: NextFunction) {
    try {
      const certificates = await prisma.certificate.findMany({
        include: {
          candidate: true,
          batch: {
            include: { district: true, trainingCentre: true },
          },
          deliveryLogs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { issuedAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        certificates: certificates.map((c) => ({
          id: c.id,
          certificateNumber: c.certificateNumber,
          candidateId: c.candidateId,
          candidateName: c.candidate.fullName,
          candidatePhone: c.candidate.phone,
          batchId: c.batchId,
          batchNumber: c.batch.batchNumber,
          courseName: c.batch.courseName,
          trainingCentre: c.batch.trainingCentre.name,
          district: c.batch.district.name,
          grade: c.candidate.grade,
          pdfUrl: c.pdfUrl,
          qrCodeUrl: c.qrCodeUrl,
          verificationHash: c.verificationHash,
          status: c.status,
          revocationReason: c.revocationReason,
          revokedAt: c.revokedAt,
          issuedAt: c.issuedAt,
          deliveryStatus: c.deliveryLogs[0]?.status || 'QUEUED',
          deliveryAttempts: c.deliveryLogs[0]?.attempts || 0,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async retryDelivery(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      if (req.user.role !== 'STATE_OFFICE') {
        return res.status(403).json({
          success: false,
          error: { message: 'Forbidden: Only the State Office can retry certificate delivery.' },
        });
      }

      const delivery = await certificateService.retryCertificateDelivery(
        req.params.certificateNumber,
        req.user.id
      );
      return res.status(202).json({
        success: true,
        delivery: {
          status: delivery.status,
          attempts: delivery.attempts,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Public verification endpoint without login
   */
  async getCertificateByNumber(req: Request, res: Response, next: NextFunction) {
    try {
      const { certificateNumber } = req.params;
      const certificate = await certificateService.verifyCertificate(certificateNumber);

      if (!certificate) {
        return res.status(404).json({
          success: false,
          status: 'INVALID',
          error: { message: 'No certificate matching this ID exists in the public registry.' },
        });
      }

      return res.status(200).json({
        success: true,
        certificate,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download physical PDF certificate
   */
  async downloadPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const { certificateNumber } = req.params;
      const { filePath } = await certificateService.getCertificatePdfPath(certificateNumber);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${certificateNumber}.pdf"`);
      return res.sendFile(filePath);
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist in the official state registry')) {
        return res.status(404).json({
          success: false,
          error: { message: error.message },
        });
      }
      return next(error);
    }
  }

  /**
   * Retry issuance or repair missing PDF files for a completed batch.
   */
  async issueBatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      if (req.user.role !== 'STATE_OFFICE') {
        return res.status(403).json({
          success: false,
          error: { message: 'Forbidden: Only the State Office can issue certificates.' },
        });
      }

      const certificates = await certificateService.issueCertificatesForBatch(
        req.params.batchId,
        req.user.id
      );
      await prisma.auditLog.create({
        data: {
          entityType: 'BATCH',
          entityId: req.params.batchId,
          action: 'CERTIFICATE_ISSUANCE_RETRIED',
          userId: req.user.id,
          details: {
            certificateCount: certificates.length,
            previousState: 'COMPLETED',
            newState: 'COMPLETED',
          },
        },
      });
      return res.status(200).json({
        success: true,
        issuedCount: certificates.length,
        certificates: certificates.map(({ certificateNumber, pdfUrl, status }) => ({
          certificateNumber,
          pdfUrl,
          status,
        })),
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * State Office Revocation
   */
  async revokeCertificate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { certificateNumber } = req.params;
      const { reason } = req.body;

      if (!req.user) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      if (req.user.role !== 'STATE_OFFICE') {
        return res.status(403).json({
          success: false,
          error: { message: 'Forbidden: Only the State Office can revoke certificates.' },
        });
      }

      const updated = await certificateService.revokeCertificate(
        certificateNumber,
        reason,
        req.user.id
      );

      return res.status(200).json({
        success: true,
        message: `Certificate ${certificateNumber} has been revoked and marked invalid publicly.`,
        certificate: updated,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to revoke certificate' },
      });
    }
  }
}

export const certificateController = new CertificateController();
