import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { NavBar } from './components/NavBar';
import { UpdateBanner } from './components/UpdateBanner';
import { LoginPage } from './pages/LoginPage';

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const KioskListPage = lazy(() => import('./pages/KioskListPage').then(m => ({ default: m.KioskListPage })));
const DailyTaskPage = lazy(() => import('./pages/DailyTaskPage').then(m => ({ default: m.DailyTaskPage })));
const ScoreResetPage = lazy(() => import('./pages/ScoreResetPage').then(m => ({ default: m.ScoreResetPage })));
const OnboardKioskPage = lazy(() => import('./pages/OnboardKioskPage').then(m => ({ default: m.OnboardKioskPage })));
const SummaryPage = lazy(() => import('./pages/SummaryPage').then(m => ({ default: m.SummaryPage })));
const PendingSyncPage = lazy(() => import('./pages/PendingSyncPage').then(m => ({ default: m.PendingSyncPage })));
const SettlementPage = lazy(() => import('./pages/SettlementPage').then(m => ({ default: m.SettlementPage })));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage').then(m => ({ default: m.ReconciliationPage })));

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <span style={{ color: '#0066CC', fontSize: 16 }}>Loading...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <UpdateBanner />
      {children}
      <NavBar />
    </div>
  );
}

const PageSpinner = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
    <span style={{ color: '#0066CC', fontSize: 16 }}>Loading...</span>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/home"
          element={
            <ProtectedLayout>
              <HomePage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/kiosks"
          element={
            <ProtectedLayout>
              <KioskListPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/kiosks/:kioskId/task"
          element={
            <ProtectedLayout>
              <DailyTaskPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/kiosks/:kioskId/score-reset"
          element={
            <ProtectedLayout>
              <ScoreResetPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/onboard"
          element={
            <ProtectedLayout>
              <OnboardKioskPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/summary"
          element={
            <ProtectedLayout>
              <SummaryPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/sync"
          element={
            <ProtectedLayout>
              <PendingSyncPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/settlement"
          element={
            <ProtectedLayout>
              <SettlementPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/reconciliation"
          element={
            <ProtectedLayout>
              <ReconciliationPage />
            </ProtectedLayout>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
