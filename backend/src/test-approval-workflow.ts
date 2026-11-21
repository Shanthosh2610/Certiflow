import fs from 'fs';
import prisma from './config/db';
import { approvalWorkflowService } from './services/approval.service';
import { certificatePdfService } from './services/certificatePdf.service';
import {
  closeCertificateDeliveryQueue,
  removeCertificateDeliveryJob,
} from './queues/certificateDelivery.queue';
import { redisConnection } from './config/redis';
import { Role, BatchStatus } from '@prisma/client';

async function runApprovalWorkflowTests() {
  console.log('================================================================');
  console.log('🧪 Running Milestone 5: Approval Workflow & Concurrency Tests');
  console.log('================================================================\n');

  // Load demo users
  const anika = await prisma.user.findFirst({ where: { email: 'anika@training.certiflow.gov.in' } });
  const dev = await prisma.user.findFirst({ where: { email: 'dev@district.certiflow.gov.in' } });
  const meera = await prisma.user.findFirst({ where: { email: 'meera@district.certiflow.gov.in' } });
  const kabir = await prisma.user.findFirst({ where: { email: 'kabir@district.certiflow.gov.in' } });
  const neha = await prisma.user.findFirst({ where: { email: 'neha@quality.certiflow.gov.in' } });
  const farah = await prisma.user.findFirst({ where: { email: 'farah@state.certiflow.gov.in' } });
  const bhopal = await prisma.district.findFirst({ where: { name: 'Bhopal' } });
  const tc = await prisma.trainingCentre.findFirst();

  if (!anika || !dev || !meera || !kabir || !neha || !farah || !bhopal || !tc) {
    throw new Error('Database not seeded. Run npm run prisma:seed first.');
  }

  // Helper to create clean test batch
  const createTestBatch = async (candidateCount = 55) => {
    const batch = await prisma.batch.create({
      data: {
        batchNumber: `WORKFLOW-TEST-${Date.now().toString().slice(-5)}`,
        courseName: 'Advanced Industrial Automation & Robotics',
        districtId: bhopal.id,
        trainingCentreId: tc.id,
        createdById: anika.id,
        status: BatchStatus.DRAFT,
        candidateCount,
        isLargeBatch: candidateCount >= 50,
        version: 1,
        candidates: {
          create: Array.from({ length: candidateCount }, (_, i) => ({
            fullName: `Robotics Student ${i + 1}`,
            phone: `+9198765${String(60000 + i).slice(-5)}`,
            email: `student.robotics.${i + 1}@certiflow.test`,
            nationalId: `AADHAAR-ROBO-${Date.now()}-${i}`,
            grade: 'A',
            status: 'PENDING',
          })),
        },
      },
      include: { candidates: true },
    });
    return batch;
  };

  const testBatch = await createTestBatch(55); // 55 candidates -> triggers Quality Gate
  console.log(`Initialized Test Batch: ${testBatch.batchNumber} (55 candidates, Large Batch: true)\n`);

  // -------------------------------------------------------------------------
  // TEST 1: ROLE PERMISSION ENFORCEMENT ON BACKEND
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 1: Backend Role Permission Enforcement');
  console.log('----------------------------------------------------------------');

  // Sub-test 1A: Dev (District Officer) tries to submit draft batch (Only Training Centre can submit)
  let devSubmitBlocked = false;
  try {
    await approvalWorkflowService.submitBatch(testBatch.id, dev);
  } catch (err: any) {
    devSubmitBlocked = true;
    console.log(`  🛡️ Blocked District Officer from submitting draft: "${err.message}"`);
  }
  if (!devSubmitBlocked) throw new Error('FAIL: District officer was able to submit draft batch!');

  // Now submit legitimately as Anika (Training Centre)
  const submitted = await approvalWorkflowService.submitBatch(testBatch.id, anika);
  console.log(`  ✅ Anika legitimately submitted batch. Status is now: ${submitted.status}`);

  // Sub-test 1B: Anika (Training Centre) tries to approve in District Stage
  let anikaApproveBlocked = false;
  try {
    await approvalWorkflowService.reviewBatch(
      testBatch.id,
      { action: 'APPROVED', remarks: 'Self-approving my own batch' },
      anika
    );
  } catch (err: any) {
    anikaApproveBlocked = true;
    console.log(`  🛡️ Blocked Training Centre from approving in District stage: "${err.message}"`);
  }
  if (!anikaApproveBlocked) throw new Error('FAIL: Training Centre was able to self-approve batch!');

  // Sub-test 1C: Kabir (Indore District Officer) tries to approve Bhopal batch
  let kabirDistrictMismatchBlocked = false;
  try {
    await approvalWorkflowService.reviewBatch(
      testBatch.id,
      { action: 'APPROVED', remarks: 'Indore officer approving Bhopal' },
      kabir
    );
  } catch (err: any) {
    kabirDistrictMismatchBlocked = true;
    console.log(`  🛡️ Blocked Officer from wrong district: "${err.message}"`);
  }
  if (!kabirDistrictMismatchBlocked) throw new Error('FAIL: Officer approved batch outside jurisdiction!');

  console.log('✅ TEST 1 PASSED: Strict backend role & jurisdiction permissions enforced!\n');

  // -------------------------------------------------------------------------
  // TEST 2: MANDATORY REASONS FOR RETURN AND REJECT
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 2: Mandatory Reasons for Return & Reject');
  console.log('----------------------------------------------------------------');

  let emptyReturnBlocked = false;
  try {
    await approvalWorkflowService.reviewBatch(
      testBatch.id,
      { action: 'RETURNED', remarks: '   ' }, // Blank remarks
      dev
    );
  } catch (err: any) {
    emptyReturnBlocked = true;
    console.log(`  🛡️ Blocked return with blank remarks: "${err.message}"`);
  }
  if (!emptyReturnBlocked) throw new Error('FAIL: Allowed return without mandatory reason!');

  console.log('✅ TEST 2 PASSED: Returns & rejections strictly mandate justifying remarks!\n');

  // -------------------------------------------------------------------------
  // TEST 3: DUPLICATE APPROVAL PREVENTION (SAME OFFICER CANNOT VOTE TWICE)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 3: Duplicate Approval Prevention in Same Stage');
  console.log('----------------------------------------------------------------');

  // Dev grants 1st district approval
  const afterDev = await approvalWorkflowService.reviewBatch(
    testBatch.id,
    { action: 'APPROVED', remarks: 'Lab logs checked by Dev' },
    dev
  );
  console.log(`  ✅ Dev approved (1/2). Batch status: ${afterDev.status}, District approvals: ${afterDev.districtApprovalCount}`);

  // Dev attempts to approve the SAME batch AGAIN
  let devDuplicateBlocked = false;
  try {
    await approvalWorkflowService.reviewBatch(
      testBatch.id,
      { action: 'APPROVED', remarks: 'Dev approving again' },
      dev
    );
  } catch (err: any) {
    devDuplicateBlocked = true;
    console.log(`  🛡️ Blocked Dev from double voting: "${err.message}"`);
  }
  if (!devDuplicateBlocked) throw new Error('FAIL: Allowed same officer to submit duplicate vote!');

  console.log('✅ TEST 3 PASSED: Duplicate votes by same officer are rejected!\n');

  // -------------------------------------------------------------------------
  // TEST 4: CONCURRENCY CONTROL (SIMULTANEOUS APPROVAL RACE CONDITION)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 4: Optimistic Concurrency Control Lock');
  console.log('----------------------------------------------------------------');

  // Fetch current batch version
  const currentBatch = await prisma.batch.findUnique({ where: { id: testBatch.id } });
  const staleVersion = (currentBatch?.version || 1) - 1; // Stale version simulating lagging browser tab

  let staleApprovalBlocked = false;
  try {
    await approvalWorkflowService.reviewBatch(
      testBatch.id,
      { action: 'APPROVED', remarks: 'Lagging approval', expectedVersion: staleVersion },
      meera
    );
  } catch (err: any) {
    staleApprovalBlocked = true;
    console.log(`  🛡️ Concurrency lock rejected stale version: "${err.message}"`);
  }
  if (!staleApprovalBlocked) throw new Error('FAIL: Stale version was accepted by state machine!');

  console.log('✅ TEST 4 PASSED: Optimistic concurrency lock protects against simultaneous overwrites!\n');

  // -------------------------------------------------------------------------
  // TEST 5: FULL MULTI-TIER PIPELINE WALKTHROUGH
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 5: Full Multi-Tier Pipeline & Quality Gate (55 candidates)');
  console.log('Flow: District 2nd Approval -> Quality Gate (>50) -> State Final -> Certificates Issued');
  console.log('----------------------------------------------------------------');

  // 1. Meera (2nd District Officer) approves -> District Quorum (2/2) met!
  // Since batch has 55 candidates, it must route to UNDER_QUALITY_REVIEW
  const afterMeera = await approvalWorkflowService.reviewBatch(
    testBatch.id,
    { action: 'APPROVED', remarks: 'Biometrics verified by Meera' },
    meera
  );
  console.log(`  ✅ Meera approved (2/2). Quorum achieved!`);
  console.log(`     Next status: ${afterMeera.status} (Correctly routed to Quality Gate because 55 >= 50)`);

  if (afterMeera.status !== BatchStatus.UNDER_QUALITY_REVIEW) {
    throw new Error(`FAIL: Expected UNDER_QUALITY_REVIEW, got ${afterMeera.status}`);
  }

  // 2. Neha (Quality Team) conducts scrutiny and approves
  const afterNeha = await approvalWorkflowService.reviewBatch(
    testBatch.id,
    { action: 'APPROVED', remarks: 'Quality sampling passed. Biometrics matched.' },
    neha
  );
  console.log(`  ✅ Neha (Quality Team) passed quality gate.`);
  console.log(`     Next status: ${afterNeha.status} (Advanced to State Office Final Review)`);

  if (afterNeha.status !== BatchStatus.UNDER_STATE_REVIEW) {
    throw new Error(`FAIL: Expected UNDER_STATE_REVIEW, got ${afterNeha.status}`);
  }

  // 3. Farah (State Office) grants Final Sign-off
  const finalBatch = await approvalWorkflowService.reviewBatch(
    testBatch.id,
    { action: 'APPROVED', remarks: 'State final sign-off authorized. Generate credentials.' },
    farah
  );
  console.log(`  ✅ Farah (State Office) granted final authorization.`);
  console.log(`     Final status: ${finalBatch.status} (COMPLETED)`);

  if (finalBatch.status !== BatchStatus.COMPLETED) {
    throw new Error(`FAIL: Expected COMPLETED, got ${finalBatch.status}`);
  }

  // 4. Verify Certificates Generated & Candidates Certified
  const issuedCertificates = await prisma.certificate.findMany({
    where: { batchId: testBatch.id },
  });
  const certsCount = issuedCertificates.length;
  const certifiedCandidates = await prisma.candidate.count({
    where: { batchId: testBatch.id, status: 'CERTIFIED' },
  });

  console.log(`\n  📜 Verification of Automatic Issuance on Final Sign-off:`);
  console.log(`     - Certificates Created: ${certsCount} (Expected: 55)`);
  console.log(`     - Candidates Marked CERTIFIED: ${certifiedCandidates} (Expected: 55)`);

  if (certsCount !== 55 || certifiedCandidates !== 55) {
    throw new Error('FAIL: Certificate generation count mismatch!');
  }

  for (const certificate of issuedCertificates) {
    const pdfPath = certificatePdfService.getFilePath(certificate.certificateNumber);
    if (!fs.existsSync(pdfPath) || fs.readFileSync(pdfPath).subarray(0, 5).toString('utf-8') !== '%PDF-') {
      throw new Error(`FAIL: Final approval did not generate a valid PDF for ${certificate.certificateNumber}.`);
    }
  }

  // Clean up test batch
  const deliveryLogs = await prisma.whatsAppDeliveryLog.findMany({
    where: { certificate: { batchId: testBatch.id } },
    select: { id: true },
  });
  for (const delivery of deliveryLogs) {
    await removeCertificateDeliveryJob(delivery.id);
  }
  await prisma.whatsAppDeliveryLog.deleteMany({ where: { certificate: { batchId: testBatch.id } } });
  await prisma.certificate.deleteMany({ where: { batchId: testBatch.id } });
  await prisma.batchApproval.deleteMany({ where: { batchId: testBatch.id } });
  await prisma.candidate.deleteMany({ where: { batchId: testBatch.id } });
  await prisma.auditLog.deleteMany({ where: { entityId: testBatch.id } });
  for (const certificate of issuedCertificates) {
    const pdfPath = certificatePdfService.getFilePath(certificate.certificateNumber);
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  }
  await prisma.batch.delete({ where: { id: testBatch.id } });

  console.log('\n================================================================');
  console.log('🎉 ALL MILESTONE 5 APPROVAL WORKFLOW & CONCURRENCY TESTS PASSED!');
  console.log('================================================================');
}

runApprovalWorkflowTests()
  .catch((e) => {
    console.error('❌ Test failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeCertificateDeliveryQueue();
    redisConnection.disconnect();
  });
