import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  PlusCircle,
  FileSpreadsheet,
  CheckSquare,
  Award,
  ShieldAlert,
  History,
  Search,
  Building2,
  FolderKanban,
  FileText
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { currentUser } = useAuth();
  const role = currentUser.role;

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
      isActive
        ? 'bg-emerald-600 text-white shadow-sm font-semibold'
        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
    }`;

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 min-h-[calc(100vh-61px)]">
      <div className="space-y-6">
        
        {/* User Role Card */}
        <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-xl">
          <div className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">
            Active Workspace
          </div>
          <div className="font-semibold text-sm text-white mt-1 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-emerald-400" />
            {role.replace('_', ' ')}
          </div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">
            {currentUser.trainingCentre || currentUser.district || 'State Skill Authority HQ'}
          </div>
        </div>

        {/* Section 1: Role-Specific Navigation */}
        <div className="space-y-1">
          <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Workspace Menus
          </div>

          {/* Anika: Training Centre */}
          {role === 'TRAINING_CENTRE' && (
            <>
              <NavLink to="/dashboard" className={navClass}>
                <LayoutDashboard className="w-4 h-4" />
                <span>Centre Dashboard</span>
              </NavLink>
              <NavLink to="/batches/new" className={navClass}>
                <PlusCircle className="w-4 h-4" />
                <span>Create New Batch</span>
              </NavLink>
              <NavLink to="/upload" className={navClass}>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Upload Candidates CSV</span>
              </NavLink>
              <NavLink to="/batches" className={navClass}>
                <FolderKanban className="w-4 h-4" />
                <span>Track Batches</span>
              </NavLink>
            </>
          )}

          {/* Dev, Meera, Kabir: District Officers */}
          {role === 'DISTRICT_OFFICER' && (
            <>
              <NavLink to="/district" className={navClass}>
                <LayoutDashboard className="w-4 h-4" />
                <span>District Review Console</span>
              </NavLink>
              <NavLink to="/batches" className={navClass}>
                <CheckSquare className="w-4 h-4" />
                <span>Pending District Batches</span>
              </NavLink>
            </>
          )}

          {/* Neha: Quality Team */}
          {role === 'QUALITY_TEAM' && (
            <>
              <NavLink to="/quality" className={navClass}>
                <LayoutDashboard className="w-4 h-4" />
                <span>Quality Gate (&gt;50 Batches)</span>
              </NavLink>
              <NavLink to="/batches" className={navClass}>
                <FolderKanban className="w-4 h-4" />
                <span>All Candidate Batches</span>
              </NavLink>
            </>
          )}

          {/* Farah: State Office */}
          {role === 'STATE_OFFICE' && (
            <>
              <NavLink to="/state" className={navClass}>
                <LayoutDashboard className="w-4 h-4" />
                <span>State Command Center</span>
              </NavLink>
              <NavLink to="/batches" className={navClass}>
                <CheckSquare className="w-4 h-4" />
                <span>Final Sign-off Queue</span>
              </NavLink>
              <NavLink to="/certificates" className={navClass}>
                <Award className="w-4 h-4" />
                <span>Certificate Registry & Revoke</span>
              </NavLink>
              <NavLink to="/stuck-batches" className={navClass}>
                <ShieldAlert className="w-4 h-4" />
                <span>Stuck Batches SLA Monitor</span>
              </NavLink>
              <NavLink to="/audit-logs" className={navClass}>
                <History className="w-4 h-4" />
                <span>System Audit Logs</span>
              </NavLink>
            </>
          )}
        </div>

        {/* Section 2: Universal / Public Portals */}
        <div className="space-y-1 pt-4 border-t border-slate-800">
          <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Verification & Tools
          </div>
          <NavLink to="/certificates" className={navClass}>
            <Award className="w-4 h-4" />
            <span>All Certificates</span>
          </NavLink>
          <NavLink to="/verify" className={navClass}>
            <Search className="w-4 h-4" />
            <span>Public Certificate Verify</span>
          </NavLink>
          <NavLink to="/login" className={navClass}>
            <FileText className="w-4 h-4" />
            <span>Switch / Demo Login</span>
          </NavLink>
        </div>

      </div>

      {/* Footer System Indicator */}
      <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
        <span>CertiFlow v1.0.0</span>
        <span className="inline-flex items-center gap-1 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Ready
        </span>
      </div>
    </aside>
  );
};
