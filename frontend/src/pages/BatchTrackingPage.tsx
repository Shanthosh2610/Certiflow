import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useBatch } from '../context/BatchContext';
import { useAuth } from '../context/AuthContext';
import { ApprovalStepper } from '../components/ApprovalStepper';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import {
  FolderKanban,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  Award,
  Building,
  UserCheck,
  Send,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';

export const BatchTrackingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { batches, approveBatch, returnBatch, rejectBatch, resubmitBatch, submitBatch } = useBatch();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const batch = batches.find((b) => b.id === id || b.batchNumber === id);

  // Review modal state
  const [modalAction, setModalAction] = useState<'APPROVE' | 'RETURN' | 'REJECT' | null>(null);
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!batch) {
    return (
      <div className="text-center py-16 space-y-4">
        <FolderKanban className="w-12 h-12 text-slate-600 mx-auto" />
        <h2 className="text-xl font-bold text-white">Batch Not Found</h2>
        <p className="text-xs text-slate-400">The requested batch could not be found in the registry.</p>
        <Link to="/batches" className="inline-block px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold">
          Return to Batches
        </Link>
      </div>
    );
  }

  const role = currentUser.role;

  // Determine if active user has permission to review this batch right now
  const canDistrictReview =
    role === 'DISTRICT_OFFICER' &&
    batch.status === 'UNDER_DISTRICT_REVIEW' &&
    !batch.approvals.some(
      (a) =>
        a.officerId === currentUser.id &&
        a.stage === 'DISTRICT' &&
        (a.reviewRound ?? 1) === (batch.reviewRound ?? 1)
    );

  const canQualityReview =
    role === 'QUALITY_TEAM' && batch.status === 'UNDER_QUALITY_REVIEW';

  const canStateReview =
    role === 'STATE_OFFICE' && batch.status === 'UNDER_STATE_REVIEW';

  const canReview = canDistrictReview || canQualityReview || canStateReview;

  const canResubmit =
    role === 'TRAINING_CENTRE' && batch.status === 'RETURNED';

  const canSubmitDraft =
    role === 'TRAINING_CENTRE' && batch.status === 'DRAFT' && batch.candidateCount > 0;

  const handleActionConfirm = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      if (modalAction === 'APPROVE') {
        approveBatch(batch.id, remarks, currentUser);
      } else if (modalAction === 'RETURN') {
        returnBatch(batch.id, remarks || 'Returned for correction', currentUser);
      } else if (modalAction === 'REJECT') {
        rejectBatch(batch.id, remarks || 'Rejected by reviewing officer', currentUser);
      }
      setIsSubmitting(false);
      setModalAction(null);
      setRemarks('');
    }, 600);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Breadcrumb & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <Link
            to="/batches"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to All Batches
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white font-mono">{batch.batchNumber}</h1>
            <StatusBadge status={batch.status} />
          </div>
          <p className="text-xs text-slate-400">
            {batch.courseName} &bull; {batch.trainingCentre} ({batch.district})
          </p>
        </div>

        {/* Action Trays for Authorized Reviewers */}
        <div className="flex items-center gap-2">
          {canSubmitDraft && (
            <button
              onClick={() => submitBatch(batch.id, currentUser)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition"
            >
              <Send className="w-4 h-4" />
              <span>Submit Batch to District</span>
            </button>
          )}

          {canResubmit && (
            <button
              onClick={() => resubmitBatch(batch.id, currentUser)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Resubmit Batch After Corrections</span>
            </button>
          )}

          {canReview && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setModalAction('APPROVE')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Approve Stage</span>
              </button>
              <button
                onClick={() => setModalAction('RETURN')}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Return with Remarks</span>
              </button>
              <button
                onClick={() => setModalAction('REJECT')}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Return Reason Alert (If returned) */}
      {batch.status === 'RETURNED' && batch.returnReason && (
        <div className="p-4 bg-amber-950/40 border border-amber-600/60 rounded-xl flex items-start gap-3 text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm text-amber-300">
              Batch Returned for Correction
            </div>
            <p className="text-xs text-amber-200/90 mt-0.5">
              Reviewing Officer Remark: <span className="font-mono bg-amber-900/60 px-2 py-0.5 rounded text-white">{batch.returnReason}</span>
            </p>
          </div>
        </div>
      )}

      {/* Visual Pipeline Stepper */}
      <ApprovalStepper batch={batch} />

      {/* Meta Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <span className="text-slate-400 uppercase font-semibold text-[10px]">District Jurisdiction</span>
          <div className="font-semibold text-white mt-1 text-sm">{batch.district}</div>
        </div>
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <span className="text-slate-400 uppercase font-semibold text-[10px]">Total Candidates</span>
          <div className="font-semibold text-white mt-1 text-sm flex items-center gap-2">
            <span>{batch.candidateCount}</span>
            {batch.isLargeBatch && (
              <span className="text-[10px] text-amber-400 bg-amber-950 px-1.5 py-0.5 rounded border border-amber-800">
                Large Batch
              </span>
            )}
          </div>
        </div>
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <span className="text-slate-400 uppercase font-semibold text-[10px]">District Quorum</span>
          <div className="font-semibold text-indigo-400 mt-1 text-sm font-mono">
            {batch.districtApprovalCount} / 2 Approvals
          </div>
        </div>
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <span className="text-slate-400 uppercase font-semibold text-[10px]">Optimistic Lock Version</span>
          <div className="font-semibold text-slate-300 mt-1 text-sm font-mono">
            v{batch.version} (Concurrency Guard)
          </div>
        </div>
      </div>

      {/* Candidate Roster Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-white">
            Enrolled Candidates Roster ({batch.candidates.length})
          </h3>
          <span className="text-xs text-slate-400">All student records verified</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">#</th>
                <th className="px-6 py-3">Candidate Full Name</th>
                <th className="px-6 py-3">Mobile Contact</th>
                <th className="px-6 py-3">National ID (Aadhaar)</th>
                <th className="px-6 py-3">Assessment Grade</th>
                <th className="px-6 py-3">Certification Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {batch.candidates.map((c, i) => (
                <tr key={c.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-6 py-3.5 font-mono text-slate-500">{i + 1}</td>
                  <td className="px-6 py-3.5 font-semibold text-white">{c.fullName}</td>
                  <td className="px-6 py-3.5 font-mono text-slate-400">{c.phone}</td>
                  <td className="px-6 py-3.5 font-mono text-slate-400">{c.nationalId}</td>
                  <td className="px-6 py-3.5">
                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-800 border border-slate-700 text-slate-300">
                      {c.grade}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    {c.status === 'CERTIFIED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                        <Award className="w-3.5 h-3.5" /> Certified
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Pending Approval</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approval Audit Trail */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-sm text-white">Immutable Approval Decision Log</h3>
        
        {batch.approvals.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No review decisions recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {batch.approvals.map((app) => (
              <div
                key={app.id}
                className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-xs">{app.officerName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Round {app.reviewRound ?? 1}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {app.role.replace('_', ' ')}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      app.action === 'APPROVED'
                        ? 'text-emerald-400 bg-emerald-950/70 border border-emerald-800'
                        : 'text-amber-400 bg-amber-950/70 border border-amber-800'
                    }`}>
                      {app.action}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 italic">"{app.remarks}"</p>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {new Date(app.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Modal */}
      <Modal
        isOpen={modalAction !== null}
        onClose={() => setModalAction(null)}
        title={
          modalAction === 'APPROVE'
            ? 'Authorize Batch Approval'
            : modalAction === 'RETURN'
            ? 'Return Batch for Correction'
            : 'Reject Batch'
        }
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-300">
            {modalAction === 'APPROVE' &&
              `You are confirming verification of ${batch.candidateCount} candidates in ${batch.batchNumber}.`}
            {modalAction === 'RETURN' &&
              `Specify the reason for returning this batch to the Training Centre.`}
            {modalAction === 'REJECT' &&
              `Provide official grounds for rejecting this batch permanently.`}
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400">
              Official Officer Remarks / Justification:
            </label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g., Lab assessment verified, biometric attendance matched..."
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              onClick={() => setModalAction(null)}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleActionConfirm}
              disabled={isSubmitting}
              className={`px-4 py-1.5 text-white font-semibold rounded-lg shadow-sm ${
                modalAction === 'APPROVE'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : modalAction === 'RETURN'
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-rose-600 hover:bg-rose-500'
              }`}
            >
              {isSubmitting ? 'Recording...' : `Confirm ${modalAction}`}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
