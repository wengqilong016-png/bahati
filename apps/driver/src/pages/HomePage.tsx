import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function HomePage() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  const [machineCount, setMachineCount] = useState(0);
  const [todayTaskCount, setTodayTaskCount] = useState(0);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [pendingResetCount, setPendingResetCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);

    async function load() {
      const machines = await db.machines.count();
      const tasks = await db.daily_tasks.where('task_date').equals(today).count();
      const syncs = await db.sync_queue.where('retry_count').below(3).count();
      const resets = await db.score_reset_requests
        .where('sync_status')
        .anyOf(['pending', 'syncing'])
        .count();

      if (!cancelled) {
        setMachineCount(machines);
        setTodayTaskCount(tasks);
        setPendingSyncCount(syncs);
        setPendingResetCount(resets);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#0066CC' }}>SmartKiosk</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>Driver Dashboard</p>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
          background: isOnline ? '#e6f4ea' : '#fce8e6',
          color: isOnline ? '#1e7e34' : '#c62828',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#1e7e34' : '#c62828' }} />
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <StatCard label="My Machines" value={machineCount} color="#0066CC" onClick={() => navigate('/machines')} />
        <StatCard label="Today Tasks" value={todayTaskCount} color="#1e7e34" onClick={() => navigate('/machines')} />
        <StatCard label="Pending Sync" value={pendingSyncCount} color={pendingSyncCount > 0 ? '#e65100' : '#999'} onClick={() => navigate('/sync')} />
        <StatCard label="Reset Requests" value={pendingResetCount} color="#7b1fa2" />
      </div>

      {/* Quick actions */}
      <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#333' }}>Quick Actions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ActionButton icon="📋" label="Record Daily Task" subtitle="Select a machine and submit" onClick={() => navigate('/machines')} />
        <ActionButton icon="➕" label="Kiosk Onboarding" subtitle="Register a new machine" onClick={() => navigate('/onboard')} />
        <ActionButton icon="🔄" label="Re-certification" subtitle="Re-certify an existing machine" onClick={() => navigate('/onboard?type=recertification')} />
        <ActionButton icon="📊" label="My Daily Summary" subtitle="View today's work" onClick={() => navigate('/summary')} />
      </div>
    </div>
  );
}

function StatCard({ label, value, color, onClick }: { label: string; value: number; color: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 10,
        padding: 16,
        border: '1px solid #e0e0e0',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color }}>{value}</p>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>{label}</p>
    </div>
  );
}

function ActionButton({ icon, label, subtitle, onClick }: { icon: string; label: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10,
        padding: '14px 16px', cursor: 'pointer', textAlign: 'left', width: '100%',
      }}
    >
      <span style={{ fontSize: 24 }}>{icon}</span>
      <div>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#666' }}>{subtitle}</p>
      </div>
    </button>
  );
}
