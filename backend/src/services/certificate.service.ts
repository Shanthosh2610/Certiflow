import prisma from '../config/db';
import crypto from 'crypto';
import fs from 'fs';
import { certificatePdfService, CertificatePdfData } from './certificatePdf.service';
import {
  enqueueCertificateDelivery,
  retryCertificateDeliveryJob,
} from '../queues/certificateDelivery.queue';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

type DeliveryJobEnqueuer = (deliveryLogId: string) => Promise<unknown>;

export interface PublicCertificateVerification {
  certificateNumber: string;
  status: 'VALID' | 'CANCELLED';
  candidateName: string;
  courseName: string;
  trainingCentre: string;
  completionDate: Date;
  issuedAt: Date;
  cancelledAt: Date | null;
}

export class CertificateService {
  constructor(
    private readonly enqueueDeliveryJob: DeliveryJobEnqueuer = enqueueCertificateDelivery,
    private readonly retryDeliveryJob: DeliveryJobEnqueuer = retryCertificateDeliveryJob
  ) {}

  /**
   * Issue certificates only after final approval. Candidate and certificate unique
   * constraints make concurrent/retried issuance jobs safe.
   */
  async issueCertificatesForBatch(batchId: string, actorId: string) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        candidates: true,
        district: true,
        trainingCentre: true,
      },
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found.`);
    }
    if (batch.status !== 'COMPLETED') {
      throw new Error(`Cannot issue certificates for batch ${batchId} before final approval.`);
    }

    const eligibleCandidates = batch.candidates.filter((candidate) => candidate.status !== 'FAILED');
    const districtCode = batch.district.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const year = (batch.approvedAt || new Date()).getFullYear();

    const issuance = await prisma.$transaction(async (tx) => {
      const certificatesToCreate = eligibleCandidates.map((candidate) => {
        // Candidate IDs are globally unique, making this number stable across retries.
        const certificateNumber = `CERT-${year}-${districtCode}-${candidate.id}`;
        const verificationHash = crypto
          .createHash('sha256')
          .update(`${certificateNumber}-${candidate.fullName}-${candidate.nationalId}-${batch.courseName}`)
          .digest('hex');

        return {
          certificateNumber,
          candidateId: candidate.id,
          batchId: batch.id,
          pdfUrl: `/api/certificates/${certificateNumber}/download`,
          qrCodeUrl: `${CLIENT_URL}/verify/${certificateNumber}`,
          verificationHash,
          status: 'ACTIVE' as const,
          issuedAt: new Date(),
        };
      });

      const created = certificatesToCreate.length
        ? await tx.certificate.createMany({ data: certificatesToCreate, skipDuplicates: true })
        : { count: 0 };

      if (eligibleCandidates.length) {
        await tx.candidate.updateMany({
          where: { id: { in: eligibleCandidates.map((candidate) => candidate.id) } },
          data: { status: 'CERTIFIED' },
        });
      }

      if (created.count > 0) {
        await tx.auditLog.create({
          data: {
            entityType: 'BATCH',
            entityId: batchId,
            action: 'CERTIFICATES_ISSUED',
            userId: actorId,
            details: {
              issuedCount: created.count,
              previousState: null,
              newState: 'ACTIVE',
              batchStatus: batch.status,
            },
          },
        });
      }

      const certificates = eligibleCandidates.length
        ? await tx.certificate.findMany({
            where: {
              batchId,
              candidateId: { in: eligibleCandidates.map((candidate) => candidate.id) },
            },
            include: { candidate: true },
            orderBy: { issuedAt: 'asc' },
          })
        : [];

      if (certificates.length) {
        const existingDeliveryLogs = await tx.whatsAppDeliveryLog.findMany({
          where: { certificateId: { in: certificates.map((certificate) => certificate.id) } },
          select: { certificateId: true },
        });
        const loggedCertificateIds = new Set(existingDeliveryLogs.map((log) => log.certificateId));
        const missingDeliveryLogs = certificates.filter(
          (certificate) => !loggedCertificateIds.has(certificate.id)
        );

        if (missingDeliveryLogs.length) {
          await tx.whatsAppDeliveryLog.createMany({
            data: missingDeliveryLogs.map((certificate) => ({
              id: `delivery-${certificate.id}`,
              certificateId: certificate.id,
              candidateId: certificate.candidateId,
              phone: certificate.candidate.phone,
              status: 'QUEUED',
              attempts: 0,
            })),
            skipDuplicates: true,
          });
        }
      }

      return certificates.length
        ? tx.certificate.findMany({
            where: {
              batchId,
              candidateId: { in: eligibleCandidates.map((candidate) => candidate.id) },
            },
            include: {
              candidate: true,
              deliveryLogs: { orderBy: { createdAt: 'asc' } },
            },
            orderBy: { issuedAt: 'asc' },
          })
        : [];
    });

    // Files are generated after metadata commits. A retry finds the same rows and
    // repairs any missing PDF without issuing another certificate.
    for (const certificate of issuance) {
      const pdfData: CertificatePdfData = {
        certificateNumber: certificate.certificateNumber,
        candidateName: certificate.candidate.fullName,
        nationalId: certificate.candidate.nationalId,
        courseName: batch.courseName,
        grade: certificate.candidate.grade,
        trainingCentre: batch.trainingCentre.name,
        district: batch.district.name,
        completionDate: certificate.candidate.completionDate.toISOString().split('T')[0],
        issuedDate: certificate.issuedAt.toISOString().split('T')[0],
        verificationHash: certificate.verificationHash,
        verificationUrl: `${CLIENT_URL}/verify/${certificate.certificateNumber}`,
        status: certificate.status,
        revocationReason: certificate.revocationReason || undefined,
      };

      await certificatePdfService.generateCertificatePdf(pdfData);
    }

    await Promise.all(
      issuance.flatMap((certificate) =>
        certificate.deliveryLogs
          .filter((delivery) => delivery.status === 'QUEUED' || delivery.status === 'RETRYING')
          .map((delivery) => this.enqueueDeliveryJob(delivery.id))
      )
    );

    return issuance;
  }

  async retryCertificateDelivery(certificateNumber: string, actorId: string) {
    const delivery = await prisma.whatsAppDeliveryLog.findFirst({
      where: { certificate: { certificateNumber } },
      include: { certificate: { select: { certificateNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!delivery) {
      throw new Error(`No delivery record found for certificate "${certificateNumber}".`);
    }
    if (delivery.status === 'DELIVERED') {
      return delivery;
    }
    if (delivery.status !== 'FAILED') {
      throw new Error(`Delivery cannot be manually retried while it is ${delivery.status}.`);
    }

    const claimed = await prisma.whatsAppDeliveryLog.updateMany({
      where: { id: delivery.id, status: 'FAILED' },
      data: { status: 'QUEUED', lastError: null },
    });
    if (claimed.count === 0) {
      return prisma.whatsAppDeliveryLog.findUniqueOrThrow({ where: { id: delivery.id } });
    }

    try {
      await this.retryDeliveryJob(delivery.id);
    } catch (error) {
      await prisma.whatsAppDeliveryLog.updateMany({
        where: { id: delivery.id, status: 'QUEUED' },
        data: {
          status: 'FAILED',
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }

    await prisma.auditLog.create({
      data: {
        entityType: 'CERTIFICATE',
        entityId: delivery.certificate.certificateNumber,
        action: 'CERTIFICATE_DELIVERY_RETRY',
        userId: actorId,
        details: {
          deliveryLogId: delivery.id,
          previousState: 'FAILED',
          newState: 'QUEUED',
        },
      },
    });

    return prisma.whatsAppDeliveryLog.findUniqueOrThrow({ where: { id: delivery.id } });
  }

  async verifyCertificate(
    certificateNumber: string
  ): Promise<PublicCertificateVerification | null> {
    const certificate = await prisma.certificate.findUnique({
      where: { certificateNumber },
      select: {
        certificateNumber: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        candidate: {
          select: {
            fullName: true,
            completionDate: true,
          },
        },
        batch: {
          select: {
            courseName: true,
            trainingCentre: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!certificate) {
      return null;
    }

    return {
      certificateNumber: certificate.certificateNumber,
      status: certificate.status === 'ACTIVE' ? 'VALID' : 'CANCELLED',
      candidateName: certificate.candidate.fullName,
      courseName: certificate.batch.courseName,
      trainingCentre: certificate.batch.trainingCentre.name,
      completionDate: certificate.candidate.completionDate,
      issuedAt: certificate.issuedAt,
      cancelledAt: certificate.revokedAt,
    };
  }

  /**
   * Retrieves the physical PDF path for download, generating it on the fly if needed.
   */
  async getCertificatePdfPath(certificateNumber: string): Promise<{ filePath: string; certificate: any }> {
    const cert = await prisma.certificate.findUnique({
      where: { certificateNumber },
      include: {
        candidate: true,
        batch: {
          include: {
            district: true,
            trainingCentre: true,
          },
        },
      },
    });

    if (!cert) {
      throw new Error(`Certificate "${certificateNumber}" does not exist in the official state registry.`);
    }

    const filePath = certificatePdfService.getFilePath(certificateNumber);

    if (!fs.existsSync(filePath)) {
      const pdfData: CertificatePdfData = {
        certificateNumber: cert.certificateNumber,
        candidateName: cert.candidate.fullName,
        nationalId: cert.candidate.nationalId,
        courseName: cert.batch.courseName,
        grade: cert.candidate.grade,
        trainingCentre: cert.batch.trainingCentre.name,
        district: cert.batch.district.name,
        completionDate: cert.candidate.completionDate.toISOString().split('T')[0],
        issuedDate: cert.issuedAt.toISOString().split('T')[0],
        verificationHash: cert.verificationHash,
        verificationUrl: `${CLIENT_URL}/verify/${cert.certificateNumber}`,
        status: cert.status,
        revocationReason: cert.revocationReason || undefined,
      };

      await certificatePdfService.generateCertificatePdf(pdfData);
    }

    return { filePath, certificate: cert };
  }

  /**
   * State Office Revocation of an invalid certificate.
   */
  async revokeCertificate(certificateNumber: string, reason: string, actorId: string) {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Mandatory revocation reason is required.');
    }

    const cert = await prisma.certificate.findUnique({
      where: { certificateNumber },
    });

    if (!cert) {
      throw new Error(`Certificate "${certificateNumber}" not found.`);
    }

    if (cert.status === 'REVOKED') {
      throw new Error(`Certificate "${certificateNumber}" is already revoked.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const revoked = await tx.certificate.update({
        where: { certificateNumber },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedById: actorId,
          revocationReason: reason.trim(),
        },
        include: {
          candidate: true,
          batch: { include: { district: true, trainingCentre: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'CERTIFICATE',
          entityId: certificateNumber,
          action: 'CERTIFICATE_REVOKED',
          userId: actorId,
          details: {
            certificateNumber,
            reason: reason.trim(),
            previousState: cert.status,
            newState: revoked.status,
          },
        },
      });

      return revoked;
    });

    const pdfData: CertificatePdfData = {
      certificateNumber: updated.certificateNumber,
      candidateName: updated.candidate.fullName,
      nationalId: updated.candidate.nationalId,
      courseName: updated.batch.courseName,
      grade: updated.candidate.grade,
      trainingCentre: updated.batch.trainingCentre.name,
      district: updated.batch.district.name,
      completionDate: updated.candidate.completionDate.toISOString().split('T')[0],
      issuedDate: updated.issuedAt.toISOString().split('T')[0],
      verificationHash: updated.verificationHash,
      verificationUrl: `${CLIENT_URL}/verify/${updated.certificateNumber}`,
      status: 'REVOKED',
      revocationReason: reason.trim(),
    };

    await certificatePdfService.generateCertificatePdf(pdfData);

    return updated;
  }
}

export const certificateService = new CertificateService();
