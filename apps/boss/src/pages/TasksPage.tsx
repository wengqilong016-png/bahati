import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { colors, radius, shadow, font } from '../lib/theme';
import { fmtCurrency, fmtPercent } from '../lib/format';
import { getTodayDarEsSalaam } from '../lib/utils';
import { CardListSkeleton } from '../components/Skeleton';

interface TaskRecord {
  id: string;
  kiosk_id: string;
  driver_id: string;
  task_date: string;
  current_score: number;
  photo_urls: string[];
  notes: string | null;
  status: string;
  snapshot_serial_number: string;
  snapshot_merchant_name: string;
  snapshot_location_name: string;
  snapshot_driver_name: string;
  score_before: number | null;
  dividend_rate_snapshot: number | null;
  settlement_status: string | null;
  gross_revenue: number | null;
  dividend_amount: number | null;
  created_at: string;
}

export function TasksPage() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<TaskRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayDarEsSalaam());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fetchTasks = async (date: string) => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_date', date)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      showToast(`加载失败: ${err.message}`, 'error');
    } else {
      setTasks(data as TaskRecord[]);
    }
    setLoading(false);
  };

  useEffect(() => { void fetchTasks(selectedDate); }, [selectedDate]);

  useEffect(() => {
    if (!lightboxUrl) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxUrl]);

  const photoUrl = (raw: string): string => {
    if (raw.startsWith('http')) return raw;
    const { data } = supabase.storage.from('task-photos').getPublicUrl(raw);
    return data.publicUrl;
  };

  const settled = tasks?.filter(t => t.settlement_status === 'settled') ?? [];
  const pending = tasks?.filter(t => t.settlement_status !== 'settled') ?? [];

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: colors.primary, fontSize: font.sizes.xxl }}>每日任务</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>日期:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              padding: '6px 10px',
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: font.sizes.md,
              fontFamily: font.family,
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{ background: colors.dangerLight, color: colors.danger, padding: 12, borderRadius: radius.md, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Photo lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, cursor: 'zoom-out' }}
        >
          <img src={lightboxUrl} alt="任务照片" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: radius.md, objectFit: 'contain' }} />
        </div>
      )}

      {loading && <CardListSkeleton count={4} />}

      {!loading && tasks && tasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48 }}>📋</div>
          <p style={{ marginTop: 12, color: colors.textMuted }}>该日期暂无任务记录</p>
        </div>
      )}

      {/* Summary stats */}
      {!loading && tasks && tasks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard label="总任务" value={String(tasks.length)} color={colors.primary} />
          <StatCard label="已结算" value={String(settled.length)} color={colors.success} />
          <StatCard label="待结算" value={String(pending.length)} color={colors.warning} />
          <StatCard
            label="总营收"
            value={fmtCurrency(tasks.reduce((s, t) => s + (t.gross_revenue ?? 0), 0))}
            color={colors.info}
          />
        </div>
      )}

      {/* Pending tasks */}
      {!loading && pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: font.sizes.lg, color: colors.warning }}>⏳ 待结算 ({pending.length})</h3>
          {pending.map(renderTaskCard)}
        </div>
      )}

      {/* Settled tasks */}
      {!loading && settled.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: font.sizes.lg, color: colors.success }}>✅ 已结算 ({settled.length})</h3>
          {settled.map(renderTaskCard)}
        </div>
      )}
    </div>
  );

  function renderTaskCard(task: TaskRecord) {
    const scoreChange = task.score_before != null ? task.current_score - task.score_before : null;
    const topBarColor = task.settlement_status === 'settled' ? colors.success : colors.warning;

    return (
      <div
        key={task.id}
        className="card-hover"
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          marginBottom: 16,
          overflow: 'hidden',
          boxShadow: shadow.card,
        }}
      >
        <div style={{ height: 4, background: topBarColor }} />

        <div style={{ padding: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p style={{ margin: 0, fontWeight: font.weights.bold, fontSize: font.sizes.lg }}>
                {task.snapshot_merchant_name || '—'}
              </p>
              <p style={{ margin: '4px 0 0', color: colors.textSecondary, fontSize: font.sizes.sm }}>
                序列号: {task.snapshot_serial_number || '—'} · 司机: {task.snapshot_driver_name || '—'}
              </p>
              <p style={{ margin: '4px 0 0', color: colors.textMuted, fontSize: font.sizes.xs }}>
                {task.snapshot_location_name || ''} · {new Date(task.created_at).toLocaleString()}
              </p>
            </div>
            <StatusBadge status={task.settlement_status === 'settled' ? 'confirmed' : 'pending'} />
          </div>

          {/* Score display */}
          {task.score_before != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0', background: '#f8f9fa', borderRadius: radius.md, padding: 14 }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>上次分数</p>
                <p className="tabular-nums" style={{ margin: '4px 0 0', fontSize: 26, fontWeight: font.weights.bold, color: colors.warning }}>{task.score_before}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: colors.textDisabled }}>
                <span style={{ fontSize: 20 }}>→</span>
                {scoreChange != null && (
                  <span style={{ fontSize: font.sizes.xs, marginTop: 2, color: scoreChange > 0 ? colors.success : colors.textMuted, fontWeight: font.weights.semibold }}>
                    {scoreChange > 0 ? '+' : ''}{scoreChange}
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>当前分数</p>
                <p className="tabular-nums" style={{ margin: '4px 0 0', fontSize: 26, fontWeight: font.weights.bold, color: colors.success }}>{task.current_score}</p>
              </div>
            </div>
          )}

          {/* Financial info */}
          {(task.gross_revenue != null || task.dividend_rate_snapshot != null) && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 0 12px' }}>
              {task.gross_revenue != null && (
                <span style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                  💰 营收: <strong style={{ color: colors.text }}>{fmtCurrency(task.gross_revenue)}</strong>
                </span>
              )}
              {task.dividend_rate_snapshot != null && (
                <span style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                  📊 分红率: <strong style={{ color: colors.text }}>{fmtPercent(task.dividend_rate_snapshot)}</strong>
                </span>
              )}
              {task.dividend_amount != null && (
                <span style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                  🏦 分红: <strong style={{ color: colors.text }}>{fmtCurrency(task.dividend_amount)}</strong>
                </span>
              )}
            </div>
          )}

          {/* Photos */}
          {task.photo_urls && task.photo_urls.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: '0 0 6px', fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                📷 照片 ({task.photo_urls.length})
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {task.photo_urls.map((url, i) => (
                  <img
                    key={i}
                    src={photoUrl(url)}
                    alt={`任务照片 ${i + 1}`}
                    onClick={() => setLightboxUrl(photoUrl(url))}
                    style={{
                      width: 80,
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: radius.sm,
                      border: `1px solid ${colors.border}`,
                      cursor: 'zoom-in',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {task.photo_urls.length === 0 && (
            <p style={{ margin: '0 0 8px', fontSize: font.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
              无照片
            </p>
          )}

          {/* Notes */}
          {task.notes && (
            <p style={{ margin: '0 0 4px', fontSize: font.sizes.md, color: colors.textSecondary }}>
              <strong style={{ color: colors.text }}>备注：</strong>{task.notes}
            </p>
          )}
        </div>
      </div>
    );
  }
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      padding: '12px 16px',
      boxShadow: shadow.card,
    }}>
      <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: font.sizes.xl, fontWeight: font.weights.bold, color }}>{value}</p>
    </div>
  );
}
