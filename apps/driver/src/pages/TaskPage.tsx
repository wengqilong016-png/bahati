import { useState, type FormEvent } from 'react';
import { saveTask } from '../lib/actions';
import { captureLocation } from '../lib/geo';
import { validateScoreIncrease } from '../lib/validation';
import PhotoCapture from '../components/PhotoCapture';
import type { TaskType } from '../lib/types';

interface TaskPageProps {
  driverId: string;
}

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'collection', label: '收款' },
  { value: 'restock', label: '补货' },
  { value: 'cleaning', label: '清洁' },
  { value: 'inspection', label: '巡检' },
  { value: 'repair', label: '维修' },
];

export default function TaskPage({ driverId }: TaskPageProps) {
  const [kioskId, setKioskId] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('collection');
  const [amount, setAmount] = useState('');
  const [currentScore, setCurrentScore] = useState('');
  const [lastRecordedScore, setLastRecordedScore] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    setSuccess(false);

    try {
      const cur = currentScore ? parseFloat(currentScore) : null;
      const last = lastRecordedScore ? parseFloat(lastRecordedScore) : null;

      // Client-side score guard (same rule as action layer + DB constraint)
      validateScoreIncrease(cur, last);

      const geo = await captureLocation();

      await saveTask({
        kiosk_id: kioskId,
        driver_id: driverId,
        task_type: taskType,
        amount: amount ? parseFloat(amount) : null,
        current_score: cur,
        last_recorded_score: last,
        notes,
        photo_uri: photoUri || null,
        geo,
      });
      setSuccess(true);
      setKioskId('');
      setAmount('');
      setCurrentScore('');
      setLastRecordedScore('');
      setPhotoUri('');
      setNotes('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 500, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>日常任务</h1>

      {success && (
        <div style={{ background: '#dcfce7', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ✅ 已保存到本地，等待同步
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>
          机器 ID / 序列号
          <input
            type="text"
            value={kioskId}
            onChange={(e) => setKioskId(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          任务类型
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as TaskType)}
            style={inputStyle}
          >
            {TASK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          金额（可选）
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            style={inputStyle}
          />
        </label>

        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}>
          <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 14 }}>
            分数录入（当前分数必须 &gt; 上次记录分数）
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 13 }}>上次分数</span>
              <input
                type="number"
                inputMode="decimal"
                value={lastRecordedScore}
                onChange={(e) => setLastRecordedScore(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 13 }}>当前分数</span>
              <input
                type="number"
                inputMode="decimal"
                value={currentScore}
                onChange={(e) => setCurrentScore(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </label>
          </div>
          {currentScore && lastRecordedScore &&
            parseFloat(currentScore) <= parseFloat(lastRecordedScore) && (
            <p style={{ color: '#ef4444', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              ⚠ 当前分数须大于上次分数，否则请走
              <a href="/reset"> 分数重置申请</a>
            </p>
          )}
        </div>

        <PhotoCapture
          value={photoUri}
          onChange={setPhotoUri}
          label="拍照（可选）"
        />

        <label style={labelStyle}>
          备注
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={inputStyle}
          />
        </label>

        <button type="submit" disabled={saving} style={buttonStyle}>
          {saving ? '保存中…' : '提交任务'}
        </button>
      </form>

      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}

      <a href="/" style={{ display: 'block', marginTop: 24, textAlign: 'center' }}>
        ← 返回首页
      </a>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 12,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 8,
  marginTop: 4,
  borderRadius: 4,
  border: '1px solid #cbd5e1',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 16,
  cursor: 'pointer',
  width: '100%',
  marginTop: 8,
};
