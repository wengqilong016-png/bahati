import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getTodayDarEsSalaam } from '../lib/utils';

function fmtTZS(n: number): string {
  return `TZS ${n.toLocaleString()}`;
}

export function HomePage() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const today = getTodayDarEsSalaam();

  const kioskCount = useLiveQuery(() => db.kiosks.count(), []) ?? 0;
  const todayTaskCount = useLiveQuery(() => db.tasks.where('task_date').equals(today).count(), [today]) ?? 0;
  const pendingSyncCount = useLiveQuery(() => db.sync_queue.where('retry_count').below(3).count(), []) ?? 0;
  const pendingResetCount = useLiveQuery(() =>
    db.score_reset_requests.where('sync_status').anyOf(['pending', 'syncing']).count(), []) ?? 0;
  const driverProfile = useLiveQuery(() => db.driver_profile.get('me'), []);

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#0066CC' }}>SmartKiosk</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>司机工作台</p>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
          background: isOnline ? '#e6f4ea' : '#fce8e6',
          color: isOnline ? '#1e7e34' : '#c62828',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#1e7e34' : '#c62828' }} />
          {isOnline ? '在线' : '离线'}
        </span>
      </div>

      {/* Wallet card */}
      <WalletCard
        coinBalance={driverProfile?.coin_balance ?? null}
        cashBalance={driverProfile?.cash_balance ?? null}
        fetchedAt={driverProfile?.fetched_at ?? null}
      />

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <StatCard label="我的机器" value={kioskCount} color="#0066CC" onClick={() => navigate('/kiosks')} />
        <StatCard label="今日任务" value={todayTaskCount} color="#1e7e34" onClick={() => navigate('/kiosks')} />
        <StatCard label="待同步" value={pendingSyncCount} color={pendingSyncCount > 0 ? '#e65100' : '#999'} onClick={() => navigate('/sync')} />
        <StatCard label="重置申请" value={pendingResetCount} color="#7b1fa2" />
      </div>

      {/* Quick actions */}
      <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#333' }}>快捷操作</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ActionButton icon="📋" label="记录每日任务" subtitle="选择机器并提交" onClick={() => navigate('/kiosks')} />
        <ActionButton icon="➕" label="新机入网" subtitle="登记新机器" onClick={() => navigate('/onboard')} />
        <ActionButton icon="🔄" label="复查" subtitle="复查现有机器" onClick={() => navigate('/onboard?type=recertification')} />
      </div>
    </div>
  );
}

function WalletCard({ coinBalance, cashBalance, fetchedAt }: {
  coinBalance: number | null;
  cashBalance: number | null;
  fetchedAt: string | null;
}) {
  const hasData = coinBalance !== null && cashBalance !== null;
  const timeLabel = fetchedAt
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Africa/Dar_es_Salaam',
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(fetchedAt))
    : null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0066CC 0%, #004499 100%)',
      borderRadius: 12,
      padding: '16px 18px',
      marginBottom: 16,
      color: '#fff',
    }}>
      <p style={{ margin: '0 0 10px', fontSize: 12, opacity: 0.8 }}>
        我的钱包{timeLabel ? `　${timeLabel} 更新` : ''}
      </p>
      <div style={{ display: 'flex', gap: 24 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>硬币余额</p>
          <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700 }}>
            {hasData ? coinBalance?.toLocaleString() ?? '—' : '—'}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>现金余额</p>
          <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700 }}>
            {hasData ? fmtTZS(cashBalance ?? 0) : '—'}
          </p>
        </div>
      </div>
      {!hasData && (
        <p style={{ margin: '8px 0 0', fontSize: 11, opacity: 0.6 }}>同步后显示余额</p>
      )}
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
