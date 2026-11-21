import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  PublicCertificateVerification,
  verifyCertificateApi,
} from '../api/certificates';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const PublicVerifyPage: React.FC = () => {
  const { certificateNumber } = useParams<{ certificateNumber: string }>();
  const [query, setQuery] = useState(certificateNumber || '');
  const [result, setResult] = useState<PublicCertificateVerification | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const performSearch = async (value: string) => {
    const certificateId = value.trim();
    if (!certificateId) return;

    setQuery(certificateId);
    setHasSearched(true);
    setIsLoading(true);
    setSearchError(null);
    setResult(null);

    try {
      setResult(await verifyCertificateApi(certificateId));
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : 'Unable to verify this certificate right now.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (certificateNumber) {
      setQuery(certificateNumber);
      void performSearch(certificateNumber);
    }
  }, [certificateNumber]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void performSearch(query);
  };

  const isCancelled = result?.status === 'CANCELLED';
  const isInvalid = result?.status === 'INVALID';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="text-center space-y-2 border-b border-slate-800 pb-6">
          <div className="inline-flex p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 mb-2">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Certificate Verification
          </h1>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            Verify a certificate ID or open the verification link from its QR code. No login is required.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Enter certificate ID"
              aria-label="Certificate ID"
              className="w-full bg-slate-900 border border-slate-700 text-white font-mono pl-11 pr-4 py-2.5 text-sm rounded-xl focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm transition"
          >
            {isLoading ? 'Checking...' : 'Verify'}
          </button>
        </form>

        {searchError && (
          <div role="alert" className="p-5 text-center bg-slate-900/60 border border-amber-800 rounded-2xl">
            <ShieldAlert className="w-9 h-9 text-amber-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white">Verification unavailable</p>
            <p className="text-xs text-slate-400 mt-1">{searchError}</p>
          </div>
        )}

        {hasSearched && !isLoading && !searchError && (
          isInvalid ? (
            <div className="p-8 text-center bg-slate-900/60 border border-rose-900 rounded-2xl space-y-3">
              <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
              <h2 className="text-lg font-bold text-white">Invalid certificate</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No certificate with this ID exists in the official registry.
              </p>
            </div>
          ) : result && (
            <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className={`p-6 text-center ${
                isCancelled
                  ? 'bg-rose-950/70 border-b border-rose-800'
                  : 'bg-emerald-950/70 border-b border-emerald-800'
              }`}>
                <div className="inline-flex p-3 rounded-full mb-2 bg-slate-900/80 border border-slate-700">
                  {isCancelled ? (
                    <ShieldAlert className="w-10 h-10 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  )}
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white">
                  {isCancelled ? 'CERTIFICATE CANCELLED' : 'CERTIFICATE VALID'}
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  {isCancelled
                    ? 'This certificate is no longer valid.'
                    : 'This certificate is present in the official registry.'}
                </p>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Certificate ID
                    </span>
                    <div className="font-mono font-bold text-emerald-400 text-sm mt-1 break-all">
                      {result.certificateNumber}
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Candidate
                    </span>
                    <div className="font-bold text-white text-base mt-1">{result.candidateName}</div>
                  </div>
                  <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Course
                    </span>
                    <div className="font-semibold text-slate-200 mt-1">{result.courseName}</div>
                  </div>
                  <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Training Centre
                    </span>
                    <div className="font-semibold text-slate-300 mt-1 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      {result.trainingCentre}
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Course Completion
                    </span>
                    <div className="font-semibold text-slate-300 mt-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {result.completionDate && new Date(result.completionDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Issued
                    </span>
                    <div className="font-semibold text-slate-300 mt-1">
                      {result.issuedAt && new Date(result.issuedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <a
                      href={`${API_BASE}/api/certificates/${encodeURIComponent(result.certificateNumber)}/download`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                    >
                      <Award className="w-4 h-4" />
                      <span>Download Certificate</span>
                    </a>
                    <button
                      onClick={() => window.print()}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 transition"
                    >
                      Print
                    </button>
                  </div>
                  <Link to="/verify" className="text-xs text-slate-400 hover:text-white transition">
                    Verify another certificate
                  </Link>
                </div>
              </div>
            </section>
          )
        )}

        {!hasSearched && (
          <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-xs text-slate-400">
            Enter a certificate ID or scan its QR verification URL to check its current status.
          </div>
        )}
      </div>
    </div>
  );
};
