export type Role = 'TRAINING_CENTRE' | 'DISTRICT_OFFICER' | 'QUALITY_TEAM' | 'STATE_OFFICE';

export type BatchStatus = 
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_DISTRICT_REVIEW'
  | 'UNDER_QUALITY_REVIEW'
  | 'UNDER_STATE_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'COMPLETED';

export type ApprovalStage = 'DISTRICT' | 'QUALITY' | 'STATE';
export type ApprovalAction = 'APPROVED' | 'REJECTED' | 'RETURNED';

export type CandidateStatus = 'PENDING' | 'CERTIFIED' | 'FAILED';
export type CertificateStatus = 'ACTIVE' | 'REVOKED';
export type DeliveryStatus = 'QUEUED' | 'SENDING' | 'RETRYING' | 'DELIVERED' | 'FAILED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  district?: string;
  trainingCentre?: string;
  avatar?: string;
}

export interface Candidate {
  id: string;
  batchId: string;
  fullName: string;
  phone: string;
  email?: string;
  nationalId: string; // Masked Aadhaar
  grade: string;
  completionDate: string;
  status: CandidateStatus;
}

export interface BatchApproval {
  id: string;
  batchId: string;
  officerId: string;
  officerName: string;
  role: Role;
  stage: ApprovalStage;
  action: ApprovalAction;
  reviewRound?: number;
  remarks: string;
  createdAt: string;
}

export interface Batch {
  id: string;
  batchNumber: string;
  courseName: string;
  trainingCentre: string;
  district: string;
  candidateCount: number;
  isLargeBatch: boolean;
  status: BatchStatus;
  districtApprovalCount: number;
  reviewRound?: number;
  version: number;
  returnReason?: string;
  rejectReason?: string;
  submittedAt?: string;
  approvedAt?: string;
  createdAt: string;
  candidates: Candidate[];
  approvals: BatchApproval[];
}

export interface Certificate {
  id: string;
  certificateNumber: string;
  candidateId: string;
  candidateName: string;
  candidatePhone: string;
  batchId: string;
  batchNumber: string;
  courseName: string;
  trainingCentre: string;
  grade: string;
  pdfUrl: string;
  qrCodeUrl: string;
  verificationHash: string;
  status: CertificateStatus;
  revocationReason?: string;
  revokedAt?: string;
  revokedByName?: string;
  issuedAt: string;
  deliveryStatus: DeliveryStatus;
  deliveryAttempts: number;
}

export interface AuditLog {
  id: string;
  entityType: 'BATCH' | 'CERTIFICATE' | 'USER' | 'APPROVAL';
  entityId: string;
  action: string;
  userName: string;
  userRole: Role;
  details: Record<string, any>;
  timestamp: string;
}
