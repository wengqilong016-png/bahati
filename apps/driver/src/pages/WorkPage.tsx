import { useState, useRef, useCallback, useEffect, useMemo, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db';
import { PhotoCapture } from '../components/PhotoCapture';
import { useAuth } from '../hooks/useAuth';
import { useGeolocation } from '../hooks/useGeolocation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { validateDailyTaskScore } from '../lib/validation';
import { saveDailyTask } from '../lib/actions';
import { uploadTaskPhoto } from '../lib/storage';
import { processQueue, pullTasks } from '../lib/sync';
import { getTodayDarEsSalaam } from '../lib/utils';
import type { LocalKiosk, LocalTask } from '../lib/types';

// ---- small helpers ----

function fmtTZS(n: number): string {
  return `TZS ${n.toLocaleString()}`;
}

function statusLabel(status: string): string {
  if (status === 'active') return '运营中';
  if (status === 'maintenance') return '维护中';
  return '停用';
}

function statusBadgeStyle(status: string): React.CSSProperties {
  if (status === 'active') return { background: '#dcfce7', color: '#15803d' };
  if (status === 'maintenance') return { background: '#fef9c3', color: '#a16207' };
  return { background: '#fee2e2', color: '#b91c1c' };
}

// ---- KioskTaskCard ----

interface KioskTaskCardProps {
  kiosk: LocalKiosk;
  todayTask: LocalTask | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  /** Called whenever the card's in-progress upload count changes. */
  onPendingChange?: (count: number) => void;
}

function KioskTaskCard({ kiosk, todayTask, isExpanded, onToggle, onPendingChange }: KioskTaskCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const geo = useGeolocation();

  // Stable task ID — reuse today's existing task ID if one exists
  const taskIdRef = useRef<string>(crypto.randomUUID());
  const taskId = todayTask?.id ?? taskIdRef.current;

  const [currentScore, setCurrentScore] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start GPS capture when card is expanded (gives GPS time to lock before submit)
  useEffect(() => {
    if (isExpanded && !geo.coords && !geo.loading) {
      void geo.capture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  // Bubble pending upload count to parent (WorkPage) so it can guard page-level navigation
  const onPendingChangeRef = useRef(onPendingChange);
  onPendingChangeRef.current = onPendingChange;
  useEffect(() => {
    onPendingChangeRef.current?.(pendingUploads);
  }, [pendingUploads]);

  const uploadFn = useCallback((file: File) => uploadTaskPhoto(file, taskId), [taskId]);

  const score = parseInt(currentScore, 10);
  const scoreError = currentScore !== '' ? validateDailyTaskScore(score, kiosk.last_recorded_score) : null;
  const hasBeenSubmittedToday = !!todayTask && (todayTask.sync_status === 'synced' || todayTask.sync_status === 'pending');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !kiosk) return;
    setError(null);

    if (scoreError) {
      setError(scoreError);
      return;
    }

    if (pendingUploads > 0) {
      setError('照片仍在上传中，请等待上传完成后再提交');
      return;
    }
    setSaving(true);

    // Use cached GPS — already capturing since card was opened
    const gpsCoords = geo.coords ?? await geo.capture();

    try {
      await saveDailyTask({
        id: taskId,
        kioskId: kiosk.id,
        currentScore: score,
        lastRecordedScore: kiosk.last_recorded_score,
        photoUrls: photos,
        notes,
        latitude: gpsCoords?.latitude,
        longitude: gpsCoords?.longitude,
      });

      // Three-step sync pattern:
      // 1. processQueue() pushes the task to the server, which computes
      //    score_before, gross_revenue, dividend_rate_snapshot etc.
      // 2. pullTasks() fetches the enriched task back from the server.
      // 3. Re-stamp local photo_urls/notes because pullTasks() falls back to
      //    an empty array when the server hasn't stored photos yet (they may
      //    still be pending in the storage upload queue).
      await processQueue();
      await pullTasks();
      await db.tasks.update(taskId, { photo_urls: photos, notes });

      setSubmitDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // Reload task after successful submit to show settlement summary
  const latestTask = useLiveQuery(
    () => (submitDone ? db.tasks.get(taskId) : undefined),
    [submitDone, taskId],
  );

  const badgeStyle = statusBadgeStyle(kiosk.status);

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${isExpanded ? '#4f46e5' : '#e2e8f0'}`,
      borderRadius: 10,
      marginBottom: 10,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'border-color 0.2s',
    }}>
      {/* Card header — always visible */}
      <div
        onClick={onToggle}
        style={{ padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 900, fontSize: 15, color: '#0f172a', letterSpacing: '-0.01em' }}>{kiosk.merchant_name}</p>
            <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 12, fontWeight: 600 }}>{kiosk.location_name}</p>
            <p style={{ margin: '1px 0 0', color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SN: {kiosk.serial_number}</p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#4f46e5', fontVariantNumeric: 'tabular-nums' }}>
              {kiosk.last_recorded_score}
            </p>
            <p style={{ margin: '1px 0 0', fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>上次分数</p>
            <span style={{
              display: 'inline-block', marginTop: 4, padding: '2px 8px',
              borderRadius: 20, fontSize: 9, fontWeight: 900,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              ...badgeStyle,
            }}>
              {statusLabel(kiosk.status)}
            </span>
          </div>
        </div>

        {/* Today's task status summary */}
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasBeenSubmittedToday ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, color: '#15803d', fontWeight: 900,
              background: '#f0fdf4', borderRadius: 20, padding: '3px 8px',
              textTransform: 'uppercase', letterSpacing: '0.03em',
            }}>
              ✅ 已提交 {todayTask.current_score}分
            </span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, color: '#b45309', fontWeight: 900,
              background: '#fffbeb', borderRadius: 20, padding: '3px 8px',
              textTransform: 'uppercase', letterSpacing: '0.03em',
            }}>
              ⏳ 待提交
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
            {isExpanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Expanded task form */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '14px 16px 18px' }}>

          {/* GPS status */}
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
            {geo.loading && <span style={{ color: '#64748b' }}>📍 定位中…</span>}
            {!geo.loading && geo.coords && (
              <span style={{ color: '#15803d' }}>
                📍 已定位 {geo.coords.latitude.toFixed(5)}, {geo.coords.longitude.toFixed(5)}
                {geo.coords.accuracy != null && ` (±${Math.round(geo.coords.accuracy)}m)`}
              </span>
            )}
            {!geo.loading && !geo.coords && !geo.error && (
              <span style={{ color: '#94a3b8' }}>📍 等待GPS…（提交时自动记录）</span>
            )}
            {geo.error && (
              <span style={{ color: '#d97706' }}>⚠️ {geo.error}（任务仍可提交）</span>
            )}
          </div>

          {/* Success state: show settlement summary inline */}
          {submitDone ? (
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 14, border: '1px solid #bbf7d0' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 900, fontSize: 13, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ✅ 任务已提交！
              </p>
              {latestTask && (
                <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.8, fontWeight: 600 }}>
                  <p style={{ margin: 0 }}>
                    分数：{latestTask.current_score}
                    {latestTask.score_before != null && ` （上次 ${latestTask.score_before}）`}
                  </p>
                  {latestTask.gross_revenue != null && (
                    <p style={{ margin: 0 }}>收入：{fmtTZS(latestTask.gross_revenue)}</p>
                  )}
                  {latestTask.dividend_amount != null && (
                    <p style={{ margin: 0 }}>分红：{fmtTZS(latestTask.dividend_amount)}</p>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate('/settlement')}
                style={{
                  marginTop: 10, padding: '8px 14px',
                  background: '#4f46e5', color: '#fff',
                  border: 'none', borderRadius: 6, fontSize: 11,
                  fontWeight: 900, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}
              >
                查看完整结算 →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: 700, border: '1px solid #fecaca' }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 900, fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>当前分数 *</label>
                <input
                  type="number"
                  value={currentScore}
                  onChange={e => setCurrentScore(e.target.value)}
                  required
                  min={0}
                  placeholder={`必须大于 ${kiosk.last_recorded_score}`}
                  style={{
                    width: '100%', padding: '10px 12px',
                    border: `1px solid ${scoreError ? '#fca5a5' : '#e2e8f0'}`,
                    borderRadius: 8, fontSize: 16, boxSizing: 'border-box',
                    fontWeight: 700, background: '#fff', outline: 'none',
                  }}
                />
                {scoreError && (
                  <p style={{ margin: '5px 0 0', fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>⚠️ {scoreError}</p>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 900, fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>备注</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontWeight: 600 }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 900, fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  照片 ({photos.length})
                  {pendingUploads > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: '#d97706', fontWeight: 900 }}>上传中…</span>
                  )}
                </label>
                <PhotoCapture
                  photos={photos}
                  onPhotosChange={setPhotos}
                  uploadFn={uploadFn}
                  disabled={saving}
                  onPendingChange={setPendingUploads}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="submit"
                  disabled={saving || !!scoreError || pendingUploads > 0}
                  style={{
                    flex: 1, padding: 12,
                    background: (saving || !!scoreError || pendingUploads > 0) ? '#cbd5e1' : '#4f46e5',
                    color: (saving || !!scoreError || pendingUploads > 0) ? '#64748b' : '#fff',
                    border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 900,
                    cursor: (saving || !!scoreError || pendingUploads > 0) ? 'not-allowed' : 'pointer',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}
                >
                  {saving ? '保存中…' : pendingUploads > 0 ? `等待上传(${pendingUploads})…` : '提交任务'}
                </button>
                {scoreError && (
                  <button
                    type="button"
                    onClick={() => navigate(`/kiosks/${kiosk.id}/score-reset`)}
                    style={{
                      padding: '12px 14px', background: '#fff',
                      color: '#d97706', border: '1px solid #fcd34d',
                      borderRadius: 8, fontSize: 10, fontWeight: 900,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}
                  >
                    申请重置
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ---- WorkPage ----

export function WorkPage() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const today = getTodayDarEsSalaam();

  const kiosks = useLiveQuery(() => db.kiosks.toArray(), []);
  const todayTasks = useLiveQuery(
    () => db.tasks.where('task_date').equals(today).toArray(),
    [today],
  );

  const kioskIdSet = useMemo(
    () => new Set((kiosks ?? []).map(k => k.id)),
    [kiosks],
  );

  const taskByKiosk = useMemo(() => {
    const map = new Map<string, LocalTask>();
    (todayTasks ?? []).forEach((t) => {
      if (kioskIdSet.has(t.kiosk_id)) {
        map.set(t.kiosk_id, t);
      }
    });
    return map;
  }, [todayTasks, kioskIdSet]);

  const submittedTaskByKiosk = useMemo(() => {
    const map = new Map<string, LocalTask>();
    (todayTasks ?? []).forEach((t) => {
      if (
        kioskIdSet.has(t.kiosk_id) &&
        (t.sync_status === 'pending' || t.sync_status === 'synced')
      ) {
        map.set(t.kiosk_id, t);
      }
    });
    return map;
  }, [todayTasks, kioskIdSet]);

  const [expandedKioskId, setExpandedKioskId] = useState<string | null>(null);
  const [pendingByKiosk, setPendingByKiosk] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'done'>('all');

  const totalPending = Object.values(pendingByKiosk).reduce((a, b) => a + b, 0);

  const toggleKiosk = (id: string) => {
    setExpandedKioskId(prev => (prev === id ? null : id));
  };

  const handleKioskPendingChange = useCallback((kioskId: string, count: number) => {
    setPendingByKiosk(prev => {
      if (prev[kioskId] === count) return prev;
      return { ...prev, [kioskId]: count };
    });
  }, []);

  const doneCount = submittedTaskByKiosk.size;
  const totalCount = kiosks?.length ?? 0;
  const pendingCount = Math.max(totalCount - doneCount, 0);

  const filteredKiosks = useMemo(() => {
    if (!kiosks) return [];
    const lower = searchQuery.toLowerCase();
    return kiosks.filter(kiosk => {
      const matchSearch = !searchQuery ||
        kiosk.merchant_name.toLowerCase().includes(lower) ||
        kiosk.serial_number.toLowerCase().includes(lower) ||
        (kiosk.location_name ?? '').toLowerCase().includes(lower);
      const isDone = submittedTaskByKiosk.has(kiosk.id);
      const matchFilter =
        statusFilter === 'all' ||
        (statusFilter === 'done' && isDone) ||
        (statusFilter === 'pending' && !isDone);
      return matchSearch && matchFilter;
    });
  }, [kiosks, searchQuery, statusFilter, submittedTaskByKiosk]);

  return (
    <div style={{ minHeight: '100vh', background: '#f3f5f8', paddingBottom: 80 }}>

      {/* Dark header */}
      <div style={{ background: '#0f172a', padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              background: 'linear-gradient(135deg, #fbbf24, #d97706)',
              borderRadius: 8, padding: '6px 8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 12 }}>👑</span>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase' }}>BAHATI</p>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{today}</p>
            </div>
          </div>
          <span style={{
            padding: '4px 10px', borderRadius: 20, fontSize: 9, fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            background: isOnline ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
            color: isOnline ? '#4ade80' : '#f87171',
            border: `1px solid ${isOnline ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
          }}>
            {isOnline ? '● 在线' : '● 离线'}
          </span>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {(['all', 'pending', 'done'] as const).map((f) => {
            const labels = { all: '全部', pending: '待提交', done: '已完成' };
            const counts = { all: totalCount, pending: pendingCount, done: doneCount };
            const isActive = statusFilter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                style={{
                  flex: 1, padding: '10px 4px',
                  background: 'none', border: 'none',
                  cursor: 'pointer',
                  borderBottom: `2px solid ${isActive ? '#fbbf24' : 'transparent'}`,
                  color: isActive ? '#fbbf24' : '#64748b',
                  fontSize: 10, fontWeight: 900,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  transition: 'color 0.15s',
                }}
              >
                <span>{labels[f]}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: isActive ? '#fbbf24' : '#94a3b8', lineHeight: 1 }}>{counts[f]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '12px 16px 0' }}>

        {/* Stats grid */}
        {totalCount > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>总机器数</p>
              <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{totalCount}</p>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>待提交</p>
              <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900, color: '#4f46e5' }}>{pendingCount}</p>
            </div>
            <div style={{ background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 900, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>已完成</p>
              <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900, color: '#15803d' }}>{doneCount}</p>
            </div>
            <div style={{ background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 900, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.08em' }}>完成率</p>
              <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900, color: '#d97706' }}>
                {totalCount > 0 ? `${Math.round((doneCount / totalCount) * 100)}%` : '—'}
              </p>
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 14, color: '#94a3b8', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索机器名、编号、位置…"
            style={{
              width: '100%', padding: '10px 12px 10px 36px',
              border: '1px solid #e2e8f0', borderRadius: 10,
              fontSize: 13, fontWeight: 600, boxSizing: 'border-box',
              background: '#fff', color: '#0f172a',
              outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          />
        </div>

        {/* Loading */}
        {!kiosks && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>加载中...</p>
          </div>
        )}

        {/* Empty state — no kiosks assigned */}
        {kiosks && kiosks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <p style={{ fontSize: 36, margin: '0 0 12px' }}>🏪</p>
            <p style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              暂无分配的机器，请先同步数据。
            </p>
          </div>
        )}

        {/* No search/filter results */}
        {kiosks && kiosks.length > 0 && filteredKiosks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              无匹配结果
            </p>
          </div>
        )}

        {/* Kiosk cards */}
        {filteredKiosks.map(kiosk => (
          <KioskTaskCard
            key={kiosk.id}
            kiosk={kiosk}
            todayTask={taskByKiosk.get(kiosk.id)}
            isExpanded={expandedKioskId === kiosk.id}
            onToggle={() => toggleKiosk(kiosk.id)}
            onPendingChange={(count) => handleKioskPendingChange(kiosk.id, count)}
          />
        ))}

        {/* Settlement CTA */}
        {doneCount > 0 && (
          <button
            type="button"
            disabled={totalPending > 0}
            onClick={() => navigate('/settlement')}
            style={{
              width: '100%', marginTop: 8, padding: '13px 16px',
              background: totalPending > 0 ? '#cbd5e1' : '#0f172a',
              color: totalPending > 0 ? '#64748b' : '#fff',
              border: 'none', borderRadius: 10, fontSize: 11, fontWeight: 900,
              cursor: totalPending > 0 ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}
          >
            {totalPending > 0 ? `📤 照片上传中(${totalPending})，请等待…` : '💰 查看结算明细'}
          </button>
        )}
      </div>
    </div>
  );
}
