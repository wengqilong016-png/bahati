import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { NavBar } from './components/NavBar';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { MachineListPage } from './pages/MachineListPage';
import { DailyTaskPage } from './pages/DailyTaskPage';
import { ScoreResetPage } from './pages/ScoreResetPage';
import { OnboardMachinePage } from './pages/OnboardMachinePage';
import { SummaryPage } from './pages/SummaryPage';
import { PendingSyncPage } from './pages/PendingSyncPage';

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
      {children}
      <NavBar />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
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
          path="/machines"
          element={
            <ProtectedLayout>
              <MachineListPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/machines/:machineId/task"
          element={
            <ProtectedLayout>
              <DailyTaskPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/machines/:machineId/score-reset"
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
              <OnboardMachinePage />
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
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
