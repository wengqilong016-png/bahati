import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { NavSidebar } from './components/NavSidebar';
import { ToastProvider } from './components/Toast';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DriversPage } from './pages/DriversPage';
import { MerchantsPage } from './pages/MerchantsPage';
import { KiosksPage } from './pages/KiosksPage';
import { ScoreResetApprovalsPage } from './pages/ScoreResetApprovalsPage';
import { ReportsPage } from './pages/ReportsPage';
import { MapOverviewPage } from './pages/MapOverviewPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { DriverLedgerPage } from './pages/DriverLedgerPage';
import { MerchantLedgerPage } from './pages/MerchantLedgerPage';

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

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </ToastProvider>
  );
}
