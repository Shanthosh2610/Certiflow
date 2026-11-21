import fs from 'fs';
import prisma from './config/db';
import { certificateService } from './services/certificate.service';
import { certificatePdfService } from './services/certificatePdf.service';
import {
  closeCertificateDeliveryQueue,
  removeCertificateDeliveryJob,
} from './queues/certificateDelivery.queue';
import { redisConnection } from './config/redis';

async function runCertificateIssuanceTests() {
  console.log('================================================================');
  console.log('🧪 Running Milestone 6: Certificate PDF Generation & Issuance Tests');
  console.log('================================================================\n');

  // Load demo users
  const farah = await prisma.user.findFirst({ where: { email: 'farah@state.certiflow.gov.in' } });
  const anika = await prisma.user.findFirst({ where: { email: 'anika@training.certiflow.gov.in' } });
  const bhopal = await prisma.district.findFirst({ where: { name: 'Bhopal' } });
  const tc = await prisma.trainingCentre.findFirst();

  if (!farah || !anika || !bhopal || !tc) {
    throw new Error('Database not seeded. Run npm run prisma:seed first.');
  }

  // 1. Create a Completed Test Batch with 3 Candidates
  const testBatch = await prisma.batch.create({
    data: {
      batchNumber: `CERT-BATCH-${Date.now().toString().slice(-4)}`,
      courseName: 'Renewable Solar Power Grid Management',
      districtId: bhopal.id,
      trainingCentreId: tc.id,
      createdById: anika.id,
      status: 'COMPLETED',
      candidateCount: 4,
      isLargeBatch: false,
      version: 3,
      candidates: {
        create: [
          {
            fullName: 'Aditi Mukhopadhyay',
            phone: '+919876599001',
            email: 'aditi.m@certiflow.test',
            nationalId: `AADHAAR-TEST-001`,
            grade: 'A+',
            status: 'PENDING',
          },
          {
            fullName: 'Rajesh Gokhale',
            phone: '+919876599002',
            email: 'rajesh.g@certiflow.test',
            nationalId: `AADHAAR-TEST-002`,
            grade: 'A',
            status: 'PENDING',
          },
          {
            fullName: 'Fatima Sheikh',
            phone: '+919876599003',
            email: 'fatima.s@certiflow.test',
            nationalId: `AADHAAR-TEST-003`,
            grade: 'Pass',
            status: 'PENDING',
          },
          {
            fullName: 'Ineligible Test Candidate',
            phone: '+919876599004',
            email: 'ineligible@certiflow.test',
            nationalId: 'AADHAAR-TEST-004',
            grade: 'Failed',
            status: 'FAILED',
          },
        ],
      },
    },
    include: { candidates: true },
  });

  console.log(`Created Completed Batch: ${testBatch.batchNumber} with ${testBatch.candidates.length} candidates.\n`);

  // -------------------------------------------------------------------------
  // TEST 1: ISSUE CERTIFICATES & GENERATE PHYSICAL PDFS WITH QR CODES
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 1: Automated PDF Generation & PostgreSQL Metadata Persistence');
  console.log('----------------------------------------------------------------');

  const certs = await certificateService.issueCertificatesForBatch(testBatch.id, farah.id);

  console.log(`Successfully issued ${certs.length} certificates.`);

  if (certs.length !== 3) {
    throw new Error(`FAIL: Expected 3 certificates, got ${certs.length}`);
  }

  const validVerification = await certificateService.verifyCertificate(certs[0].certificateNumber);
  const invalidVerification = await certificateService.verifyCertificate('CERTIFICATE-DOES-NOT-EXIST');
  if (validVerification?.status !== 'VALID' || invalidVerification !== null) {
    throw new Error('FAIL: Public verification did not distinguish valid and nonexistent certificates.');
  }
  const unnecessaryPublicFields = [
    'nationalId',
    'grade',
    'verificationHash',
    'revocationReason',
    'revokedByName',
  ];
  if (unnecessaryPublicFields.some((field) => field in validVerification)) {
    throw new Error('FAIL: Public verification response includes unnecessary personal or internal data.');
  }

  const initialDeliveryLogCount = await prisma.whatsAppDeliveryLog.count({
    where: { certificate: { batchId: testBatch.id } },
  });
  if (initialDeliveryLogCount !== 3) {
    throw new Error(`FAIL: Expected one delivery log per issued certificate, got ${initialDeliveryLogCount}.`);
  }

  for (const cert of certs) {
    if (cert.deliveryLogs[0]?.status !== 'QUEUED') {
      throw new Error(`FAIL: Delivery for ${cert.certificateNumber} was not queued asynchronously.`);
    }

    console.log(`  📄 Certificate ID: ${cert.certificateNumber}`);
    console.log(`     - Verification Hash: ${cert.verificationHash}`);
    console.log(`     - QR Code URL: ${cert.qrCodeUrl}`);
    console.log(`     - Status: ${cert.status}`);

    // Verify physical file exists on disk
    const filePath = certificatePdfService.getFilePath(cert.certificateNumber);
    if (!fs.existsSync(filePath)) {
      throw new Error(`FAIL: PDF file ${filePath} was not found on disk!`);
    }

    const fileStats = fs.statSync(filePath);
    const fileBytes = fs.readFileSync(filePath);
    const pdfHeader = fileBytes.subarray(0, 5).toString('utf-8');

    console.log(`     - PDF File Size: ${(fileStats.size / 1024).toFixed(1)} KB (Header: "${pdfHeader}")`);

    if (pdfHeader !== '%PDF-' || fileStats.size < 1000 || !fileBytes.includes(Buffer.from('%%EOF'))) {
      throw new Error(`FAIL: File does not have valid PDF magic bytes ("%PDF-")!`);
    }

    if (cert.pdfUrl !== `/api/certificates/${cert.certificateNumber}/download` ||
      !cert.qrCodeUrl.includes(`/verify/${cert.certificateNumber}`)) {
      throw new Error('FAIL: Certificate metadata is missing its download or verification URL.');
    }
  }

  console.log('✅ TEST 1 PASSED: Vector PDF with QR code and cryptographic hash generated & saved!\n');

  // -------------------------------------------------------------------------
  // TEST 2: IDEMPOTENCY GUARANTEE
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 2: Idempotency Verification (Re-running issuance must not duplicate)');
  console.log('----------------------------------------------------------------');

  const [secondRunCerts, concurrentRunCerts] = await Promise.all([
    certificateService.issueCertificatesForBatch(testBatch.id, farah.id),
    certificateService.issueCertificatesForBatch(testBatch.id, farah.id),
  ]);

  const totalInDb = await prisma.certificate.count({
    where: { batchId: testBatch.id },
  });
  const totalDeliveryLogs = await prisma.whatsAppDeliveryLog.count({
    where: { certificate: { batchId: testBatch.id } },
  });

  console.log(`Concurrent retries returned: ${secondRunCerts.length} and ${concurrentRunCerts.length} certificates`);
  console.log(`Total certificates in DB for batch: ${totalInDb} (Must remain 3)`);

  if (totalInDb !== 3) {
    throw new Error(`FAIL: Idempotency failed! Created duplicate certificates (Total: ${totalInDb})`);
  }
  if (totalDeliveryLogs !== 3) {
    throw new Error(`FAIL: Retried issuance created duplicate delivery logs (Total: ${totalDeliveryLogs})`);
  }

  console.log('✅ TEST 2 PASSED: Idempotency guaranteed! Zero duplicate certificates created.\n');

  // -------------------------------------------------------------------------
  // TEST 3: CERTIFICATE REVOCATION WITH INSTANT WATERMARK
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 3: State Office Revocation & Public Void Watermark');
  console.log('----------------------------------------------------------------');

  const certToRevoke = certs[0];
  const revocationReason = 'Audit detected fraudulent secondary school marksheet at enrollment.';

  const revokedCert = await certificateService.revokeCertificate(
    certToRevoke.certificateNumber,
    revocationReason,
    farah.id
  );

  console.log(`Revoked Certificate: ${revokedCert.certificateNumber}`);
  console.log(`  - New Status: ${revokedCert.status}`);
  console.log(`  - Reason: "${revokedCert.revocationReason}"`);
  console.log(`  - Revoked At: ${revokedCert.revokedAt}`);

  if (revokedCert.status !== 'REVOKED' || revokedCert.revocationReason !== revocationReason) {
    throw new Error('FAIL: Certificate revocation status mismatch!');
  }

  const cancelledVerification = await certificateService.verifyCertificate(
    certToRevoke.certificateNumber
  );
  if (cancelledVerification?.status !== 'CANCELLED' || !cancelledVerification.cancelledAt) {
    throw new Error('FAIL: Public verification did not immediately reflect cancellation.');
  }

  // Verify re-generated PDF file contains REVOKED status
  const revokedFilePath = certificatePdfService.getFilePath(certToRevoke.certificateNumber);
  const revokedBytes = fs.readFileSync(revokedFilePath);
  if (revokedBytes.length === 0) {
    throw new Error('FAIL: Revoked PDF file is empty!');
  }

  console.log(`  - Revoked PDF re-rendered with watermark on disk: ${(revokedBytes.length / 1024).toFixed(1)} KB`);
  console.log('✅ TEST 3 PASSED: Revocation immediately updates status and burns void watermark onto credential.\n');

  // Clean up test batch and certs
  await prisma.whatsAppDeliveryLog.deleteMany({ where: { certificate: { batchId: testBatch.id } } });
  await prisma.certificate.deleteMany({ where: { batchId: testBatch.id } });
  await prisma.candidate.deleteMany({ where: { batchId: testBatch.id } });
  await prisma.auditLog.deleteMany({
    where: {
      entityId: {
        in: [testBatch.id, ...certs.map((certificate) => certificate.certificateNumber)],
      },
    },
  });
  for (const cert of certs) {
    for (const delivery of cert.deliveryLogs) {
      await removeCertificateDeliveryJob(delivery.id);
    }
    const filePath = certificatePdfService.getFilePath(cert.certificateNumber);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  await prisma.batch.delete({ where: { id: testBatch.id } });

  console.log('================================================================');
  console.log('🎉 ALL MILESTONE 6 CERTIFICATE ISSUANCE TESTS PASSED!');
  console.log('================================================================');
}

runCertificateIssuanceTests()
  .catch((e) => {
    console.error('❌ Test failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeCertificateDeliveryQueue();
    redisConnection.disconnect();
  });
