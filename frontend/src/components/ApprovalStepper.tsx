import React from 'react';
import { Batch } from '../types';
import { Check, Clock, AlertTriangle, X } from 'lucide-react';

interface ApprovalStepperProps {
  batch: Batch;
}

export const ApprovalStepper: React.FC<ApprovalStepperProps> = ({ batch }) => {
  const isReturned = batch.status === 'RETURNED';
  const isRejected = batch.status === 'REJECTED';
  const isCompleted = batch.status === 'COMPLETED';

  // District Progress
  const districtDone = ['UNDER_QUALITY_REVIEW', 'UNDER_STATE_REVIEW', 'COMPLETED'].includes(batch.status);
  const districtActive = batch.status === 'UNDER_DISTRICT_REVIEW';
  const districtCount = batch.districtApprovalCount || 0;

  // Quality Progress
  const qualityNeeded = batch.isLargeBatch || batch.candidateCount >= 50;
  const qualityDone = ['UNDER_STATE_REVIEW', 'COMPLETED'].includes(batch.status);
  const qualityActive = batch.status === 'UNDER_QUALITY_REVIEW';

  // State Progress
  const stateDone = isCompleted;
  const stateActive = batch.status === 'UNDER_STATE_REVIEW';

  const steps = [
    {
      name: '1. Training Upload',
      desc: `${batch.candidateCount} Candidates`,
      status: 'completed',
    },
    {
      name: '2. District Quorum',
      desc: districtDone ? 'Approved (2/2)' : districtActive ? `${districtCount}/2 Approvals` : 'Pending',
      status: districtDone ? 'completed' : districtActive ? 'active' : 'upcoming',
    },
    {
      name: '3. Quality Gate',
      desc: !qualityNeeded
        ? 'Bypassed (<50 candidates)'
        : qualityDone
        ? 'Quality Verified'
        : qualityActive
        ? 'Under Scrutiny'
        : 'Pending',
      status: !qualityNeeded ? 'bypassed' : qualityDone ? 'completed' : qualityActive ? 'active' : 'upcoming',
    },
    {
      name: '4. State Sign-off',
      desc: stateDone ? 'Authorized' : stateActive ? 'Awaiting Sign-off' : 'Pending',
      status: stateDone ? 'completed' : stateActive ? 'active' : 'upcoming',
    },
    {
      name: '5. Issuance & WhatsApp',
      desc: isCompleted ? 'Certificates Delivered' : 'Pending Approval',
      status: isCompleted ? 'completed' : 'upcoming',
    },
  ];

  return (
    <div className="w-full bg-slate-900/40 p-5 rounded-xl border border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs uppercase font-semibold tracking-wider text-slate-400">
          Multi-Tier Approval Pipeline Progress
        </h4>
        {isReturned && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-950/70 border border-amber-800 px-2 py-0.5 rounded">
            <AlertTriangle className="w-3.5 h-3.5" /> Returned to Training Centre for correction
          </span>
        )}
        {isRejected && (
          <span className="inline-flex items-center gap-1 text-xs text-rose-400 bg-rose-950/70 border border-rose-800 px-2 py-0.5 rounded">
            <X className="w-3.5 h-3.5" /> Batch Rejected
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {steps.map((step, idx) => {
          let badgeBg = 'bg-slate-800 text-slate-400 border-slate-700';
          let icon = <Clock className="w-4 h-4 text-slate-500" />;

          if (step.status === 'completed') {
            badgeBg = 'bg-emerald-950/80 text-emerald-300 border-emerald-700';
            icon = <Check className="w-4 h-4 text-emerald-400" />;
          } else if (step.status === 'active') {
            badgeBg = 'bg-indigo-950/80 text-indigo-300 border-indigo-700 ring-1 ring-indigo-500';
            icon = <Clock className="w-4 h-4 text-indigo-400 animate-spin" />;
          } else if (step.status === 'bypassed') {
            badgeBg = 'bg-slate-900/60 text-slate-500 border-slate-800 opacity-60';
            icon = <span className="text-xs font-mono">SKIP</span>;
          }

          return (
            <div
              key={idx}
              className={`p-3 rounded-lg border transition ${badgeBg} flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs text-white">{step.name}</span>
                {icon}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{step.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
