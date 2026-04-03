import { useState, useRef, useCallback, FormEvent } from 'react';
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
import { getTodayDarEsSalaam } from '../lib/utils';

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

  const [currentScore, setCurrentScore] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFn = useCallback((file: File) => uploadTaskPhoto(file, taskId), [taskId]);

  // Live validation hint
  const score = parseInt(currentScore, 10);
  const scoreError = currentScore !== '' && kiosk
    ? validateDailyTaskScore(score, kiosk.last_recorded_score)
    : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !kiosk) return;
    setError(null);
    setSaving(true);

    // Capture GPS silently (non-blocking)
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
      // Sync: push task to server (triggers compute score_before, dividend_rate_snapshot),
      // then pull enriched data back so SettlementPage has settlement fields.
      await processQueue();
      await pullTasks();
      // Restore local-only fields that may have been clobbered by pullTasks()
      await db.tasks.update(taskId, { photo_urls: photos, notes });
      setSaved(true);
      setTimeout(() => navigate('/settlement'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!kiosk) {
    return <div style={{ padding: 16, color: '#666' }}>加载中...</div>;
  }

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
        <p style={{ margin: 0, fontSize: 13, color: '#555' }}>上次记录分数</p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#0066CC' }}>
          {kiosk.last_recorded_score}
        </p>
      </div>

      {saved && (
        <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ✅ 已保存！正在跳转结算页面...
        </div>
      )}
      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
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
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#c62828' }}>
              ⚠️ {scoreError}
            </p>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>备注</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box', resize: 'vertical' }}
          />
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

        <button
          type="submit"
          disabled={saving || !!scoreError}
          style={{ width: '100%', padding: 14, background: (saving || scoreError) ? '#ccc' : '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: (saving || scoreError) ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? '保存中...' : '提交任务'}
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
