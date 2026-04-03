import { useState, useRef, useCallback, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { PhotoCapture } from '../components/PhotoCapture';
import { useAuth } from '../hooks/useAuth';
import { useGeolocation } from '../hooks/useGeolocation';
import { validateDailyTaskScore } from '../lib/validation';
import { saveDailyTask } from '../lib/actions';
import { uploadTaskPhoto } from '../lib/storage';
import { processQueue, pullTasks } from '../lib/sync';
import { settleTask } from '../lib/settlement';
import { getTodayDarEsSalaam } from '../lib/utils';

function fmtTZS(n: number): string {
  return `TZS ${n.toLocaleString()}`;
}

export function DailyTaskPage() {
  const { kioskId } = useParams<{ kioskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const geo = useGeolocation();
  const kiosk = useLiveQuery(() => db.kiosks.get(kioskId ?? ''), [kioskId]);

  // Stable ID for storage path — reuse existing task's ID when one already exists
  const taskIdRef = useRef<string>(crypto.randomUUID());
  const today = getTodayDarEsSalaam();
  const existingTask = useLiveQuery(
    () => {
      if (!kioskId) return undefined;
      return db.tasks.where('[kiosk_id+task_date]').equals([kioskId, today]).first();
    },
    [kioskId, today],
  );
  const taskId = existingTask?.id ?? taskIdRef.current;

  // ---- Step 1: score entry ----
  const [step, setStep] = useState<'entry' | 'settlement'>('entry');
  const [currentScore, setCurrentScore] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Step 2: settlement ----
  const [syncedTaskId, setSyncedTaskId] = useState<string | null>(null);
  const syncedTask = useLiveQuery(
    () => (syncedTaskId ? db.tasks.get(syncedTaskId) : undefined),
    [syncedTaskId],
  );
  const [dividendMethod, setDividendMethod] = useState<'cash' | 'retained'>('cash');
  const [settling, setSettling] = useState(false);

  const uploadFn = useCallback((file: File) => uploadTaskPhoto(file, taskId), [taskId]);

  // If today's task already exists and is pending settlement, jump to step 2
  useEffect(() => {
    if (existingTask && existingTask.settlement_status === 'pending' && step === 'entry' && syncedTaskId === null) {
      setSyncedTaskId(existingTask.id);
      setStep('settlement');
    }
  }, [existingTask, step, syncedTaskId]);

  const score = parseInt(currentScore, 10);
  const scoreError = currentScore !== '' && kiosk
    ? validateDailyTaskScore(score, kiosk.last_recorded_score)
    : null;

  // Step 1 → Step 2: save task, sync, then show settlement
  const handleNext = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !kiosk) return;
    setError(null);
    setSaving(true);

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
      await processQueue();
      await pullTasks();
      await db.tasks.update(taskId, { photo_urls: photos, notes });
      setSyncedTaskId(taskId);
      setStep('settlement');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // Step 2: settle and done
  const handleSettle = async () => {
    const task = syncedTask ?? existingTask;
    if (!task) return;
    setError(null);
    setSettling(true);
    try {
      await settleTask({
        taskId: task.id,
        dividendMethod,
        exchangeAmount: 0,
        expenseAmount: 0,
      });
      navigate('/kiosks');
    } catch (err) {
      setError(err instanceof Error ? err.message : '结算失败，请重试');
    } finally {
      setSettling(false);
    }
  };

  if (!kiosk) {
    return <div style={{ padding: 16, color: '#666' }}>加载中...</div>;
  }

  // ---- Render Step 1: Score Entry ----
  if (step === 'entry') {
    return (
      <div style={{ padding: '16px 16px 80px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
          ← 返回
        </button>

        <h2 style={{ margin: '0 0 4px', color: '#0066CC' }}>每日任务</h2>
        <p style={{ margin: '0 0 20px', color: '#666', fontSize: 14 }}>
          {kiosk.merchant_name} · {kiosk.location_name}
        </p>

        <div style={{ background: '#f0f7ff', borderRadius: 8, padding: 12, marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#555' }}>上次分数</p>
          <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#0066CC' }}>
            {kiosk.last_recorded_score}
          </p>
        </div>

        {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleNext}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>当前分数 *</label>
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
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#c62828' }}>⚠️ {scoreError}</p>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
              照片 ({photos.length})
            </label>
            <PhotoCapture
              photos={photos}
              onPhotosChange={setPhotos}
              uploadFn={uploadFn}
              disabled={saving}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>备注（可选）</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>

          <button
            type="submit"
            disabled={saving || !!scoreError || !currentScore}
            style={{ width: '100%', padding: 14, background: (saving || !!scoreError || !currentScore) ? '#ccc' : '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: (saving || !!scoreError || !currentScore) ? 'not-allowed' : 'pointer' }}
          >
            {saving ? '同步中...' : '下一步'}
          </button>

          {scoreError && (
            <button
              type="button"
              onClick={() => navigate(`/kiosks/${kiosk.id}/score-reset`)}
              style={{ width: '100%', marginTop: 12, padding: 14, background: '#fff', color: '#e65100', border: '1px solid #e65100', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              提交分数重置申请
            </button>
          )}
        </form>
      </div>
    );
  }

  // ---- Render Step 2: Settlement ----
  const task = syncedTask ?? existingTask;

  if (task?.settlement_status === 'settled') {
    return (
      <div style={{ padding: '16px 16px 80px' }}>
        <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 16, borderRadius: 8, marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
          ✅ 已结算
        </div>
        <button
          onClick={() => navigate('/kiosks')}
          style={{ width: '100%', padding: 14, background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
        >
          返回机器列表
        </button>
      </div>
    );
  }

  const scoreBefore = task?.score_before;
  const grossRevenue = task?.gross_revenue ?? (scoreBefore !== undefined && task
    ? (task.current_score - scoreBefore) * 200
    : undefined);
  const dividendRate = task?.dividend_rate_snapshot;
  const dividendAmount = grossRevenue !== undefined && dividendRate !== undefined
    ? Math.round(grossRevenue * dividendRate)
    : undefined;
  const sessionScore = scoreBefore !== undefined && task
    ? task.current_score - scoreBefore
    : undefined;

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <h2 style={{ margin: '0 0 4px', color: '#0066CC' }}>确认收入</h2>
      <p style={{ margin: '0 0 20px', color: '#666', fontSize: 14 }}>
        {kiosk.merchant_name} · {kiosk.location_name}
      </p>

      {/* Calculation summary */}
      <div style={{ background: '#f0f7ff', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#555', fontSize: 14 }}>本次开机分数</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>
            {sessionScore !== undefined ? `${sessionScore} 分` : '—'}
          </span>
        </div>
        <div style={{ borderTop: '1px solid #d0e4f7', paddingTop: 10, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#555', fontSize: 13 }}>总营收（×200）</span>
            <span style={{ fontSize: 14 }}>{grossRevenue !== undefined ? fmtTZS(grossRevenue) : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#555', fontSize: 13 }}>
              分红{dividendRate !== undefined ? `（${(dividendRate * 100).toFixed(0)}%）` : ''}
            </span>
            <span style={{ fontWeight: 700, fontSize: 20, color: '#1e7e34' }}>
              {dividendAmount !== undefined ? fmtTZS(dividendAmount) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Dividend method */}
      <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 15 }}>分红方式</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
        {(['cash', 'retained'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setDividendMethod(m)}
            style={{
              padding: 16,
              border: `2px solid ${dividendMethod === m ? '#0066CC' : '#ddd'}`,
              borderRadius: 8,
              background: dividendMethod === m ? '#e3f2fd' : '#fff',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 16,
              color: dividendMethod === m ? '#0066CC' : '#555',
            }}
          >
            {m === 'cash' ? '💵 结算' : '📌 留存'}
          </button>
        ))}
      </div>
      <p style={{ margin: '0 0 24px', fontSize: 12, color: '#888' }}>
        {dividendMethod === 'cash' ? '分红直接到账' : '分红记入店家账本'}
      </p>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <button
        type="button"
        onClick={handleSettle}
        disabled={settling || !task}
        style={{ width: '100%', padding: 14, background: settling ? '#ccc' : '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: settling ? 'not-allowed' : 'pointer' }}
      >
        {settling ? '提交中...' : '提交'}
      </button>
    </div>
  );
}
