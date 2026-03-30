import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SyncStatusHeader from './components/SyncStatusHeader';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import OnboardingPage from './pages/OnboardingPage';
import TaskPage from './pages/TaskPage';
import ResetRequestPage from './pages/ResetRequestPage';
import PendingSyncPage from './pages/PendingSyncPage';
import SummaryPage from './pages/SummaryPage';
import { startSyncInterval } from './lib/sync';

function App() {
  const [driverId, setDriverId] = useState<string | null>(
    () => localStorage.getItem('driver_id'),
  );
  const [driverPhone, setDriverPhone] = useState<string | null>(
    () => localStorage.getItem('driver_phone'),
  );

  function handleLogin(id: string, phone: string) {
    localStorage.setItem('driver_id', id);
    localStorage.setItem('driver_phone', phone);
    setDriverId(id);
    setDriverPhone(phone);
  }

  function handleLogout() {
    localStorage.removeItem('driver_id');
    localStorage.removeItem('driver_phone');
    setDriverId(null);
    setDriverPhone(null);
  }

  // Start background sync when logged in
  useEffect(() => {
    if (!driverId) return;
    const stop = startSyncInterval(30_000);
    return stop;
  }, [driverId]);

  if (!driverId) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <SyncStatusHeader />
      <div style={{ padding: '0 0 80px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 16px',
            borderBottom: '1px solid #e2e8f0',
            fontSize: 13,
            color: '#666',
          }}
        >
          <span>{driverPhone}</span>
          <button
            onClick={handleLogout}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            退出
          </button>
        </div>

        <Routes>
          <Route path="/" element={<HomePage driverId={driverId} />} />
          <Route
            path="/onboarding"
            element={<OnboardingPage driverId={driverId} />}
          />
          <Route path="/tasks" element={<TaskPage driverId={driverId} />} />
          <Route
            path="/reset"
            element={<ResetRequestPage driverId={driverId} />}
          />
          <Route path="/pending" element={<PendingSyncPage />} />
          <Route
            path="/summary"
            element={<SummaryPage driverId={driverId} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
