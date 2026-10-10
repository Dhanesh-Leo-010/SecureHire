import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, homeFor } from './lib/auth';
import { ToastProvider, Spinner } from './components/ui';
import AppShell from './layouts/AppShell';
import Landing from './pages/public/Landing';
import { Login, Register } from './pages/public/Auth';
import VerifyOffer from './pages/public/VerifyOffer';

const CandidateHome = lazy(() => import('./pages/candidate/Dashboard'));
const Apply = lazy(() => import('./pages/candidate/Apply'));
const Identity = lazy(() => import('./pages/candidate/Identity'));
const Resume = lazy(() => import('./pages/candidate/Resume'));
const Assessment = lazy(() => import('./pages/candidate/Assessment'));
const CandidateInterview = lazy(() => import('./pages/candidate/Interview'));
const Offer = lazy(() => import('./pages/candidate/Offer'));
const Onboarding = lazy(() => import('./pages/candidate/Onboarding'));
const Privacy = lazy(() => import('./pages/candidate/Privacy'));
const Overview = lazy(() => import('./pages/recruiter/Overview'));
const Candidates = lazy(() => import('./pages/recruiter/Candidates'));
const CandidateDetail = lazy(() => import('./pages/recruiter/CandidateDetail'));
const ReviewQueue = lazy(() => import('./pages/recruiter/ReviewQueue'));
const LiveMonitor = lazy(() => import('./pages/recruiter/LiveMonitor'));
const RecruiterInterview = lazy(() => import('./pages/recruiter/InterviewRoom'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminAudit = lazy(() => import('./pages/admin/Audit'));

function Guard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

const Loading = () => <div className="flex h-64 items-center justify-center"><Spinner className="h-6 w-6" /></div>;

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify/:id" element={<VerifyOffer />} />
              <Route path="/verify" element={<VerifyOffer />} />
              <Route path="/candidate" element={<Guard roles={['candidate']}><AppShell /></Guard>}>
                <Route index element={<CandidateHome />} />
                <Route path="apply" element={<Apply />} />
                <Route path="identity" element={<Identity />} />
                <Route path="resume" element={<Resume />} />
                <Route path="assessment" element={<Assessment />} />
                <Route path="interview" element={<CandidateInterview />} />
                <Route path="offer" element={<Offer />} />
                <Route path="onboarding" element={<Onboarding />} />
                <Route path="privacy" element={<Privacy />} />
              </Route>
              <Route path="/recruiter" element={<Guard roles={['recruiter', 'admin']}><AppShell /></Guard>}>
                <Route index element={<Overview />} />
                <Route path="candidates" element={<Candidates />} />
                <Route path="candidates/:id" element={<CandidateDetail />} />
                <Route path="review" element={<ReviewQueue />} />
                <Route path="live" element={<LiveMonitor />} />
                <Route path="interview/:id" element={<RecruiterInterview />} />
              </Route>
              <Route path="/admin" element={<Guard roles={['admin']}><AppShell /></Guard>}>
                <Route index element={<AdminSettings />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="audit" element={<AdminAudit />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
