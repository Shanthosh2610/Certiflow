import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Building, Award, CheckCircle2, UserCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { allUsers, loginAs, currentUser } = useAuth();
  const navigate = useNavigate();

  const handleSelectUser = (userId: string, role: string) => {
    loginAs(userId);
    if (role === 'TRAINING_CENTRE') navigate('/dashboard');
    else if (role === 'DISTRICT_OFFICER') navigate('/district');
    else if (role === 'QUALITY_TEAM') navigate('/quality');
    else if (role === 'STATE_OFFICE') navigate('/state');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 mb-2">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            CertiFlow Portal Login
          </h1>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            State Skilling Certificate Issuance & Public Verification System.
            Select a verified persona below for evaluation.
          </p>
        </div>

        {/* Demo Personas Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allUsers.map((user) => {
            const isSelected = user.id === currentUser.id;
            const roleBadgeColor = {
              TRAINING_CENTRE: 'text-emerald-400 bg-emerald-950/60 border-emerald-800',
              DISTRICT_OFFICER: 'text-sky-400 bg-sky-950/60 border-sky-800',
              QUALITY_TEAM: 'text-amber-400 bg-amber-950/60 border-amber-800',
              STATE_OFFICE: 'text-purple-400 bg-purple-950/60 border-purple-800',
            }[user.role];

            const description = {
              'user-anika': 'Uploads candidate spreadsheets, fixes returned batches, tracks certification.',
              'user-dev': '1st District Approver (Bhopal). Reviews lab logs & candidate credentials.',
              'user-meera': '2nd District Approver (Bhopal). Satisfies district quorum (2 required).',
              'user-kabir': 'District Officer for Indore district batches.',
              'user-neha': 'Quality Control Gatekeeper for batches exceeding 50 candidates.',
              'user-farah': 'State Director. Final authorization, certificate cancellation, and SLA monitoring.',
            }[user.id];

            return (
              <div
                key={user.id}
                onClick={() => handleSelectUser(user.id, user.role)}
                className={`p-5 rounded-xl border cursor-pointer transition flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-slate-900 border-emerald-500 shadow-lg ring-1 ring-emerald-500'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${roleBadgeColor}`}>
                      {user.role.replace('_', ' ')}
                    </span>
                    {isSelected && (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Active
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition">
                    {user.name}
                  </h3>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{user.email}</div>
                  <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">{description}</p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-medium text-emerald-400 group-hover:translate-x-0.5 transition">
                  <span>Enter as {user.name.split(' ')[0]}</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Public Portal Banner */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Public Certificate Verification Portal</h4>
              <p className="text-xs text-slate-400">
                Employers and citizens can verify certificates without signing in.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/verify')}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold border border-slate-700 transition"
          >
            Open Public Portal
          </button>
        </div>

      </div>
    </div>
  );
};
