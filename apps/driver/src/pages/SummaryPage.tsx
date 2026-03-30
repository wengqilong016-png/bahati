import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import type { Task, KioskOnboardingRecord, ScoreResetRequest } from '../lib/types';

interface SummaryPageProps {
  driverId: string;
}

export default function SummaryPage({ driverId }: SummaryPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [onboardings, setOnboardings] = useState<KioskOnboardingRecord[]>([]);
  const [resets, setResets] = useState<ScoreResetRequest[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      const [t, o, r] = await Promise.all([
        db.tasks
          .where('driver_id')
          .equals(driverId)
          .and((row) => row.created_at >= todayISO)
          .toArray(),
        db.onboarding_records
          .where('driver_id')
          .equals(driverId)
          .and((row) => row.created_at >= todayISO)
          .toArray(),
        db.reset_requests
          .where('driver_id')
          .equals(driverId)
          .and((row) => row.created_at >= todayISO)
          .toArray(),
      ]);

      if (!cancelled) {
        setTasks(t);
        setOnboardings(o);
        setResets(r);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [driverId]);

  const totalAmount = tasks.reduce((sum, t) => sum + (t.amount ?? 0), 0);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>我的日结</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard label="今日任务" value={tasks.length} />
        <StatCard label="入网记录" value={onboardings.length} />
        <StatCard label="重置申请" value={resets.length} />
      </div>

      <div
        style={{
          background: '#fffbeb',
          padding: 16,
          borderRadius: 8,
          marginBottom: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 'bold' }}>
          {totalAmount.toFixed(2)}
        </div>
        <div style={{ color: '#666' }}>今日总金额</div>
      </div>

      {tasks.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>任务明细</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {tasks.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: 12,
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <strong>{taskTypeLabel(t.task_type)}</strong>
                  {t.amount != null && <span> — {t.amount.toFixed(2)}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {new Date(t.created_at).toLocaleTimeString()} |{' '}
                  <SyncBadge status={t.sync_status} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <a href="/" style={{ display: 'block', marginTop: 24, textAlign: 'center' }}>
        ← 返回首页
      </a>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: '#f0f9ff',
        padding: 12,
        borderRadius: 8,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 'bold' }}>{value}</div>
      <div style={{ color: '#666', fontSize: 13 }}>{label}</div>
    </div>
  );
}

function SyncBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: '#f59e0b',
    synced: '#22c55e',
    failed: '#ef4444',
  };
  return (
    <span style={{ color: colors[status] || '#999' }}>
      {status === 'synced' ? '已同步' : status === 'pending' ? '待同步' : '同步失败'}
    </span>
  );
}

function taskTypeLabel(type: string): string {
  const map: Record<string, string> = {
    collection: '收款',
    restock: '补货',
    cleaning: '清洁',
    inspection: '巡检',
    repair: '维修',
  };
  return map[type] || type;
}
