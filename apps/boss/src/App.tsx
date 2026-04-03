import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { NavSidebar } from './components/NavSidebar';
import { ToastProvider } from './components/Toast';
import { LoginPage } from './pages/LoginPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const DriversPage = lazy(() => import('./pages/DriversPage').then(m => ({ default: m.DriversPage })));
const MerchantsPage = lazy(() => import('./pages/MerchantsPage').then(m => ({ default: m.MerchantsPage })));
const KiosksPage = lazy(() => import('./pages/KiosksPage').then(m => ({ default: m.KiosksPage })));
const ScoreResetApprovalsPage = lazy(() => import('./pages/ScoreResetApprovalsPage').then(m => ({ default: m.ScoreResetApprovalsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const MapOverviewPage = lazy(() => import('./pages/MapOverviewPage').then(m => ({ default: m.MapOverviewPage })));
const SettlementsPage = lazy(() => import('./pages/SettlementsPage').then(m => ({ default: m.SettlementsPage })));
const DriverLedgerPage = lazy(() => import('./pages/DriverLedgerPage').then(m => ({ default: m.DriverLedgerPage })));
const MerchantLedgerPage = lazy(() => import('./pages/MerchantLedgerPage').then(m => ({ default: m.MerchantLedgerPage })));

function AnimatedPage({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-fade-in">
      {children}
    </div>
  );
}

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
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f5f5' }}>
      <NavSidebar />
      <main style={{ flex: 1, overflow: 'auto', paddingBottom: 70 }} className="boss-main-content">
        {children}
      </main>
      {/* On mobile, bottom nav padding handled by paddingBottom above */}
      <style>{`
        @media (min-width: 769px) {
          .boss-main-content { padding-bottom: 0 !important; }
        }
      `}</style>
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
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<ProtectedLayout><AnimatedPage><DashboardPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="/drivers" element={<ProtectedLayout><AnimatedPage><DriversPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="/merchants" element={<ProtectedLayout><AnimatedPage><MerchantsPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="/kiosks" element={<ProtectedLayout><AnimatedPage><KiosksPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="/approvals" element={<ProtectedLayout><AnimatedPage><ScoreResetApprovalsPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="/reports" element={<ProtectedLayout><AnimatedPage><ReportsPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="/map" element={<ProtectedLayout><AnimatedPage><MapOverviewPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="/settlements" element={<ProtectedLayout><AnimatedPage><SettlementsPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="/ledger/drivers" element={<ProtectedLayout><AnimatedPage><DriverLedgerPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="/ledger/merchants" element={<ProtectedLayout><AnimatedPage><MerchantLedgerPage /></AnimatedPage></ProtectedLayout>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}
