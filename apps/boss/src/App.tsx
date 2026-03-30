import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { NavSidebar } from './components/NavSidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MachinesPage } from './pages/MachinesPage';
import { ScoreResetApprovalsPage } from './pages/ScoreResetApprovalsPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { DriverLedgerPage } from './pages/DriverLedgerPage';
import { MerchantLedgerPage } from './pages/MerchantLedgerPage';

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
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedLayout>
              <DashboardPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/machines"
          element={
            <ProtectedLayout>
              <MachinesPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/approvals"
          element={
            <ProtectedLayout>
              <ScoreResetApprovalsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/settlements"
          element={
            <ProtectedLayout>
              <SettlementsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/ledger/drivers"
          element={
            <ProtectedLayout>
              <DriverLedgerPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/ledger/merchants"
          element={
            <ProtectedLayout>
              <MerchantLedgerPage />
            </ProtectedLayout>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
