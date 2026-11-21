import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, History, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuditHistoryEntry, getAuditHistoryApi } from '../api/audit';

const stateValue = (value: unknown) =>
  value === null || value === undefined || value === '' ? '—' : String(value);

export const AuditLogsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [logs, setLogs] = useState<AuditHistoryEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    getAuditHistoryApi(currentUser.email)
      .then((history) => {
        if (active) setLogs(history);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load audit history.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentUser.email]);

  const filteredLogs = useMemo(() => logs.filter((log) => {
    const details = log.details || {};
    const matchesSearch = [
      log.action,
      log.user?.name || '',
      log.entityId,
      stateValue(details.batchNumber),
    ].some((value) => value.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch && (filterType === 'ALL' || log.entityType === filterType);
  }), [filterType, logs, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-indigo-400" />
            System Audit History
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Persisted actions with actor, affected entity, timestamp, and state changes.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 border border-slate-800 rounded-xl">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search action, actor, batch, or certificate..."
            className="w-full bg-slate-800 border border-slate-700 text-white pl-9 pr-3 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400">Entity:</span>
          <select
            value={filterType}
            onChange={(event) => setFilterType(event.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none"
          >
            <option value="ALL">All Entities ({logs.length})</option>
            <option value="BATCH">Batch Actions</option>
            <option value="APPROVAL">Approval Decisions</option>
            <option value="CERTIFICATE">Certificate Events</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-950/50 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 uppercase text-[10px] tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Affected Entity</th>
                <th className="px-4 py-3">Previous State</th>
                <th className="px-4 py-3">New State</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {!isLoading && filteredLogs.map((log) => {
                const details = log.details || {};
                const affectedEntity = stateValue(details.batchNumber) === '—'
                  ? log.entityId
                  : `${details.batchNumber} (${log.entityId})`;
                return (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3.5 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-white">{log.user?.name || 'Unknown user'}</div>
                      <div className="text-[10px] text-slate-500">{log.user?.role || 'Unattributed'}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-slate-200">{affectedEntity}</div>
                      <div className="text-[10px] text-slate-500">{log.entityType}</div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-slate-400">
                      {stateValue(details.previousState)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-emerald-400">
                      {stateValue(details.newState)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                      {JSON.stringify(details)}
                    </td>
                  </tr>
                );
              })}
              {isLoading && (
                <tr><td className="px-6 py-10 text-center text-slate-500" colSpan={7}>Loading audit history…</td></tr>
              )}
              {!isLoading && !error && filteredLogs.length === 0 && (
                <tr><td className="px-6 py-10 text-center text-slate-500" colSpan={7}>No matching audit records.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
