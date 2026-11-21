import fs from 'fs';
import path from 'path';
import prisma from './config/db';
import { batchUploadService } from './services/batchUpload.service';

async function runUploadValidationTests() {
  console.log('================================================================');
  console.log('🧪 Running Milestone 4: Batch Upload & Candidate Validation Tests');
  console.log('================================================================\n');

  // Setup: Find Anika and Bhopal district to create a test draft batch
  const user = await prisma.user.findFirst({ where: { role: 'TRAINING_CENTRE' } });
  const district = await prisma.district.findFirst({ where: { name: 'Bhopal' } });
  const tc = await prisma.trainingCentre.findFirst();

  if (!user || !district || !tc) {
    throw new Error('Database not seeded. Please run npm run prisma:seed first.');
  }

  // Create a clean Draft Test Batch
  const testBatch = await prisma.batch.create({
    data: {
      batchNumber: `TEST-BATCH-${Date.now().toString().slice(-4)}`,
      courseName: 'Test Solar Installation & Energy Storage',
      districtId: district.id,
      trainingCentreId: tc.id,
      createdById: user.id,
      status: 'DRAFT',
      candidateCount: 0,
      version: 1,
    },
  });

  console.log(`Created Test Draft Batch: ${testBatch.batchNumber} (ID: ${testBatch.id})\n`);

  // -------------------------------------------------------------------------
  // TEST SCENARIO 1: FLALWED SPREADSHEET (Some valid rows, several invalid rows)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 1: Uploading Flawed Spreadsheet (candidates_with_errors.csv)');
  console.log('Expected: Strict rejection with row-specific errors & ZERO partial writes.');
  console.log('----------------------------------------------------------------');

  const flawedCsvPath = path.join(__dirname, '..', 'public', 'candidates_with_errors.csv');
  const flawedBuffer = fs.readFileSync(flawedCsvPath);

  // 1. Dry-run validation
  const validation1 = await batchUploadService.validateSpreadsheetBuffer(
    flawedBuffer,
    'candidates_with_errors.csv',
    testBatch.id
  );

  console.log(`Total Rows Parsed: ${validation1.totalRows}`);
  console.log(`Valid Rows: ${validation1.validRowsCount} | Error Rows: ${validation1.errorRowsCount}`);
  console.log(`Overall Is Valid: ${validation1.isValid}`);
  console.log('\nRow-Specific Errors Detected:');
  validation1.errors.forEach((err) => {
    console.log(`  ❌ Row ${err.row} [${err.field}]: ${err.message}`);
  });

  if (validation1.isValid) {
    throw new Error('FAIL: Flawed spreadsheet was marked valid!');
  }

  // 2. Attempt Commit (Must fail and rollback)
  console.log('\nAttempting commit to PostgreSQL...');
  let commitFailed = false;
  try {
    // Attempting to commit flawed rows
    const flawedCandidates = validation1.preview.map((p) => ({
      fullName: p.fullName,
      phone: p.phone,
      email: p.email,
      nationalId: p.nationalId,
      grade: p.grade,
      completionDate: p.completionDate,
    }));

    await batchUploadService.commitBatchUpload(testBatch.id, flawedCandidates, user.id);
  } catch (error: any) {
    commitFailed = true;
    console.log(`\n🛡️ Transaction Aborted As Expected: "${error.message}"`);
  }

  if (!commitFailed) {
    throw new Error('FAIL: Flawed batch commit succeeded when it should have failed!');
  }

  // 3. Verify Database State: ZERO candidates saved
  const candidatesInDb = await prisma.candidate.count({
    where: { batchId: testBatch.id },
  });

  const reloadedBatch = await prisma.batch.findUnique({
    where: { id: testBatch.id },
  });

  console.log(`\n🔍 Database State Check After Aborted Commit:`);
  console.log(`  - Candidate Count in DB: ${candidatesInDb} (Must be 0)`);
  console.log(`  - Batch Status: ${reloadedBatch?.status} (Must remain DRAFT)`);
  console.log(`  - Version: ${reloadedBatch?.version} (Must remain 1)`);

  if (candidatesInDb !== 0 || reloadedBatch?.status !== 'DRAFT') {
    throw new Error('FAIL: Partial data remained in database after failed validation!');
  }
  console.log('✅ TEST 1 PASSED: Zero partial writes guaranteed by ACID transaction!\n');

  // -------------------------------------------------------------------------
  // TEST SCENARIO 2: CLEAN SPREADSHEET (All 10 rows valid)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 2: Uploading Clean Spreadsheet (candidates_template.csv)');
  console.log('Expected: Successful validation, atomic commit, and status update.');
  console.log('----------------------------------------------------------------');

  const cleanCsvPath = path.join(__dirname, '..', 'public', 'candidates_template.csv');
  const cleanBuffer = fs.readFileSync(cleanCsvPath);

  const validation2 = await batchUploadService.validateSpreadsheetBuffer(
    cleanBuffer,
    'candidates_template.csv',
    testBatch.id
  );

  console.log(`Total Rows Parsed: ${validation2.totalRows}`);
  console.log(`Valid Rows: ${validation2.validRowsCount} | Error Rows: ${validation2.errorRowsCount}`);
  console.log(`Overall Is Valid: ${validation2.isValid}`);

  if (!validation2.isValid) {
    throw new Error(`FAIL: Clean spreadsheet had unexpected errors: ${JSON.stringify(validation2.errors)}`);
  }

  // Commit clean candidates to PostgreSQL
  const cleanCandidates = validation2.preview.map((p) => ({
    fullName: p.fullName,
    phone: p.phone,
    email: p.email,
    nationalId: p.nationalId,
    grade: p.grade,
    completionDate: p.completionDate,
  }));

  const committedBatch = await batchUploadService.commitBatchUpload(
    testBatch.id,
    cleanCandidates,
    user.id
  );

  console.log(`\n✅ Commit Succeeded:`);
  console.log(`  - Batch Number: ${committedBatch.batchNumber}`);
  console.log(`  - Candidates Inserted: ${committedBatch.candidates.length}`);
  console.log(`  - Status Advanced To: ${committedBatch.status}`);
  console.log(`  - New Version: ${committedBatch.version}`);

  // Clean up test batch
  await prisma.candidate.deleteMany({ where: { batchId: testBatch.id } });
  await prisma.auditLog.deleteMany({ where: { entityId: testBatch.id } });
  await prisma.batch.delete({ where: { id: testBatch.id } });

  console.log('\n================================================================');
  console.log('🎉 ALL MILESTONE 4 VALIDATION & TRANSACTION TESTS PASSED!');
  console.log('================================================================');
}

runUploadValidationTests()
  .catch((e) => {
    console.error('❌ Test failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
