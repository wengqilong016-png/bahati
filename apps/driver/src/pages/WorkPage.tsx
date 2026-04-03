import { useState, useRef, useCallback, useEffect, FormEvent } from 'react';
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

function statusColors(status: string): { bg: string; color: string } {
  if (status === 'active') return { bg: '#e6f4ea', color: '#1e7e34' };
  if (status === 'maintenance') return { bg: '#fff3e0', color: '#e65100' };
  return { bg: '#fce8e6', color: '#c62828' };
}

// ---- KioskTaskCard ----

interface KioskTaskCardProps {
  kiosk: LocalKiosk;
  todayTask: LocalTask | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}

function KioskTaskCard({ kiosk, todayTask, isExpanded, onToggle }: KioskTaskCardProps) {
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

  const uploadFn = useCallback((file: File) => uploadTaskPhoto(file, taskId), [taskId]);

  const score = parseInt(currentScore, 10);
  const scoreError = currentScore !== '' ? validateDailyTaskScore(score, kiosk.last_recorded_score) : null;
  const hasBeenSubmittedToday = !!todayTask && (todayTask.sync_status === 'synced' || todayTask.sync_status === 'pending');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !kiosk) return;
    setError(null);
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

  const sc = statusColors(kiosk.status);

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${isExpanded ? '#0066CC' : '#e0e0e0'}`,
      borderRadius: 10,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      {/* Card header — always visible */}
      <div
        onClick={onToggle}
        style={{ padding: 16, cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{kiosk.merchant_name}</p>
            <p style={{ margin: '2px 0 0', color: '#666', fontSize: 13 }}>{kiosk.location_name}</p>
            <p style={{ margin: '2px 0 0', color: '#999', fontSize: 11 }}>SN: {kiosk.serial_number}</p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0066CC' }}>
              {kiosk.last_recorded_score}
            </p>
            <p style={{ margin: '1px 0 0', fontSize: 11, color: '#999' }}>上次分数</p>
            <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>
              {statusLabel(kiosk.status)}
            </span>
          </div>
        </div>

        {/* Today's task status summary */}
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasBeenSubmittedToday ? (
            <span style={{ fontSize: 13, color: '#1e7e34', fontWeight: 600 }}>
              ✅ 今日已提交（分数：{todayTask.current_score}）
            </span>
          ) : (
            <span style={{ fontSize: 13, color: '#e65100' }}>⏳ 今日待提交</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#0066CC' }}>
            {isExpanded ? '▲ 收起' : '▼ 展开任务'}
          </span>
        </div>
      </div>

      {/* Expanded task form */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #e8e8e8', padding: '16px 16px 20px' }}>

          {/* GPS status */}
          <div style={{ marginBottom: 12, padding: '8px 10px', background: '#f5f5f5', borderRadius: 6, fontSize: 12 }}>
            {geo.loading && <span style={{ color: '#555' }}>📍 定位中…</span>}
            {!geo.loading && geo.coords && (
              <span style={{ color: '#2e7d32' }}>
                📍 已定位 {geo.coords.latitude.toFixed(5)}, {geo.coords.longitude.toFixed(5)}
                {geo.coords.accuracy != null && ` (±${Math.round(geo.coords.accuracy)}m)`}
              </span>
            )}
            {!geo.loading && !geo.coords && !geo.error && (
              <span style={{ color: '#888' }}>📍 等待GPS…（提交时自动记录）</span>
            )}
            {geo.error && (
              <span style={{ color: '#e65100' }}>⚠️ {geo.error}（任务仍可提交）</span>
            )}
          </div>

          {/* Success state: show settlement summary inline */}
          {submitDone ? (
            <div style={{ background: '#e6f4ea', borderRadius: 8, padding: 14 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 15, color: '#1e7e34' }}>
                ✅ 任务已提交！
              </p>
              {latestTask && (
                <div style={{ fontSize: 13, color: '#333', lineHeight: 1.8 }}>
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
                style={{ marginTop: 10, padding: '8px 14px', background: '#0066CC', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
              >
                查看完整结算 →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{ background: '#fce8e6', color: '#c62828', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 600, fontSize: 14 }}>当前分数 *</label>
                <input
                  type="number"
                  value={currentScore}
                  onChange={e => setCurrentScore(e.target.value)}
                  required
                  min={0}
                  placeholder={`必须大于 ${kiosk.last_recorded_score}`}
                  style={{
                    width: '100%', padding: '10px 12px',
                    border: `1px solid ${scoreError ? '#c62828' : '#ddd'}`,
                    borderRadius: 6, fontSize: 16, boxSizing: 'border-box',
                  }}
                />
                {scoreError && (
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: '#c62828' }}>⚠️ {scoreError}</p>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 600, fontSize: 14 }}>备注</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
                  照片 ({photos.length})
                  {pendingUploads > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#e65100' }}>上传中…</span>
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
                    flex: 1, padding: 13,
                    background: (saving || !!scoreError || pendingUploads > 0) ? '#ccc' : '#0066CC',
                    color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
                    cursor: (saving || !!scoreError || pendingUploads > 0) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? '保存中…' : pendingUploads > 0 ? `等待上传(${pendingUploads})…` : '提交任务'}
                </button>
                {scoreError && (
                  <button
                    type="button"
                    onClick={() => navigate(`/kiosks/${kiosk.id}/score-reset`)}
                    style={{ padding: '13px 14px', background: '#fff', color: '#e65100', border: '1px solid #e65100', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
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

  const taskByKiosk = new Map<string, LocalTask>(
    (todayTasks ?? []).map(t => [t.kiosk_id, t]),
  );

  const [expandedKioskId, setExpandedKioskId] = useState<string | null>(null);

  const toggleKiosk = (id: string) => {
    setExpandedKioskId(prev => (prev === id ? null : id));
  };

  const doneCount = (todayTasks ?? []).length;
  const totalCount = kiosks?.length ?? 0;

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0, color: '#0066CC', fontSize: 20 }}>今日工作</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#666' }}>{today}</p>
        </div>
        <span style={{
          padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
          background: isOnline ? '#e6f4ea' : '#fce8e6',
          color: isOnline ? '#1e7e34' : '#c62828',
        }}>
          {isOnline ? '在线' : '离线'}
        </span>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#555' }}>
            已完成 {doneCount} / {totalCount} 台
          </p>
          <div style={{ height: 6, background: '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
              background: doneCount === totalCount ? '#1e7e34' : '#0066CC',
              borderRadius: 3,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Loading */}
      {!kiosks && <p style={{ color: '#666' }}>加载中...</p>}

      {/* Empty state */}
      {kiosks && kiosks.length === 0 && (
        <p style={{ color: '#666', textAlign: 'center', marginTop: 40 }}>
          暂无分配的机器，请先同步数据。
        </p>
      )}

      {/* Kiosk cards */}
      {kiosks && kiosks.map(kiosk => (
        <KioskTaskCard
          key={kiosk.id}
          kiosk={kiosk}
          todayTask={taskByKiosk.get(kiosk.id)}
          isExpanded={expandedKioskId === kiosk.id}
          onToggle={() => toggleKiosk(kiosk.id)}
        />
      ))}

      {/* Bottom action: go to settlement summary */}
      {doneCount > 0 && (
        <button
          type="button"
          onClick={() => navigate('/settlement')}
          style={{ width: '100%', marginTop: 8, padding: 14, background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          💰 查看结算明细
        </button>
      )}
    </div>
  );
}
