import React, { createContext, useCallback, useContext, useState } from 'react';
import { Batch, Certificate, AuditLog, Candidate, User } from '../types';
import { INITIAL_BATCHES, INITIAL_CERTIFICATES, INITIAL_AUDIT_LOGS } from '../data/mockData';
import {
  createBatchApi,
  reviewBatchApi,
  submitBatchApi,
  resubmitBatchApi,
} from '../api/batches';
import {
  getCertificatesApi,
  revokeCertificateApi,
  retryCertificateDeliveryApi,
} from '../api/certificates';

interface BatchContextType {
  batches: Batch[];
  certificates: Certificate[];
  auditLogs: AuditLog[];
  getBatchById: (id: string) => Batch | undefined;
  getCertificateByNumber: (certNumber: string) => Certificate | undefined;
  createBatch: (data: { courseName: string; district: string; trainingCentre: string }, user: User) => Promise<Batch>;
  addCandidatesToBatch: (batchId: string, candidates: Omit<Candidate, 'id' | 'batchId' | 'status'>[]) => void;
  submitBatch: (batchId: string, user: User) => void;
  approveBatch: (batchId: string, remarks: string, user: User) => void;
  returnBatch: (batchId: string, reason: string, user: User) => void;
  rejectBatch: (batchId: string, reason: string, user: User) => void;
  resubmitBatch: (batchId: string, user: User) => void;
  revokeCertificate: (certificateNumber: string, reason: string, user: User) => Promise<void>;
  refreshCertificates: () => Promise<void>;
  retryCertificateDelivery: (certificateNumber: string, userId: string) => Promise<void>;
}

const BatchContext = createContext<BatchContextType | undefined>(undefined);

