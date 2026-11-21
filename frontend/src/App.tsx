import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BatchProvider } from './context/BatchContext';

import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';

import { LoginPage } from './pages/LoginPage';
import { TrainingCentreDashboard } from './pages/TrainingCentreDashboard';
import { BatchCreatePage } from './pages/BatchCreatePage';
import { CandidateUploadPage } from './pages/CandidateUploadPage';
import { BatchTrackingPage } from './pages/BatchTrackingPage';
import { BatchesListPage } from './pages/BatchesListPage';
import { DistrictReviewDashboard } from './pages/DistrictReviewDashboard';
import { QualityReviewDashboard } from './pages/QualityReviewDashboard';
import { StateOfficeDashboard } from './pages/StateOfficeDashboard';
import { CertificateManagementPage } from './pages/CertificateManagementPage';
import { PublicVerifyPage } from './pages/PublicVerifyPage';
import { AuditLogsPage } from './pages/AuditLogsPage';

// Standard Government Portal Layout with Sidebar and Top Navigation
const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

// Directs user to the correct workspace view based on active role
const RoleHomeRedirect: React.FC = () => {
  const { currentUser } = useAuth();
  switch (currentUser.role) {
    case 'TRAINING_CENTRE':
      return <Navigate to="/dashboard" replace />;
    case 'DISTRICT_OFFICER':
      return <Navigate to="/district" replace />;
    case 'QUALITY_TEAM':
      return <Navigate to="/quality" replace />;
    case 'STATE_OFFICE':
      return <Navigate to="/state" replace />;
    default:
      return <Navigate to="/dashboard" replace />;
  }
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BatchProvider>
          <Routes>
            {/* Public Standalone Verification Portal (No login needed) */}
            <Route path="/verify" element={<PublicVerifyPage />} />
            <Route path="/verify/:certificateNumber" element={<PublicVerifyPage />} />

            {/* Standalone Login / Demo Persona Picker */}
            <Route path="/login" element={<LoginPage />} />

            {/* Authenticated Workspace Layout */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<RoleHomeRedirect />} />
              <Route path="/dashboard" element={<TrainingCentreDashboard />} />
              <Route path="/batches/new" element={<BatchCreatePage />} />
              <Route path="/upload" element={<CandidateUploadPage />} />
              <Route path="/batches" element={<BatchesListPage />} />
              <Route path="/batches/:id" element={<BatchTrackingPage />} />
              <Route path="/district" element={<DistrictReviewDashboard />} />
              <Route path="/quality" element={<QualityReviewDashboard />} />
              <Route path="/state" element={<StateOfficeDashboard />} />
              <Route path="/stuck-batches" element={<StateOfficeDashboard />} />
              <Route path="/certificates" element={<CertificateManagementPage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BatchProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
