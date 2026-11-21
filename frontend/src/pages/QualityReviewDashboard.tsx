import React, { useState } from 'react';
import { useBatch } from '../context/BatchContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import {
  ShieldAlert,
  CheckCircle2,
  Clock,
  RotateCcw,
  Eye,
  FileCheck2,
  CheckSquare,
  AlertTriangle
} from 'lucide-react';

export const QualityReviewDashboard: React.FC = () => {
  const { batches, approveBatch, returnBatch } = useBatch();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Batches needing Quality Scrutiny: status === 'UNDER_QUALITY_REVIEW'
  const qualityQueue = batches.filter((b) => b.status === 'UNDER_QUALITY_REVIEW');
  const allLargeBatches = batches.filter((b) => b.isLargeBatch || b.candidateCount >= 50);

  // Quality Modal State
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'RETURN' | null>(null);
  const [remarks, setRemarks] = useState('');
  
  // Interactive Quality Audit Checklist
  const [checks, setChecks] = useState({
    attendanceOver80: true,
    labPracticalCrossVerified: true,
    biometricsDeduplicated: true,
  });

  const targetBatch = batches.find((b) => b.id === selectedBatchId);

  const handleQualitySubmit = () => {
    if (!selectedBatchId || !actionType) return;
    if (actionType === 'APPROVE') {
      approveBatch(
        selectedBatchId,
        remarks || 'Quality Assurance Team: All bulk candidate criteria & biometrics validated.',
        currentUser
      );
    } else {
      returnBatch(
        selectedBatchId,
        remarks || 'Quality Assurance Team: Discrepancies found during biometric sampling audit.',
        currentUser
      );
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
            <ShieldAlert className="w-6 h-6 text-amber-400" />
            Quality Assurance Team Scrutiny Console
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Officer: <span className="text-amber-400 font-semibold">{currentUser.name}</span> &bull; Mandatory Quality Gatekeeper for bulk batches exceeding 50 candidates
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Awaiting Quality Gate"
          value={qualityQueue.length}
          subtitle="Bulk batches under scrutiny"
          icon={Clock}
          color="amber"
        />
        <StatCard
          title="Total Large Batches"
          value={allLargeBatches.length}
          subtitle="Batches with 50+ candidates"
          icon={FileCheck2}
          color="indigo"
        />
        <StatCard
          title="Audit Threshold"
          value="> 50"
          subtitle="Automatic escalation trigger"
          icon={AlertTriangle}
          color="purple"
        />
      </div>

      {/* Quality Queue Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm text-white">Large Batches Escalated for Scrutiny</h2>
            <p className="text-xs text-slate-400">
              Batches have passed District Quorum (2/2) and require State Quality validation
            </p>
          </div>
          <span className="text-xs font-mono text-amber-400 bg-amber-950/70 px-2.5 py-0.5 rounded border border-amber-800">
            {qualityQueue.length} In Queue
          </span>
        </div>

        {qualityQueue.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No large batches currently waiting for quality team approval.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Batch Number</th>
                  <th className="px-6 py-3">Course Name</th>
                  <th className="px-6 py-3">Candidate Volume</th>
                  <th className="px-6 py-3">Training Centre</th>
                  <th className="px-6 py-3">District Approvers</th>
                  <th className="px-6 py-3 text-right">Quality Decisions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {qualityQueue.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4 font-mono font-semibold text-white">
                      {batch.batchNumber}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-200">{batch.courseName}</td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-white text-sm">{batch.candidateCount}</span>
                      <span className="ml-2 text-[10px] uppercase font-bold text-amber-400 bg-amber-950 px-1.5 py-0.5 rounded border border-amber-800">
                        Bulk Volume
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{batch.trainingCentre}</td>
                    <td className="px-6 py-4 text-xs">
                      <span className="text-emerald-400 font-mono">Dev & Meera (2/2 Approved)</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedBatchId(batch.id);
                            setActionType('APPROVE');
                          }}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                        >
                          Pass Quality
                        </button>
                        <button
                          onClick={() => {
                            setSelectedBatchId(batch.id);
                            setActionType('RETURN');
                          }}
                          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-semibold border border-slate-700 transition"
                        >
                          Flag Issues
                        </button>
                        <button
                          onClick={() => navigate(`/batches/${batch.id}`)}
                          className="p-1.5 text-slate-400 hover:text-white transition"
                          title="Inspect Roster"
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

      {/* Quality Modal with Interactive Checklist */}
      <Modal
        isOpen={selectedBatchId !== null}
        onClose={() => {
          setSelectedBatchId(null);
          setActionType(null);
        }}
        title={`Quality Audit: ${targetBatch?.batchNumber} (${targetBatch?.candidateCount} Candidates)`}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-lg text-amber-200">
            <strong>State Quality Standard:</strong> For batches exceeding 50 candidates, verify biometric deduplication and clinical/lab assessments before promoting to the State Office.
          </div>

          {/* Interactive Checklist */}
          <div className="space-y-2 bg-slate-800/40 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[11px] font-semibold uppercase text-slate-400">
              Audit Checklist:
            </span>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={checks.attendanceOver80}
                onChange={(e) => setChecks({ ...checks, attendanceOver80: e.target.checked })}
                className="rounded text-emerald-600 focus:ring-0"
              />
              <span>Minimum 80% biometric attendance verified for all trainees</span>
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={checks.labPracticalCrossVerified}
                onChange={(e) => setChecks({ ...checks, labPracticalCrossVerified: e.target.checked })}
                className="rounded text-emerald-600 focus:ring-0"
              />
              <span>Practical skill evaluation scores cross-checked with certified assessor</span>
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={checks.biometricsDeduplicated}
                onChange={(e) => setChecks({ ...checks, biometricsDeduplicated: e.target.checked })}
                className="rounded text-emerald-600 focus:ring-0"
              />
              <span>Deduplicated against state-wide active enrollments (No ghost trainees)</span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Quality Team Audit Remarks:</label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Sample audits conducted on 10 random candidates; biometric logs verified."
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
              onClick={handleQualitySubmit}
              className={`px-4 py-1.5 text-white font-semibold rounded-lg shadow-sm ${
                actionType === 'APPROVE'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              Confirm {actionType === 'APPROVE' ? 'Quality Approval' : 'Return Batch'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
