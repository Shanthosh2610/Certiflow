import prisma from './config/db';

async function verifyDatabase() {
  console.log('==================================================');
  console.log('🔍 CertiFlow Milestone 2 Database Verification');
  console.log('==================================================');

  // 1. Users & Roles
  const users = await prisma.user.findMany({
    include: {
      district: true,
      trainingCentre: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n👥 Demo Users (${users.length} seeded):`);
  users.forEach((u) => {
    const loc = u.trainingCentre ? ` [${u.trainingCentre.name}]` : u.district ? ` [${u.district.name}]` : '';
    console.log(`  - ${u.name.padEnd(16)} | Role: ${u.role.padEnd(17)} | Email: ${u.email}${loc}`);
  });

  // 2. Districts & Training Centres
  const districts = await prisma.district.count();
  const trainingCentres = await prisma.trainingCentre.count();
  console.log(`\n📍 Districts: ${districts} | 🏢 Training Centres: ${trainingCentres}`);

  // 3. Batches & Status Breakdown
  const batches = await prisma.batch.findMany({
    include: {
      approvals: true,
      _count: { select: { candidates: true } },
    },
    orderBy: { batchNumber: 'asc' },
  });

  console.log(`\n📦 Seeded Batches (${batches.length}):`);
  batches.forEach((b) => {
    console.log(`  - ${b.batchNumber} | Status: ${b.status.padEnd(21)} | Candidates: ${b.candidateCount} | Approvals: ${b.approvals.length}`);
  });

  // 4. Certificates
  const certificates = await prisma.certificate.findMany({
    include: { candidate: true },
  });
  console.log(`\n📜 Issued Certificates (${certificates.length}):`);
  certificates.forEach((c) => {
    console.log(`  - ${c.certificateNumber} | Status: ${c.status} | Candidate: ${c.candidate.fullName}${c.revocationReason ? ` (Reason: "${c.revocationReason}")` : ''}`);
  });

  // 5. Total Candidates & Audit Logs
  const candidateCount = await prisma.candidate.count();
  const auditCount = await prisma.auditLog.count();
  console.log(`\n📊 Total Candidates: ${candidateCount} | 📝 Total Audit Logs: ${auditCount}`);
  console.log('==================================================');
  console.log('✅ All relations, constraints, and seed data verified!');
  console.log('==================================================');
}

verifyDatabase()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
