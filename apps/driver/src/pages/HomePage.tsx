import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { processQueue } from '../lib/sync';

interface HomePageProps {
  driverId: string;
}

export default function HomePage({ driverId }: HomePageProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncedToday, setSyncedToday] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const pending = await db.sync_queue.count();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tasks = await db.tasks
        .where('driver_id')
        .equals(driverId)
        .and((t) => t.created_at >= todayStart.toISOString())
        .count();

      if (!cancelled) {
        setPendingCount(pending);
        setSyncedToday(tasks);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [driverId]);

  async function handleSync() {
    setSyncing(true);
    try {
      await processQueue();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
      // Refresh counts after sync
      const pending = await db.sync_queue.count();
      setPendingCount(pending);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>首页</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: '#f0f9ff',
            padding: 16,
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 'bold' }}>{pendingCount}</div>
          <div style={{ color: '#666' }}>待同步</div>
        </div>
        <div
          style={{
            background: '#f0fdf4',
            padding: 16,
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 'bold' }}>{syncedToday}</div>
          <div style={{ color: '#666' }}>今日任务</div>
        </div>
      </div>

      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          width: '100%',
          padding: 12,
          background: syncing ? '#ccc' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          cursor: syncing ? 'default' : 'pointer',
          marginBottom: 16,
        }}
      >
        {syncing ? '同步中…' : '立即同步'}
      </button>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <a href="/onboarding" style={navStyle}>
          机器入网 / 重新认证
        </a>
        <a href="/tasks" style={navStyle}>
          日常任务
        </a>
        <a href="/reset" style={navStyle}>
          分数重置申请
        </a>
        <a href="/pending" style={navStyle}>
          待同步列表
        </a>
        <a href="/summary" style={navStyle}>
          我的日结
        </a>
      </nav>
    </div>
  );
}

const navStyle: React.CSSProperties = {
  display: 'block',
  padding: 14,
  background: '#f8fafc',
  borderRadius: 8,
  textDecoration: 'none',
  color: '#1e293b',
  border: '1px solid #e2e8f0',
  textAlign: 'center',
  fontSize: 16,
};
