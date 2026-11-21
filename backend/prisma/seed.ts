import { PrismaClient, Role, BatchStatus, ApprovalStage, ApprovalAction, CandidateStatus, CertificateStatus, DeliveryStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const existingUserCount = await prisma.user.count();
  if (existingUserCount > 0 && process.env.SEED_FORCE !== 'true') {
    console.log('⏭️ Demo seed skipped: users already exist. Set SEED_FORCE=true to reset and reseed.');
    return;
  }

  if (existingUserCount > 0) {
    console.warn('⚠️ SEED_FORCE=true: deleting existing CertiFlow application data.');
  }

  console.log('🌱 Starting CertiFlow Database Seeding...');

  // 1. Clean existing records in referential integrity order
  console.log('🧹 Cleaning existing data...');
  await prisma.whatsAppDeliveryLog.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.batchApproval.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.trainingCentre.deleteMany();
  await prisma.district.deleteMany();

  // Common password hash: "password123"
  const defaultPasswordHash = await bcrypt.hash('password123', 10);

  // 2. Seed Districts
  console.log('📍 Seeding Districts...');
  const bhopal = await prisma.district.create({
    data: {
      name: 'Bhopal',
      code: 'BPL',
      state: 'Madhya Pradesh',
    },
  });

  const indore = await prisma.district.create({
    data: {
      name: 'Indore',
      code: 'IND',
      state: 'Madhya Pradesh',
    },
  });

  const gwalior = await prisma.district.create({
    data: {
      name: 'Gwalior',
      code: 'GWL',
      state: 'Madhya Pradesh',
    },
  });

  // 3. Seed Training Centres
  console.log('🏢 Seeding Training Centres...');
  const apexCentre = await prisma.trainingCentre.create({
    data: {
      name: 'Apex Skilling Hub - Bhopal',
      code: 'TC-BPL-001',
      districtId: bhopal.id,
      address: 'Plot 42, MP Nagar Zone II, Bhopal, MP 462011',
      contactPerson: 'Anika Sharma',
      contactPhone: '+919876543210',
    },
  });

  const pioneerCentre = await prisma.trainingCentre.create({
    data: {
      name: 'Pioneer Vocational Institute - Indore',
      code: 'TC-IND-001',
      districtId: indore.id,
      address: 'Sector B, Industrial Area, Sanwer Road, Indore, MP 452015',
      contactPerson: 'Vikram Joshi',
      contactPhone: '+919876500001',
    },
  });

  // 4. Seed Demo Users
  console.log('👥 Seeding Demo Users...');
  // 1. Anika — Training Centre
  const anika = await prisma.user.create({
    data: {
      email: 'anika@training.certiflow.gov.in',
      name: 'Anika Sharma',
      role: Role.TRAINING_CENTRE,
      passwordHash: defaultPasswordHash,
      phone: '+919876543210',
      districtId: bhopal.id,
      trainingCentreId: apexCentre.id,
    },
  });

  // 2. Dev — District Officer (Bhopal)
  const dev = await prisma.user.create({
    data: {
      email: 'dev@district.certiflow.gov.in',
      name: 'Dev Verma',
      role: Role.DISTRICT_OFFICER,
      passwordHash: defaultPasswordHash,
      phone: '+919876543211',
      districtId: bhopal.id,
    },
  });

  // 3. Meera — District Officer (Bhopal)
  const meera = await prisma.user.create({
    data: {
      email: 'meera@district.certiflow.gov.in',
      name: 'Meera Patel',
      role: Role.DISTRICT_OFFICER,
      passwordHash: defaultPasswordHash,
      phone: '+919876543212',
      districtId: bhopal.id,
    },
  });

  // 4. Kabir — District Officer (Indore)
  const kabir = await prisma.user.create({
    data: {
      email: 'kabir@district.certiflow.gov.in',
      name: 'Kabir Khan',
      role: Role.DISTRICT_OFFICER,
      passwordHash: defaultPasswordHash,
      phone: '+919876543213',
      districtId: indore.id,
    },
  });

  // 5. Neha — Quality Team
  const neha = await prisma.user.create({
    data: {
      email: 'neha@quality.certiflow.gov.in',
      name: 'Neha Roy',
      role: Role.QUALITY_TEAM,
      passwordHash: defaultPasswordHash,
      phone: '+919876543214',
    },
  });

  // 6. Farah — State Office
  const farah = await prisma.user.create({
    data: {
      email: 'farah@state.certiflow.gov.in',
      name: 'Farah Siddiqui',
      role: Role.STATE_OFFICE,
      passwordHash: defaultPasswordHash,
      phone: '+919876543215',
    },
  });

  console.log('✅ Demo Users Seeded:');
  console.log('   - Anika (Training Centre): anika@training.certiflow.gov.in');
  console.log('   - Dev (District Officer): dev@district.certiflow.gov.in');
  console.log('   - Meera (District Officer): meera@district.certiflow.gov.in');
  console.log('   - Kabir (District Officer): kabir@district.certiflow.gov.in');
  console.log('   - Neha (Quality Team): neha@quality.certiflow.gov.in');
  console.log('   - Farah (State Office): farah@state.certiflow.gov.in');

  // Helper for generating deterministic candidate data
  const createCandidates = (count: number, prefix: string, startIdx = 1) => {
    const list = [];
    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      const aadhaarRaw = `9999${String(10000000 + idx).slice(0, 8)}`;
      const nationalIdHash = crypto.createHash('sha256').update(aadhaarRaw).digest('hex').substring(0, 16);
      list.push({
        fullName: `${prefix} Candidate ${idx}`,
        phone: `+9198765${String(10000 + idx).padStart(5, '0')}`,
        email: `candidate.${prefix.toLowerCase()}.${idx}@certiflow.test`,
        nationalId: `AADHAAR-${nationalIdHash}`,
        grade: ['A+', 'A', 'B', 'Pass'][i % 4],
        completionDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });
    }
    return list;
  };

  // 5. Seed Realistic Batches Representing Different Pipeline Stages

  // BATCH 1: Small Batch (15 candidates) - In District Review (Dev approved, awaiting Meera's approval)
  console.log('📦 Seeding Batch 1 (UNDER_DISTRICT_REVIEW - 1/2 Approvals)...');
  const batch1 = await prisma.batch.create({
    data: {
      batchNumber: 'BATCH-2026-001',
      courseName: 'Solar PV Technician & Rooftop Installer',
      trainingCentreId: apexCentre.id,
      districtId: bhopal.id,
      createdById: anika.id,
      candidateCount: 15,
      isLargeBatch: false,
      status: BatchStatus.UNDER_DISTRICT_REVIEW,
      districtApprovalCount: 1,
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      candidates: {
        create: createCandidates(15, 'Solar'),
      },
    },
  });

  // Approval record: Dev approved Batch 1
  await prisma.batchApproval.create({
    data: {
      batchId: batch1.id,
      officerId: dev.id,
      role: Role.DISTRICT_OFFICER,
      stage: ApprovalStage.DISTRICT,
      action: ApprovalAction.APPROVED,
      remarks: 'Lab assessment sheets and attendance records verified. 1st district approval granted.',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  });

  // BATCH 2: Large Batch (65 candidates) - UNDER_QUALITY_REVIEW (Requires Neha's scrutiny because > 50)
  console.log('📦 Seeding Batch 2 (UNDER_QUALITY_REVIEW - Bulk Batch > 50)...');
  const batch2 = await prisma.batch.create({
    data: {
      batchNumber: 'BATCH-2026-002',
      courseName: 'Healthcare General Duty Assistant (GDA)',
      trainingCentreId: apexCentre.id,
      districtId: bhopal.id,
      createdById: anika.id,
      candidateCount: 65,
      isLargeBatch: true,
      status: BatchStatus.UNDER_QUALITY_REVIEW,
      districtApprovalCount: 2,
      submittedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      candidates: {
        create: createCandidates(65, 'Healthcare'),
      },
    },
  });

  // Approvals for Batch 2: Both Dev & Meera approved, now with Neha
  await prisma.batchApproval.createMany({
    data: [
      {
        batchId: batch2.id,
        officerId: dev.id,
        role: Role.DISTRICT_OFFICER,
        stage: ApprovalStage.DISTRICT,
        action: ApprovalAction.APPROVED,
        remarks: 'Clinical practicals verified.',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        batchId: batch2.id,
        officerId: meera.id,
        role: Role.DISTRICT_OFFICER,
        stage: ApprovalStage.DISTRICT,
        action: ApprovalAction.APPROVED,
        remarks: 'Candidate roster cross-referenced with biometric logs. 2nd district approval granted.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  // BATCH 3: Small Batch (20 candidates) - UNDER_STATE_REVIEW (Awaiting Farah final sign-off)
  console.log('📦 Seeding Batch 3 (UNDER_STATE_REVIEW - Ready for State Sign-off)...');
  const batch3 = await prisma.batch.create({
    data: {
      batchNumber: 'BATCH-2026-003',
      courseName: 'CNC Milling & Precision Machining Operator',
      trainingCentreId: apexCentre.id,
      districtId: bhopal.id,
      createdById: anika.id,
      candidateCount: 20,
      isLargeBatch: false,
      status: BatchStatus.UNDER_STATE_REVIEW,
      districtApprovalCount: 2,
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      candidates: {
        create: createCandidates(20, 'CNC'),
      },
    },
  });

  await prisma.batchApproval.createMany({
    data: [
      {
        batchId: batch3.id,
        officerId: dev.id,
        role: Role.DISTRICT_OFFICER,
        stage: ApprovalStage.DISTRICT,
        action: ApprovalAction.APPROVED,
        remarks: 'Trade test scores verified.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        batchId: batch3.id,
        officerId: meera.id,
        role: Role.DISTRICT_OFFICER,
        stage: ApprovalStage.DISTRICT,
        action: ApprovalAction.APPROVED,
        remarks: 'Facility equipment standards met. Passed district stage.',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  // BATCH 4: COMPLETED with Active & Revoked Certificates + WhatsApp Delivery Logs
  console.log('📦 Seeding Batch 4 (COMPLETED - Certificates Issued & Revocation Demo)...');
  const batch4 = await prisma.batch.create({
    data: {
      batchNumber: 'BATCH-2026-004',
      courseName: 'Data Analytics & Office Automation',
      trainingCentreId: apexCentre.id,
      districtId: bhopal.id,
      createdById: anika.id,
      candidateCount: 5,
      isLargeBatch: false,
      status: BatchStatus.COMPLETED,
      districtApprovalCount: 2,
      submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      approvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      candidates: {
        create: createCandidates(5, 'DataOps').map((c) => ({
          ...c,
          status: CandidateStatus.CERTIFIED,
        })),
      },
    },
    include: {
      candidates: true,
    },
  });

  // Create approvals for Batch 4
  await prisma.batchApproval.createMany({
    data: [
      {
        batchId: batch4.id,
        officerId: dev.id,
        role: Role.DISTRICT_OFFICER,
        stage: ApprovalStage.DISTRICT,
        action: ApprovalAction.APPROVED,
        remarks: 'Initial district review approved.',
        createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      },
      {
        batchId: batch4.id,
        officerId: meera.id,
        role: Role.DISTRICT_OFFICER,
        stage: ApprovalStage.DISTRICT,
        action: ApprovalAction.APPROVED,
        remarks: 'Second district review approved.',
        createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      },
      {
        batchId: batch4.id,
        officerId: farah.id,
        role: Role.STATE_OFFICE,
        stage: ApprovalStage.STATE,
        action: ApprovalAction.APPROVED,
        remarks: 'Final state approval granted. Authorize certificate issuance.',
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  // Create Certificates for candidates in Batch 4
  const cands = batch4.candidates;

  // Certificate 1: ACTIVE (Authentic certificate)
  const cert1 = await prisma.certificate.create({
    data: {
      certificateNumber: 'CERT-2026-BPL-00401',
      candidateId: cands[0].id,
      batchId: batch4.id,
      pdfUrl: '/api/certificates/CERT-2026-BPL-00401/download',
      qrCodeUrl: '/api/public/verify/CERT-2026-BPL-00401',
      verificationHash: crypto.createHash('sha256').update(`CERT-2026-BPL-00401-${cands[0].fullName}`).digest('hex'),
      status: CertificateStatus.ACTIVE,
      issuedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.whatsAppDeliveryLog.create({
    data: {
      certificateId: cert1.id,
      candidateId: cands[0].id,
      phone: cands[0].phone,
      status: DeliveryStatus.DELIVERED,
      attempts: 1,
      deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  // Certificate 2: REVOKED (Demonstrating Instant Cancellation by Farah)
  const cert2 = await prisma.certificate.create({
    data: {
      certificateNumber: 'CERT-2026-BPL-00402',
      candidateId: cands[1].id,
      batchId: batch4.id,
      pdfUrl: '/api/certificates/CERT-2026-BPL-00402/download',
      qrCodeUrl: '/api/public/verify/CERT-2026-BPL-00402',
      verificationHash: crypto.createHash('sha256').update(`CERT-2026-BPL-00402-${cands[1].fullName}`).digest('hex'),
      status: CertificateStatus.REVOKED,
      revocationReason: 'State audit discovered duplicate identity document submitted during registration.',
      revokedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      revokedById: farah.id,
      issuedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.whatsAppDeliveryLog.create({
    data: {
      certificateId: cert2.id,
      candidateId: cands[1].id,
      phone: cands[1].phone,
      status: DeliveryStatus.DELIVERED,
      attempts: 1,
      deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  // Certificate 3: ACTIVE
  await prisma.certificate.create({
    data: {
      certificateNumber: 'CERT-2026-BPL-00403',
      candidateId: cands[2].id,
      batchId: batch4.id,
      pdfUrl: '/api/certificates/CERT-2026-BPL-00403/download',
      qrCodeUrl: '/api/public/verify/CERT-2026-BPL-00403',
      verificationHash: crypto.createHash('sha256').update(`CERT-2026-BPL-00403-${cands[2].fullName}`).digest('hex'),
      status: CertificateStatus.ACTIVE,
      issuedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  // BATCH 5: RETURNED Batch (Shows correction & resubmission flow)
  console.log('📦 Seeding Batch 5 (RETURNED - Awaiting Correction by Anika)...');
  const batch5 = await prisma.batch.create({
    data: {
      batchNumber: 'BATCH-2026-005',
      courseName: 'Electric Vehicle (EV) Powertrain Maintenance',
      trainingCentreId: apexCentre.id,
      districtId: bhopal.id,
      createdById: anika.id,
      candidateCount: 12,
      isLargeBatch: false,
      status: BatchStatus.RETURNED,
      districtApprovalCount: 0,
      returnReason: 'Incomplete candidate phone numbers for rows 3 & 7. Please correct candidate entries and resubmit.',
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      candidates: {
        create: createCandidates(12, 'EV'),
      },
    },
  });

  await prisma.batchApproval.create({
    data: {
      batchId: batch5.id,
      officerId: dev.id,
      role: Role.DISTRICT_OFFICER,
      stage: ApprovalStage.DISTRICT,
      action: ApprovalAction.RETURNED,
      remarks: 'Returned: Incomplete candidate phone numbers for rows 3 & 7. Please correct candidate entries and resubmit.',
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  });

  // 6. Seed Audit Logs for Full Traceability
  console.log('📝 Seeding Audit Logs...');
  await prisma.auditLog.createMany({
    data: [
      {
        entityType: 'BATCH',
        entityId: batch1.id,
        action: 'BATCH_SUBMITTED',
        userId: anika.id,
        details: { batchNumber: 'BATCH-2026-001', candidateCount: 15 },
        ipAddress: '127.0.0.1',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        entityType: 'APPROVAL',
        entityId: batch1.id,
        action: 'DISTRICT_APPROVED',
        userId: dev.id,
        details: { officer: 'Dev Verma', remarks: 'First district approval' },
        ipAddress: '127.0.0.1',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        entityType: 'BATCH',
        entityId: batch2.id,
        action: 'QUALITY_ESCALATED',
        userId: meera.id,
        details: { batchNumber: 'BATCH-2026-002', reason: 'Large batch threshold (65 candidates) exceeded' },
        ipAddress: '127.0.0.1',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        entityType: 'CERTIFICATE',
        entityId: cert1.id,
        action: 'CERTIFICATE_ISSUED',
        userId: farah.id,
        details: { certificateNumber: 'CERT-2026-BPL-00401', candidate: cands[0].fullName },
        ipAddress: '127.0.0.1',
        timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
      {
        entityType: 'CERTIFICATE',
        entityId: cert2.id,
        action: 'CERTIFICATE_REVOKED',
        userId: farah.id,
        details: { certificateNumber: 'CERT-2026-BPL-00402', reason: cert2.revocationReason },
        ipAddress: '127.0.0.1',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  console.log('✨ CertiFlow Database Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
