import React, { useEffect, useState } from 'react';
import { useBatch } from '../context/BatchContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import {
  Award,
  ShieldAlert,
  Search,
  ExternalLink,
  FileText,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Download
} from 'lucide-react';

export const CertificateManagementPage: React.FC = () => {
  const {
    certificates,
    revokeCertificate,
    refreshCertificates,
    retryCertificateDelivery,
  } = useBatch();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ALL');

  // Revocation Modal state
  const [revokeTargetCert, setRevokeTargetCert] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [retryingDelivery, setRetryingDelivery] = useState<string | null>(null);

  const targetCert = certificates.find((c) => c.certificateNumber === revokeTargetCert);

  const canRevoke = currentUser.role === 'STATE_OFFICE';
  const canRetryDelivery = currentUser.role === 'STATE_OFFICE';

  useEffect(() => {
    const hasPendingDeliveries = certificates.some((certificate) =>
      ['QUEUED', 'SENDING', 'RETRYING'].includes(certificate.deliveryStatus)
    );
    if (!hasPendingDeliveries) return;

    const intervalId = window.setInterval(() => {
      refreshCertificates().catch((error) => {
        console.warn('Certificate delivery status refresh failed:', error.message);
      });
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [certificates, refreshCertificates]);

  const filteredCerts = certificates.filter((c) => {
    const matchesSearch =
      c.certificateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.courseName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      filterStatus === 'ALL' || c.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const handleRevokeSubmit = async () => {
    if (!revokeTargetCert || !revokeReason.trim()) return;
    setIsRevoking(true);
    try {
      await revokeCertificate(revokeTargetCert, revokeReason.trim(), currentUser);
      setRevokeTargetCert(null);
      setRevokeReason('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to cancel certificate');
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-emerald-400" />
            Certificate Registry & Revocation Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Browse issued credentials, monitor simulated WhatsApp delivery logs, and enforce state cancellations.
          </p>
        </div>

        {/* Public Portal Button */}
        <Link
          to="/verify"
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 shrink-0"
        >
          <span>Open Public Verification Page</span>
          <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
        </Link>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 border border-slate-800 rounded-xl">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Cert ID, Candidate, or Course..."
            className="w-full bg-slate-800 border border-slate-700 text-white pl-9 pr-3 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400">Status:</span>
          <select
            value={filterStatus}
            onChange={(e: any) => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none"
          >
            <option value="ALL">All Certificates ({certificates.length})</option>
            <option value="ACTIVE">Active & Valid</option>
            <option value="REVOKED">Revoked / Invalid</option>
          </select>
        </div>
      </div>

      {/* Certificates Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Certificate ID</th>
                <th className="px-6 py-3">Candidate Name</th>
                <th className="px-6 py-3">Course / Batch</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">WhatsApp Delivery</th>
                <th className="px-6 py-3">Issued Date</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredCerts.map((cert) => {
                const isRevoked = cert.status === 'REVOKED';
                return (
                  <tr key={cert.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4 font-mono font-semibold text-white">
                      {cert.certificateNumber}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{cert.candidateName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{cert.candidatePhone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-200">{cert.courseName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{cert.batchNumber} &bull; Grade {cert.grade}</div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={cert.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={cert.deliveryStatus} size="sm" />
                        {cert.deliveryAttempts > 0 && (
                          <span className="text-[10px] text-slate-500">
                            Attempt #{cert.deliveryAttempts}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-[11px]">
                      {new Date(cert.issuedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {cert.deliveryStatus === 'FAILED' && canRetryDelivery && (
                          <button
                            onClick={async () => {
                              setRetryingDelivery(cert.certificateNumber);
                              try {
                                await retryCertificateDelivery(cert.certificateNumber, currentUser.email);
                              } catch (error) {
                                alert(error instanceof Error ? error.message : 'Failed to retry delivery');
                              } finally {
                                setRetryingDelivery(null);
                              }
                            }}
                            disabled={retryingDelivery === cert.certificateNumber}
                            className="px-2.5 py-1.5 bg-amber-950/60 hover:bg-amber-900/80 disabled:opacity-50 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-medium transition flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{retryingDelivery === cert.certificateNumber ? 'Queuing' : 'Retry'}</span>
                          </button>
                        )}

                        {/* Download PDF Button */}
                        <a
                          href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/certificates/${cert.certificateNumber}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 rounded-lg text-xs font-medium transition flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-400" />
                          <span>PDF</span>
                        </a>

                        {/* Public Link */}
                        <Link
                          to={`/verify/${cert.certificateNumber}`}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Verify</span>
                        </Link>

                        {/* Revocation Button: Only Farah (State Office) */}
                        {!isRevoked && (
                          <button
                            onClick={() => {
                              if (!canRevoke) {
                                alert('Notice: Only the State Office (Farah) has legal authority to revoke certificates. Switch persona to Farah in top bar.');
                                return;
                              }
                              setRevokeTargetCert(cert.certificateNumber);
                            }}
                            className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-medium transition flex items-center gap-1"
                          >
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                            <span>Revoke</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revocation Reason Modal */}
      <Modal
        isOpen={revokeTargetCert !== null}
        onClose={() => {
          setRevokeTargetCert(null);
          setRevokeReason('');
        }}
        title={`Cancel / Revoke Certificate: ${targetCert?.certificateNumber}`}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-rose-200">
            <strong>⚠️ Immediate Public Effect:</strong> Revoking this certificate will immediately reflect on the public verification portal with a red <strong>REVOKED</strong> warning. Employers will see the cancellation reason.
          </div>

          <p className="text-slate-300">
            Candidate: <strong className="text-white">{targetCert?.candidateName}</strong> ({targetCert?.courseName})
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400">
              Official Justification for Revocation (Mandatory):
            </label>
            <textarea
              rows={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="e.g. Identity audit discovered fraudulent enrollment documents..."
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              onClick={() => setRevokeTargetCert(null)}
              className="px-3.5 py-1.5 bg-slate-800 text-slate-300 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleRevokeSubmit}
              disabled={!revokeReason.trim() || isRevoking}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              <span>{isRevoking ? 'Cancelling...' : 'Confirm Certificate Cancellation'}</span>
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
