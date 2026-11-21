import React, { useState } from 'react';
import { useBatch } from '../context/BatchContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Eye,
  ShieldCheck,
  Building
} from 'lucide-react';

export const DistrictReviewDashboard: React.FC = () => {
  const { batches, approveBatch, returnBatch } = useBatch();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // District Officer Filters (dev & meera see Bhopal batches, kabir sees Indore)
  const officerDistrict = currentUser.district || 'Bhopal';

  const districtBatches = batches.filter(
    (b) => b.district.toLowerCase() === officerDistrict.toLowerCase()
  );

  const pendingBatches = districtBatches.filter(
    (b) => b.status === 'UNDER_DISTRICT_REVIEW'
  );

  const approvedByMe = districtBatches.filter((b) =>
    b.approvals.some((a) => a.officerId === currentUser.id)
  );

  // Quick Action Modal state
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'RETURN' | null>(null);
  const [remarks, setRemarks] = useState('');

  const targetBatch = batches.find((b) => b.id === selectedBatchId);

  const handleQuickAction = () => {
    if (!selectedBatchId || !actionType) return;
    if (actionType === 'APPROVE') {
      approveBatch(selectedBatchId, remarks || 'Verified and approved at district level', currentUser);
    } else {
      returnBatch(selectedBatchId, remarks || 'Returned for documentation corrections', currentUser);
    }
    setSelectedBatchId(null);
    setActionType(null);
    setRemarks('');
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-sky-400" />
            District Officer Review Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Officer: <span className="text-sky-400 font-semibold">{currentUser.name}</span> &bull; Jurisdiction:{' '}
            <span className="font-semibold text-white">{officerDistrict} District</span> (Quorum requirement: 2 approvals)
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Awaiting District Action"
          value={pendingBatches.length}
          subtitle={`In ${officerDistrict} jurisdiction`}
          icon={Clock}
          color="blue"
        />
        <StatCard
          title="Reviewed By You"
          value={approvedByMe.length}
          subtitle="Signed off by current officer"
          icon={CheckCircle2}
          color="emerald"
        />
        <StatCard
          title="District Batches Total"
          value={districtBatches.length}
          subtitle="All lifecycle stages"
          icon={Building}
          color="indigo"
        />
      </div>

      {/* Pending Reviews Queue */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm text-white">Batches Awaiting District Sign-off</h2>
            <p className="text-xs text-slate-400">
              Two officer approvals required before routing to Quality/State
            </p>
          </div>
          <span className="text-xs font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800">
            {pendingBatches.length} Pending
          </span>
        </div>

        {pendingBatches.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No batches currently waiting for district review in {officerDistrict}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Batch Number</th>
                  <th className="px-6 py-3">Course</th>
                  <th className="px-6 py-3">Candidates</th>
                  <th className="px-6 py-3">Training Centre</th>
                  <th className="px-6 py-3">District Quorum</th>
                  <th className="px-6 py-3 text-right">Review Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {pendingBatches.map((batch) => {
                  const alreadyApprovedByMe = batch.approvals.some(
                    (a) => a.officerId === currentUser.id && a.stage === 'DISTRICT'
                  );

                  return (
                    <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4 font-mono font-semibold text-white">
                        {batch.batchNumber}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-200">{batch.courseName}</td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-white">{batch.candidateCount}</span>
                        {batch.isLargeBatch && (
                          <span className="ml-1.5 text-[10px] font-bold text-amber-400 bg-amber-950 px-1 py-0.5 rounded border border-amber-800">
                            &gt;50 Quality Gate
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400">{batch.trainingCentre}</td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                          {batch.districtApprovalCount} / 2 Approved
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {alreadyApprovedByMe ? (
                          <span className="text-emerald-400 text-xs font-medium inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Your vote recorded
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedBatchId(batch.id);
                                setActionType('APPROVE');
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setSelectedBatchId(batch.id);
                                setActionType('RETURN');
                              }}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-semibold border border-slate-700 transition"
                            >
                              Return
                            </button>
                            <button
                              onClick={() => navigate(`/batches/${batch.id}`)}
                              className="px-2.5 py-1.5 text-slate-400 hover:text-white transition"
                              title="Inspect Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      <Modal
        isOpen={selectedBatchId !== null}
        onClose={() => {
          setSelectedBatchId(null);
          setActionType(null);
        }}
        title={
          actionType === 'APPROVE'
            ? `Grant District Approval: ${targetBatch?.batchNumber}`
            : `Return Batch: ${targetBatch?.batchNumber}`
        }
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-300">
            {actionType === 'APPROVE'
              ? `You are signing off on ${targetBatch?.candidateCount} candidates from ${targetBatch?.trainingCentre}. Once 2 district officers approve, the batch advances automatically.`
              : `Provide clear correction instructions for the Training Centre.`}
          </p>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Officer Remarks:</label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Attendance and lab examination scores verified."
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
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
              onClick={handleQuickAction}
              className={`px-4 py-1.5 text-white font-semibold rounded-lg shadow-sm ${
                actionType === 'APPROVE'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              Confirm {actionType}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
