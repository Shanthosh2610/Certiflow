import React from 'react';
import { useBatch } from '../context/BatchContext';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import {
  FolderKanban,
  Clock,
  AlertTriangle,
  Award,
  Plus,
  FileSpreadsheet,
  ArrowRight,
  Eye,
  CheckCircle2
} from 'lucide-react';

export const TrainingCentreDashboard: React.FC = () => {
  const { batches } = useBatch();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Metrics for Training Centre
  const totalBatches = batches.length;
  const inReviewBatches = batches.filter((b) =>
    ['UNDER_DISTRICT_REVIEW', 'UNDER_QUALITY_REVIEW', 'UNDER_STATE_REVIEW'].includes(b.status)
  ).length;
  const returnedBatches = batches.filter((b) => b.status === 'RETURNED');
  const completedBatches = batches.filter((b) => b.status === 'COMPLETED').length;

  const totalCandidates = batches.reduce((acc, b) => acc + b.candidateCount, 0);

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Training Centre Command Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Logged in as <span className="text-emerald-400 font-semibold">{currentUser.name}</span> &bull; {currentUser.trainingCentre || 'Apex Skilling Hub'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/batches/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Batch</span>
          </Link>
          <Link
            to="/upload"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Upload Candidates</span>
          </Link>
        </div>
      </div>

      {/* Returned Batch Alert Box (Critical Edge Case Requirement) */}
      {returnedBatches.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-600/50 rounded-xl p-4 text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-semibold text-sm text-amber-300">
                Action Required: {returnedBatches.length} Batch(es) Returned by Reviewing Officer
              </h3>
              <p className="text-xs text-amber-200/80">
                District or Quality officers have requested corrections. Update candidate data and resubmit the batch.
              </p>
              <div className="pt-2 flex flex-wrap gap-2">
                {returnedBatches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => navigate(`/batches/${b.id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 text-xs rounded-lg border border-amber-700/60 font-medium transition"
                  >
                    <span>Fix {b.batchNumber}: "{b.returnReason}"</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Batches"
          value={totalBatches}
          subtitle="Managed in centre"
          icon={FolderKanban}
          color="indigo"
        />
        <StatCard
          title="Under Review"
          value={inReviewBatches}
          subtitle="District / Quality / State"
          icon={Clock}
          color="blue"
        />
        <StatCard
          title="Returned / Action"
          value={returnedBatches.length}
          subtitle="Requires correction"
          icon={AlertTriangle}
          color={returnedBatches.length > 0 ? 'amber' : 'emerald'}
        />
        <StatCard
          title="Certified & Issued"
          value={completedBatches}
          subtitle={`${totalCandidates} total candidates`}
          icon={Award}
          color="emerald"
        />
      </div>

      {/* Batches Table Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm text-white">Batches Lifecycle Status</h2>
            <p className="text-xs text-slate-400">Track real-time approval stages across all departments</p>
          </div>
          <Link to="/batches" className="text-xs text-emerald-400 hover:underline font-medium">
            View All ({batches.length})
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Batch Number</th>
                <th className="px-6 py-3">Course Name</th>
                <th className="px-6 py-3">Candidates</th>
                <th className="px-6 py-3">District</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Approvals Progress</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {batches.map((batch) => {
                const isOver50 = batch.isLargeBatch || batch.candidateCount >= 50;
                return (
                  <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-6 py-4 font-mono font-semibold text-white">
                      {batch.batchNumber}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-200">
                      {batch.courseName}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-white">{batch.candidateCount}</span>
                      {isOver50 && (
                        <span className="ml-1.5 text-[10px] font-bold text-amber-400 bg-amber-950/80 border border-amber-800 px-1.5 py-0.5 rounded">
                          &gt;50 Large
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400">{batch.district}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={batch.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs">
                        {batch.status === 'UNDER_DISTRICT_REVIEW' && (
                          <span className="text-indigo-400 font-mono">
                            District: {batch.districtApprovalCount}/2 approved
                          </span>
                        )}
                        {batch.status === 'UNDER_QUALITY_REVIEW' && (
                          <span className="text-amber-400 font-mono">Quality team review</span>
                        )}
                        {batch.status === 'UNDER_STATE_REVIEW' && (
                          <span className="text-purple-400 font-mono">Awaiting Farah (State)</span>
                        )}
                        {batch.status === 'COMPLETED' && (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Certificates Generated
                          </span>
                        )}
                        {batch.status === 'RETURNED' && (
                          <span className="text-amber-400 font-medium truncate block max-w-xs">
                            Reason: {batch.returnReason}
                          </span>
                        )}
                        {batch.status === 'DRAFT' && (
                          <span className="text-slate-500 font-mono">Not submitted</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => navigate(`/batches/${batch.id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Manage</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
