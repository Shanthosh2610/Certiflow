import React, { useState } from 'react';
import { useBatch } from '../context/BatchContext';
import { useNavigate, Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import {
  FolderKanban,
  Search,
  Eye,
  Plus,
  Filter,
  CheckCircle2,
  Clock
} from 'lucide-react';

export const BatchesListPage: React.FC = () => {
  const { batches } = useBatch();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredBatches = batches.filter((b) => {
    const matchesSearch =
      b.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.district.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-emerald-400" />
            Training Batches Tracking Registry
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time status tracking across Training, District, Quality, and State Office review tiers.
          </p>
        </div>

        <Link
          to="/batches/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Batch</span>
        </Link>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 border border-slate-800 rounded-xl">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Batch Number, Course, or District..."
            className="w-full bg-slate-800 border border-slate-700 text-white pl-9 pr-3 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none"
          >
            <option value="ALL">All Statuses ({batches.length})</option>
            <option value="DRAFT">Draft</option>
            <option value="UNDER_DISTRICT_REVIEW">District Review</option>
            <option value="UNDER_QUALITY_REVIEW">Quality Review</option>
            <option value="UNDER_STATE_REVIEW">State Review</option>
            <option value="COMPLETED">Completed</option>
            <option value="RETURNED">Returned</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Batches Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Batch Number</th>
                <th className="px-6 py-3">Course Name</th>
                <th className="px-6 py-3">Candidates</th>
                <th className="px-6 py-3">District</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Stage Progress</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredBatches.map((batch) => (
                <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-6 py-4 font-mono font-semibold text-white">
                    {batch.batchNumber}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-200">
                    {batch.courseName}
                  </td>
                  <td className="px-6 py-4 font-bold text-white">
                    {batch.candidateCount}
                    {batch.isLargeBatch && (
                      <span className="ml-1.5 text-[10px] text-amber-400 bg-amber-950 px-1 py-0.5 rounded border border-amber-800">
                        &gt;50 Large
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{batch.district}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-6 py-4">
                    {batch.status === 'UNDER_DISTRICT_REVIEW' && (
                      <span className="text-indigo-400 font-mono">
                        District: {batch.districtApprovalCount}/2 approvals
                      </span>
                    )}
                    {batch.status === 'UNDER_QUALITY_REVIEW' && (
                      <span className="text-amber-400 font-mono">Quality team check</span>
                    )}
                    {batch.status === 'UNDER_STATE_REVIEW' && (
                      <span className="text-purple-400 font-mono">State final approval</span>
                    )}
                    {batch.status === 'COMPLETED' && (
                      <span className="text-emerald-400 font-medium">Issued & Verified</span>
                    )}
                    {batch.status === 'RETURNED' && (
                      <span className="text-amber-400 font-medium">Returned for fix</span>
                    )}
                    {batch.status === 'DRAFT' && (
                      <span className="text-slate-500 font-mono">Draft</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => navigate(`/batches/${batch.id}`)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Details</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
