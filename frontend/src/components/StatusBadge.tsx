import React from 'react';
import { BatchStatus, CertificateStatus } from '../types';

interface StatusBadgeProps {
  status: BatchStatus | CertificateStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'DRAFT':
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
          dot: 'bg-slate-400',
          label: 'Draft',
        };
      case 'SUBMITTED':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800',
          dot: 'bg-blue-500',
          label: 'Submitted',
        };
      case 'UNDER_DISTRICT_REVIEW':
        return {
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800',
          dot: 'bg-indigo-500 animate-pulse',
          label: 'District Review',
        };
      case 'UNDER_QUALITY_REVIEW':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
          dot: 'bg-amber-500 animate-pulse',
          label: 'Quality Scrutiny (>50)',
        };
      case 'UNDER_STATE_REVIEW':
        return {
          bg: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800',
          dot: 'bg-purple-500 animate-pulse',
          label: 'State Office Final',
        };
      case 'APPROVED':
      case 'COMPLETED':
      case 'ACTIVE':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
          dot: 'bg-emerald-500',
          label: status === 'ACTIVE' ? 'Active & Valid' : 'Completed / Issued',
        };
      case 'RETURNED':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700',
          dot: 'bg-amber-600',
          label: 'Returned for Correction',
        };
      case 'REJECTED':
      case 'REVOKED':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
          dot: 'bg-rose-500',
          label: status === 'REVOKED' ? 'Revoked / Invalid' : 'Rejected',
        };
      case 'QUEUED':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
          dot: 'bg-amber-500',
          label: 'Pending',
        };
      case 'SENDING':
        return {
          bg: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800',
          dot: 'bg-sky-500 animate-pulse',
          label: 'Sending',
        };
      case 'RETRYING':
        return {
          bg: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-800',
          dot: 'bg-orange-500 animate-pulse',
          label: 'Retrying',
        };
      case 'DELIVERED':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
          dot: 'bg-emerald-500',
          label: 'Delivered',
        };
      case 'FAILED':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
          dot: 'bg-rose-500',
          label: 'Failed',
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          dot: 'bg-slate-400',
          label: status,
        };
    }
  };

  const { bg, dot, label } = getBadgeConfig();
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${bg} ${sizeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
};
