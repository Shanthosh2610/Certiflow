import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, UserCheck, ExternalLink, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const { currentUser, allUsers, loginAs } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800">
      <div className="flex items-center justify-between px-6 py-3">
        
        {/* Brand / Emblem */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">CertiFlow</span>
                <span className="text-[10px] uppercase font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full">
                  Gov Skilling
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                State Skill Mission Certificate Issuance & Verification System
              </p>
            </div>
          </Link>
        </div>

        {/* Center / Right: Demo Persona Switcher (Crucial for Judges) */}
        <div className="flex items-center gap-4">
          
          {/* Quick Role Switcher Tray */}
          <div className="hidden lg:flex items-center gap-1.5 bg-slate-800/60 p-1 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 px-2 font-medium flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Switch Role:
            </span>
            {allUsers.map((u) => {
              const isActive = u.id === currentUser.id;
              const shortRole = {
                TRAINING_CENTRE: 'Training (Anika)',
                DISTRICT_OFFICER: u.name === 'Dev Verma' ? 'Dev (Bhopal)' : u.name === 'Meera Patel' ? 'Meera (Bhopal)' : 'Kabir (Indore)',
                QUALITY_TEAM: 'Quality (Neha)',
                STATE_OFFICE: 'State (Farah)',
              }[u.role];

              return (
                <button
                  key={u.id}
                  onClick={() => loginAs(u.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition font-medium ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                  title={`${u.name} - ${u.role}`}
                >
                  {shortRole}
                </button>
              );
            })}
          </div>

          {/* Mobile/Compact User Selector */}
          <div className="relative lg:hidden">
            <select
              value={currentUser.id}
              onChange={(e) => loginAs(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>

          {/* Public Portal Shortcut Link */}
          <Link
            to="/verify"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition"
          >
            <span>Public Verify</span>
            <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
          </Link>

          {/* Active Profile Pill */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
              {currentUser.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-white leading-tight">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-emerald-400 font-medium">
                {currentUser.role.replace('_', ' ')} {currentUser.district ? `(${currentUser.district})` : ''}
              </div>
            </div>
          </div>

        </div>

      </div>
    </header>
  );
};
