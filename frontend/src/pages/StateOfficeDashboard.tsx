import React, { useEffect, useState } from 'react';
import { useBatch } from '../context/BatchContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { getOverdueBatchesApi, OverdueBatch } from '../api/batches';
import {
  ShieldCheck,
  Award,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  History,
  Eye,
  FileCheck,
  Send
} from 'lucide-react';

export const StateOfficeDashboard: React.FC = () => {
  const { batches, certificates, approveBatch } = useBatch();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [overdueBatches, setOverdueBatches] = useState<OverdueBatch[]>([]);
  const [overdueThreshold, setOverdueThreshold] = useState(48);
  const [overdueError, setOverdueError] = useState<string | null>(null);

  useEffect(() => {
    getOverdueBatchesApi(currentUser.email)
      .then((result) => {
        setOverdueBatches(result.batches);
        setOverdueThreshold(result.thresholdHours);
        setOverdueError(null);
      })
      .catch((error) => {
        setOverdueError(error instanceof Error ? error.message : 'Failed to load overdue batches.');
      });
  }, [currentUser.email]);

  // State Office Queue: Batches ready for Final Sign-off
  const stateQueue = batches.filter((b) => b.status === 'UNDER_STATE_REVIEW');

  const activeCerts = certificates.filter((c) => c.status === 'ACTIVE').length;
  const revokedCerts = certificates.filter((c) => c.status === 'REVOKED').length;

  // Final Sign-off Modal
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const targetBatch = batches.find((b) => b.id === selectedBatchId);

  const handleAuthorizeBatch = () => {
    if (!selectedBatchId) return;
    setIsProcessing(true);
    setTimeout(() => {
      approveBatch(
        selectedBatchId,
        remarks || 'State Office Final Approval: Authorizing cryptographic certificate generation & WhatsApp dispatch.',
        currentUser
      );
      setIsProcessing(false);
      setSelectedBatchId(null);
      setRemarks('');
      navigate('/certificates');
    }, 800);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-400" />
            State Office Command & Oversight
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Director: <span className="text-purple-400 font-semibold">{currentUser.name}</span> &bull; Highest Authority for Final Certificate Issuance, Revocation & SLA Governance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/certificates"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
          >
            <Award className="w-4 h-4 text-emerald-400" />
            <span>Certificate Registry</span>
          </Link>
          <Link
            to="/audit-logs"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
          >
            <History className="w-4 h-4 text-indigo-400" />
            <span>Audit Trail</span>
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Awaiting State Sign-off"
          value={stateQueue.length}
          subtitle="Ready for certificate issuance"
          icon={Clock}
          color="purple"
        />
        <StatCard
          title="Active Valid Certificates"
          value={activeCerts}
          subtitle="Cryptographically verified"
          icon={Award}
          color="emerald"
        />
        <StatCard
          title="Revoked Certificates"
          value={revokedCerts}
          subtitle="Cancelled by State Office"
          icon={ShieldAlert}
          color={revokedCerts > 0 ? 'rose' : 'indigo'}
        />
        <StatCard
          title="SLA Breach / Stuck"
          value={overdueBatches.length}
          subtitle={`Waiting > ${overdueThreshold} hours`}
          icon={AlertTriangle}
          color={overdueBatches.length > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {/* SLA Stuck Batches Alert Bar (Requirement) */}
      {overdueError && (
        <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-4 text-rose-300 text-xs">
          Could not load the persisted overdue batch list: {overdueError}
        </div>
      )}
      {overdueBatches.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-600/60 rounded-xl p-4 text-amber-200 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="font-semibold text-sm text-amber-300">
              SLA Compliance Alert: {overdueBatches.length} batch(es) awaiting action for more than {overdueThreshold} hours
            </span>
          </div>
          <p className="text-xs text-amber-200/80">
            Overdue time is measured from the batch's most recent workflow update. The threshold is configured by the service operator.
          </p>
          <div className="space-y-1 pt-1">
            {overdueBatches.map((batch) => (
              <div
                key={batch.id}
                className="text-[11px] font-mono text-white"
              >
                {batch.batchNumber} ({batch.district.name} - {batch.status}; {batch.hoursWaiting}h)
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final Sign-off Queue */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm text-white">Batches Awaiting Final State Authorization</h2>
            <p className="text-xs text-slate-400">
              Approved by District and Quality. Authorizing will generate unique certificates & simulate WhatsApp dispatch.
            </p>
          </div>
          <span className="text-xs font-mono text-purple-400 bg-purple-950/70 px-2.5 py-0.5 rounded border border-purple-800">
            {stateQueue.length} Ready
          </span>
        </div>

        {stateQueue.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No batches currently waiting for final State authorization.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Batch Number</th>
                  <th className="px-6 py-3">Course Name</th>
                  <th className="px-6 py-3">Candidates</th>
                  <th className="px-6 py-3">District</th>
                  <th className="px-6 py-3">Training Centre</th>
                  <th className="px-6 py-3 text-right">Authorize Issuance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {stateQueue.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4 font-mono font-semibold text-white">
                      {batch.batchNumber}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-200">{batch.courseName}</td>
                    <td className="px-6 py-4 font-bold text-white">{batch.candidateCount}</td>
                    <td className="px-6 py-4 text-slate-400">{batch.district}</td>
                    <td className="px-6 py-4 text-slate-400">{batch.trainingCentre}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedBatchId(batch.id)}
                          className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Authorize & Issue</span>
                        </button>
                        <button
                          onClick={() => navigate(`/batches/${batch.id}`)}
                          className="p-1.5 text-slate-400 hover:text-white transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Authorize Modal */}
      <Modal
        isOpen={selectedBatchId !== null}
        onClose={() => setSelectedBatchId(null)}
        title={`Final State Authorization: ${targetBatch?.batchNumber}`}
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-300">
            By authorizing <strong className="text-white">{targetBatch?.batchNumber}</strong>, you grant final state certification to <strong className="text-white">{targetBatch?.candidateCount} candidates</strong>.
          </p>
          <div className="p-3 bg-purple-950/40 border border-purple-800/60 rounded-lg text-purple-200">
            ⚡ <strong>Automated Actions on Sign-off:</strong>
            <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-purple-300">
              <li>Generates tamper-proof SHA-256 certificate numbers.</li>
              <li>Publishes verification record to public verification portal.</li>
              <li>Enqueues BullMQ WhatsApp delivery simulation with retry logic.</li>
            </ul>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Director Sign-off Remarks:</label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Authorized for state certification after fulfilling all NSQF training compliance."
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              onClick={() => setSelectedBatchId(null)}
              className="px-3.5 py-1.5 bg-slate-800 text-slate-300 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleAuthorizeBatch}
              disabled={isProcessing}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5"
            >
              {isProcessing ? 'Generating Credentials...' : 'Sign & Issue Certificates'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
