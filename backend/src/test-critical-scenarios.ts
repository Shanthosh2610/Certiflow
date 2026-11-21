import crypto from 'crypto';
import fs from 'fs';
import http, { Server } from 'http';
import { AddressInfo } from 'net';
import prisma from './config/db';
import app from './app';
import { BatchStatus } from '@prisma/client';
import { approvalWorkflowService } from './services/approval.service';
import { batchUploadService } from './services/batchUpload.service';
import { CertificateService } from './services/certificate.service';
import { certificatePdfService } from './services/certificatePdf.service';

const requestStatus = (
  port: number,
  route: string,
  body: Record<string, unknown>,
  userIdentity?: string
) =>
  new Promise<number>((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: route,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userIdentity ? { 'x-user-id': userIdentity } : {}),
        },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode || 0));
      }
    );
    request.on('error', reject);
    request.write(JSON.stringify(body));
    request.end();
  });

async function runCriticalScenarioTests() {
  const [trainingCentreUser, dev, meera, stateOffice, district, trainingCentre] = await Promise.all([
    prisma.user.findFirst({ where: { email: 'anika@training.certiflow.gov.in' } }),
    prisma.user.findFirst({ where: { email: 'dev@district.certiflow.gov.in' } }),
    prisma.user.findFirst({ where: { email: 'meera@district.certiflow.gov.in' } }),
    prisma.user.findFirst({ where: { email: 'farah@state.certiflow.gov.in' } }),
    prisma.district.findFirst({ where: { name: 'Bhopal' } }),
    prisma.trainingCentre.findFirst(),
  ]);
  if (!trainingCentreUser || !dev || !meera || !stateOffice || !district || !trainingCentre) {
    throw new Error('Database not seeded. Run npm run prisma:seed first.');
  }

  const batchIds: string[] = [];
  const certificateNumbers: string[] = [];
  let server: Server | undefined;
  let serverPort: number | undefined;

  const createTestBatch = async (
    suffix: string,
    status: BatchStatus = BatchStatus.DRAFT,
    candidateCount = 1
  ) => {
    const batch = await prisma.batch.create({
      data: {
        batchNumber: `CRITICAL-${suffix}-${crypto.randomUUID()}`,
        courseName: `Critical Scenario ${suffix}`,
        districtId: district.id,
        trainingCentreId: trainingCentre.id,
        createdById: trainingCentreUser.id,
        status,
        candidateCount,
        candidates: {
          create: Array.from({ length: candidateCount }, (_, index) => ({
            fullName: `Critical Candidate ${suffix} ${index + 1}`,
            phone: `+9198765${String(Date.now() + index).slice(-5)}`,
            nationalId: `CRITICAL-${suffix}-${crypto.randomUUID()}`,
            grade: 'A',
          })),
        },
      },
      include: { candidates: true },
    });
    batchIds.push(batch.id);
    return batch;
  };

  try {
    const concurrentBatch = await createTestBatch('CONCURRENCY');
    const submitted = await approvalWorkflowService.submitBatch(
      concurrentBatch.id,
      trainingCentreUser
    );
    const decisions = await Promise.allSettled([
      approvalWorkflowService.reviewBatch(
        concurrentBatch.id,
        { action: 'APPROVED', remarks: 'Concurrent district decision', expectedVersion: submitted.version },
        dev
      ),
      approvalWorkflowService.reviewBatch(
        concurrentBatch.id,
        { action: 'APPROVED', remarks: 'Concurrent district decision', expectedVersion: submitted.version },
        meera
      ),
    ]);

    const accepted = decisions.filter((decision) => decision.status === 'fulfilled').length;
    const concurrencyRejected = decisions.find(
      (decision) => decision.status === 'rejected'
    );
    const concurrentState = await prisma.batch.findUniqueOrThrow({
      where: { id: concurrentBatch.id },
    });
    const concurrentApprovalCount = await prisma.batchApproval.count({
      where: { batchId: concurrentBatch.id, reviewRound: concurrentState.reviewRound },
    });
    if (
      accepted !== 1 ||
      !concurrencyRejected ||
      !String(concurrencyRejected.reason).includes('CONCURRENCY_CONFLICT') ||
      concurrentApprovalCount !== 1 ||
      concurrentState.districtApprovalCount !== 1 ||
      concurrentState.status !== BatchStatus.UNDER_DISTRICT_REVIEW
    ) {
      throw new Error('Concurrent approvals were not protected by the same-version concurrency guard.');
    }

    const remainingOfficer = decisions[0].status === 'fulfilled' ? meera : dev;
    const advanced = await approvalWorkflowService.reviewBatch(
      concurrentBatch.id,
      { action: 'APPROVED', remarks: 'Fresh second district decision', expectedVersion: concurrentState.version },
      remainingOfficer
    );
    if (
      advanced.status !== BatchStatus.UNDER_STATE_REVIEW ||
      advanced.districtApprovalCount !== 2
    ) {
      throw new Error('A refreshed second district approval did not advance the workflow exactly once.');
    }
    console.log('PASS: concurrent district decisions; stale approval cannot advance quorum twice.');

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server?.once('listening', resolve);
      server?.once('error', reject);
    });
    serverPort = (server.address() as AddressInfo).port;
    const unauthenticatedStatus = await requestStatus(
      serverPort,
      `/api/batches/${concurrentBatch.id}/review`,
      { action: 'APPROVED', remarks: 'Should be rejected' }
    );
    const wrongRoleStatus = await requestStatus(
      serverPort,
      `/api/batches/${concurrentBatch.id}/review`,
      { action: 'APPROVED', remarks: 'Should be rejected' },
      trainingCentreUser.email
    );
    if (unauthenticatedStatus !== 401 || wrongRoleStatus !== 403) {
      throw new Error(
        `Expected unauthenticated/wrong-role review attempts to return 401/403; got ${unauthenticatedStatus}/${wrongRoleStatus}.`
      );
    }
    console.log('PASS: unauthenticated and wrong-role users cannot review batches.');

    const returnedBatch = await createTestBatch('RESUBMISSION');
    await approvalWorkflowService.submitBatch(returnedBatch.id, trainingCentreUser);
    await approvalWorkflowService.reviewBatch(
      returnedBatch.id,
      { action: 'APPROVED', remarks: 'Initial district approval' },
      dev
    );
    await approvalWorkflowService.reviewBatch(
      returnedBatch.id,
      { action: 'RETURNED', remarks: 'Correct the candidate assessment record' },
      meera
    );

    await batchUploadService.commitBatchUpload(
      returnedBatch.id,
      [{
        fullName: 'Corrected Candidate Name',
        phone: '+919876500111',
        nationalId: `CORRECTED-${crypto.randomUUID()}`,
        grade: 'A+',
      }],
      trainingCentreUser.id
    );
    const resubmitted = await prisma.batch.findUniqueOrThrow({
      where: { id: returnedBatch.id },
    });
    const sameOfficerAgain = await approvalWorkflowService.reviewBatch(
      returnedBatch.id,
      { action: 'APPROVED', remarks: 'Re-reviewed corrected roster' },
      dev
    );
    const roundApprovals = await prisma.batchApproval.findMany({
      where: { batchId: returnedBatch.id },
      orderBy: [{ reviewRound: 'asc' }, { createdAt: 'asc' }],
    });
    const resubmissionAudit = await prisma.auditLog.findFirst({
      where: { entityId: returnedBatch.id, action: 'BATCH_RESUBMITTED' },
    });
    if (
      resubmitted.status !== BatchStatus.UNDER_DISTRICT_REVIEW ||
      resubmitted.reviewRound !== 2 ||
      sameOfficerAgain.districtApprovalCount !== 1 ||
      roundApprovals.length !== 3 ||
      roundApprovals.filter((approval) => approval.reviewRound === 1).length !== 2 ||
      roundApprovals.filter((approval) => approval.reviewRound === 2).length !== 1 ||
      !resubmissionAudit ||
      resubmissionAudit.userId !== trainingCentreUser.id
    ) {
      throw new Error('Returned batch correction/resubmission did not preserve history and open a new review round.');
    }
    console.log('PASS: returned batch corrections resubmit in round 2; round 1 approvals remain in history.');

    const certificateBatch = await createTestBatch('CERTIFICATE', BatchStatus.COMPLETED, 5);
    const certificateService = new CertificateService(async () => undefined, async () => undefined);
    const [firstIssuance, retriedIssuance] = await Promise.all([
      certificateService.issueCertificatesForBatch(certificateBatch.id, stateOffice.id),
      certificateService.issueCertificatesForBatch(certificateBatch.id, stateOffice.id),
    ]);
    const issued = await prisma.certificate.findMany({
      where: { batchId: certificateBatch.id },
      orderBy: { issuedAt: 'asc' },
    });
    certificateNumbers.push(...issued.map((certificate) => certificate.certificateNumber));
    const candidateCertificateCounts = await Promise.all(
      certificateBatch.candidates.map((candidate) =>
        prisma.certificate.count({ where: { candidateId: candidate.id } })
      )
    );
    if (
      firstIssuance.length !== 5 ||
      retriedIssuance.length !== 5 ||
      issued.length !== 5 ||
      candidateCertificateCounts.some((count) => count !== 1)
    ) {
      throw new Error('Repeated issuance created a duplicate certificate for a candidate.');
    }

    let duplicateNumberRejected = false;
    try {
      await prisma.certificate.create({
        data: {
          certificateNumber: issued[0].certificateNumber,
          candidateId: certificateBatch.candidates[4].id,
          batchId: certificateBatch.id,
          pdfUrl: '/duplicate.pdf',
          qrCodeUrl: '/verify/duplicate',
          verificationHash: crypto.randomBytes(32).toString('hex'),
        },
      });
    } catch (error) {
      duplicateNumberRejected =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002';
    }
    const duplicateNumberCount = await prisma.certificate.count({
      where: { certificateNumber: issued[0].certificateNumber },
    });
    if (!duplicateNumberRejected || duplicateNumberCount !== 1) {
      throw new Error('The database allowed a duplicate certificate number.');
    }
    console.log('PASS: certificate issuance is idempotent and certificate numbers are unique.');

    const unauthorizedRevokeStatus = await requestStatus(
      serverPort,
      `/api/certificates/${encodeURIComponent(issued[0].certificateNumber)}/revoke`,
      { reason: 'Must be rejected for training-centre role' },
      trainingCentreUser.email
    );
    const unchangedCertificate = await prisma.certificate.findUniqueOrThrow({
      where: { certificateNumber: issued[0].certificateNumber },
    });
    if (unauthorizedRevokeStatus !== 403 || unchangedCertificate.status !== 'ACTIVE') {
      throw new Error('A non-State user was able to revoke a certificate.');
    }

    await certificateService.revokeCertificate(
      issued[0].certificateNumber,
      'Critical scenario cancellation',
      stateOffice.id
    );
    const cancelledVerification = await certificateService.verifyCertificate(
      issued[0].certificateNumber
    );
    if (cancelledVerification?.status !== 'CANCELLED') {
      throw new Error('A cancelled certificate was still reported as valid.');
    }
    console.log('PASS: unauthorized revocation is blocked and cancelled certificates verify as cancelled.');

    const certificateAudit = await prisma.auditLog.findFirst({
      where: { entityId: certificateBatch.id, action: 'CERTIFICATES_ISSUED' },
    });
    const cancellationAudit = await prisma.auditLog.findFirst({
      where: {
        entityId: issued[0].certificateNumber,
        action: 'CERTIFICATE_REVOKED',
      },
    });
    if (
      !certificateAudit ||
      certificateAudit.userId !== stateOffice.id ||
      !cancellationAudit ||
      cancellationAudit.userId !== stateOffice.id
    ) {
      throw new Error('Certificate issuance was not recorded in the audit history.');
    }
    console.log('PASS: issuance and cancellation audit events record the State Office actor.');
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve()))
      );
    }

    if (batchIds.length) {
      const certificates = await prisma.certificate.findMany({
        where: { batchId: { in: batchIds } },
        select: { certificateNumber: true },
      });
      await prisma.whatsAppDeliveryLog.deleteMany({
        where: { certificate: { batchId: { in: batchIds } } },
      });
      await prisma.certificate.deleteMany({ where: { batchId: { in: batchIds } } });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityId: { in: batchIds } },
            { entityId: { in: certificates.map((certificate) => certificate.certificateNumber) } },
          ],
        },
      });
      await prisma.batchApproval.deleteMany({ where: { batchId: { in: batchIds } } });
      await prisma.candidate.deleteMany({ where: { batchId: { in: batchIds } } });
      for (const certificate of certificates) {
        const pdfPath = certificatePdfService.getFilePath(certificate.certificateNumber);
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      }
      await prisma.batch.deleteMany({ where: { id: { in: batchIds } } });
    }
    await prisma.$disconnect();
  }
}

runCriticalScenarioTests().catch((error) => {
  console.error('Critical scenario test failed:', error);
  process.exitCode = 1;
});