export const BatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [batches, setBatches] = useState<Batch[]>(INITIAL_BATCHES);
  const [certificates, setCertificates] = useState<Certificate[]>(INITIAL_CERTIFICATES);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);

  const refreshCertificates = useCallback(async () => {
    const persistedCertificates = await getCertificatesApi();
    setCertificates((previous) => {
      const persistedNumbers = new Set(
        persistedCertificates.map((certificate) => certificate.certificateNumber)
      );
      return [
        ...persistedCertificates,
        ...previous.filter((certificate) => !persistedNumbers.has(certificate.certificateNumber)),
      ];
    });
  }, []);

  const retryCertificateDelivery = async (certificateNumber: string, userId: string) => {
    const delivery = await retryCertificateDeliveryApi(certificateNumber, userId);
    setCertificates((previous) =>
      previous.map((certificate) =>
        certificate.certificateNumber === certificateNumber
          ? {
              ...certificate,
              deliveryStatus: delivery.status,
              deliveryAttempts: delivery.attempts,
            }
          : certificate
      )
    );
  };

  const getBatchById = (id: string) => batches.find((b) => b.id === id || b.batchNumber === id);

  const getCertificateByNumber = (certNumber: string) => 
    certificates.find((c) => c.certificateNumber.toLowerCase() === certNumber.trim().toLowerCase());

  const addAudit = (entityType: 'BATCH' | 'CERTIFICATE' | 'APPROVAL', entityId: string, action: string, user: User, details: any) => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      entityType,
      entityId,
      action,
      userName: user.name,
      userRole: user.role,
      details,
      timestamp: new Date().toISOString(),
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const createBatch = async (
    data: { courseName: string; district: string; trainingCentre: string },
    user: User
  ): Promise<Batch> => {
    const persistedBatch = await createBatchApi(data.courseName, user.email);
    const newBatch: Batch = {
      id: persistedBatch.id,
      batchNumber: persistedBatch.batchNumber,
      courseName: persistedBatch.courseName,
      trainingCentre: persistedBatch.trainingCentre.name,
      district: persistedBatch.district.name,
      candidateCount: persistedBatch.candidateCount,
      isLargeBatch: persistedBatch.isLargeBatch,
      status: persistedBatch.status,
      districtApprovalCount: persistedBatch.districtApprovalCount,
      reviewRound: persistedBatch.reviewRound,
      version: persistedBatch.version,
      createdAt: persistedBatch.createdAt,
      candidates: [],
      approvals: [],
    };

    setBatches((prev) => [newBatch, ...prev.filter((batch) => batch.id !== newBatch.id)]);
    addAudit('BATCH', newBatch.id, 'BATCH_CREATED', user, {
      batchNumber: newBatch.batchNumber,
      previousState: null,
      newState: newBatch.status,
    });
    return newBatch;
  };

  const addCandidatesToBatch = (batchId: string, newCandidates: Omit<Candidate, 'id' | 'batchId' | 'status'>[]) => {
    setBatches((prev) =>
      prev.map((batch) => {
        if (batch.id !== batchId) return batch;
        const candidateItems: Candidate[] = newCandidates.map((c, i) => ({
          ...c,
          id: `c-${batchId}-${Date.now()}-${i}`,
          batchId,
          status: 'PENDING',
        }));
        const candidateCount = candidateItems.length;
        const isLargeBatch = candidateCount >= 50;

        return {
          ...batch,
          candidateCount,
          isLargeBatch,
          status: 'UNDER_DISTRICT_REVIEW',
          districtApprovalCount: 0,
          returnReason: undefined,
          reviewRound: (batch.reviewRound ?? 1) + (batch.status === 'RETURNED' ? 1 : 0),
          candidates: candidateItems,
        };
      })
    );
  };

  const submitBatch = (batchId: string, user: User) => {
    // Attempt backend sync
    submitBatchApi(batchId, user.email).catch((err) => {
      console.warn('Backend sync notice (offline or local batch):', err.message);
    });

    setBatches((prev) =>
      prev.map((batch) => {
        if (batch.id !== batchId) return batch;
        return {
          ...batch,
          status: 'UNDER_DISTRICT_REVIEW',
          submittedAt: new Date().toISOString(),
          version: batch.version + 1,
        };
      })
    );
    addAudit('BATCH', batchId, 'BATCH_SUBMITTED', user, { status: 'UNDER_DISTRICT_REVIEW' });
  };

  const approveBatch = (batchId: string, remarks: string, user: User) => {
    const currentBatch = batches.find((b) => b.id === batchId);

    // Call backend API with optimistic lock version
    if (currentBatch) {
      reviewBatchApi(batchId, 'APPROVED', remarks, currentBatch.version, user.email)
        .then(async (result) => {
          if (result.batch?.status === 'COMPLETED') {
            const persistedCertificates = await getCertificatesApi();
            setCertificates((previous) => [
              ...persistedCertificates.filter((certificate) => certificate.batchId === batchId),
              ...previous.filter((certificate) => certificate.batchId !== batchId),
            ]);
          }
        })
        .catch((err) => {
          console.warn('Backend review API notice:', err.message);
        });
    }

    setBatches((prev) =>
      prev.map((batch) => {
        if (batch.id !== batchId) return batch;

        const newApproval = {
          id: `app-${Date.now()}`,
          batchId: batch.id,
          officerId: user.id,
          officerName: user.name,
          role: user.role,
          stage: (user.role === 'QUALITY_TEAM' ? 'QUALITY' : user.role === 'STATE_OFFICE' ? 'STATE' : 'DISTRICT') as any,
          action: 'APPROVED' as any,
          remarks: remarks || 'Approved after review',
          createdAt: new Date().toISOString(),
        };

        const updatedApprovals = [...batch.approvals, newApproval];

        // State Machine Transition Logic
        if (batch.status === 'UNDER_DISTRICT_REVIEW') {
          const newCount = batch.districtApprovalCount + 1;
          if (newCount >= 2) {
            // Need 2 district approvals
            const nextStatus = batch.isLargeBatch || batch.candidateCount >= 50 ? 'UNDER_QUALITY_REVIEW' : 'UNDER_STATE_REVIEW';
            addAudit('APPROVAL', batch.id, 'DISTRICT_QUORUM_MET', user, { nextStatus, approvals: 2 });
            return {
              ...batch,
              districtApprovalCount: newCount,
              status: nextStatus,
              approvals: updatedApprovals,
              version: batch.version + 1,
            };
          } else {
            addAudit('APPROVAL', batch.id, 'DISTRICT_FIRST_APPROVAL', user, { approvals: 1 });
            return {
              ...batch,
              districtApprovalCount: newCount,
              approvals: updatedApprovals,
              version: batch.version + 1,
            };
          }
        }

        if (batch.status === 'UNDER_QUALITY_REVIEW') {
          addAudit('APPROVAL', batch.id, 'QUALITY_APPROVED', user, { remarks });
          return {
            ...batch,
            status: 'UNDER_STATE_REVIEW',
            approvals: updatedApprovals,
            version: batch.version + 1,
          };
        }

        if (batch.status === 'UNDER_STATE_REVIEW') {
          addAudit('APPROVAL', batch.id, 'STATE_FINAL_APPROVED', user, { remarks });

          // Auto-generate certificates for all candidates
          const newCerts: Certificate[] = batch.candidates.map((c, idx) => {
            const certNum = `CERT-2026-${batch.district.substring(0, 3).toUpperCase()}-${String(Date.now() + idx).slice(-5)}`;
            return {
              id: `cert-${Date.now()}-${idx}`,
              certificateNumber: certNum,
              candidateId: c.id,
              candidateName: c.fullName,
              candidatePhone: c.phone,
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              courseName: batch.courseName,
              trainingCentre: batch.trainingCentre,
              grade: c.grade,
              pdfUrl: `/certificates/${certNum}.pdf`,
              qrCodeUrl: `/verify/${certNum}`,
              verificationHash: `${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`,
              status: 'ACTIVE',
              issuedAt: new Date().toISOString(),
              deliveryStatus: 'QUEUED',
              deliveryAttempts: 0,
            };
          });

          setCertificates((cPrev) => [...newCerts, ...cPrev]);

          return {
            ...batch,
            status: 'COMPLETED',
            approvedAt: new Date().toISOString(),
            approvals: updatedApprovals,
            version: batch.version + 1,
            candidates: batch.candidates.map((c) => ({ ...c, status: 'CERTIFIED' })),
          };
        }

        return batch;
      })
    );
  };

  const returnBatch = (batchId: string, reason: string, user: User) => {
    const currentBatch = batches.find((b) => b.id === batchId);
    if (currentBatch) {
      reviewBatchApi(batchId, 'RETURNED', reason, currentBatch.version, user.email).catch((err) => {
        console.warn('Backend return API notice:', err.message);
      });
    }

    setBatches((prev) =>
      prev.map((batch) => {
        if (batch.id !== batchId) return batch;
        return {
          ...batch,
          status: 'RETURNED',
          returnReason: reason,
          districtApprovalCount: 0,
          version: batch.version + 1,
          approvals: [
            ...batch.approvals,
            {
              id: `app-${Date.now()}`,
              batchId: batch.id,
              officerId: user.id,
              officerName: user.name,
              role: user.role,
              stage: (user.role === 'QUALITY_TEAM' ? 'QUALITY' : 'DISTRICT') as any,
              action: 'RETURNED' as any,
              remarks: reason,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      })
    );
    addAudit('BATCH', batchId, 'BATCH_RETURNED', user, { returnReason: reason });
  };

  const rejectBatch = (batchId: string, reason: string, user: User) => {
    const currentBatch = batches.find((b) => b.id === batchId);
    if (currentBatch) {
      reviewBatchApi(batchId, 'REJECTED', reason, currentBatch.version, user.email).catch((err) => {
        console.warn('Backend reject API notice:', err.message);
      });
    }

    setBatches((prev) =>
      prev.map((batch) => {
        if (batch.id !== batchId) return batch;
        return {
          ...batch,
          status: 'REJECTED',
          rejectReason: reason,
          version: batch.version + 1,
          approvals: [
            ...batch.approvals,
            {
              id: `app-${Date.now()}`,
              batchId: batch.id,
              officerId: user.id,
              officerName: user.name,
              role: user.role,
              stage: (user.role === 'STATE_OFFICE' ? 'STATE' : 'DISTRICT') as any,
              action: 'REJECTED' as any,
              remarks: reason,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      })
    );
    addAudit('BATCH', batchId, 'BATCH_REJECTED', user, { rejectReason: reason });
  };

  const resubmitBatch = (batchId: string, user: User) => {
    resubmitBatchApi(batchId, user.email).catch((err) => {
      console.warn('Backend resubmit API notice:', err.message);
    });

    setBatches((prev) =>
      prev.map((batch) => {
        if (batch.id !== batchId) return batch;
        return {
          ...batch,
          status: 'UNDER_DISTRICT_REVIEW',
          returnReason: undefined,
          districtApprovalCount: 0,
          reviewRound: (batch.reviewRound ?? 1) + 1,
          submittedAt: new Date().toISOString(),
          version: batch.version + 1,
        };
      })
    );
    addAudit('BATCH', batchId, 'BATCH_RESUBMITTED', user, { previousStatus: 'RETURNED' });
  };

  const revokeCertificate = async (certificateNumber: string, reason: string, user: User) => {
    const updatedCertificate = await revokeCertificateApi(certificateNumber, reason, user.email);
    setCertificates((prev) =>
      prev.map((cert) => {
        if (cert.certificateNumber.toLowerCase() !== certificateNumber.toLowerCase()) return cert;
        return {
          ...cert,
          status: updatedCertificate.status,
          revocationReason: updatedCertificate.revocationReason,
          revokedAt: updatedCertificate.revokedAt,
          revokedByName: `${user.name} (${user.role.replace('_', ' ')})`,
        };
      })
    );
    addAudit('CERTIFICATE', certificateNumber, 'CERTIFICATE_REVOKED', user, { reason });
  };

  return (
    <BatchContext.Provider
      value={{
        batches,
        certificates,
        auditLogs,
        getBatchById,
        getCertificateByNumber,
        createBatch,
        addCandidatesToBatch,
        submitBatch,
        approveBatch,
        returnBatch,
        rejectBatch,
        resubmitBatch,
        revokeCertificate,
        refreshCertificates,
        retryCertificateDelivery,
      }}
    >
      {children}
    </BatchContext.Provider>
  );
};

export const useBatch = () => {
  const context = useContext(BatchContext);
  if (!context) {
    throw new Error('useBatch must be used within a BatchProvider');
  }
  return context;
};
