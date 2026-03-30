import { useState, type FormEvent } from 'react';
import { saveTask } from '../lib/actions';
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
      await saveTask({
        kiosk_id: kioskId,
        driver_id: driverId,
        task_type: taskType,
        amount: amount ? parseFloat(amount) : null,
        notes,
        photo_uri: null,
      });
      setSuccess(true);
      setKioskId('');
      setAmount('');
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
