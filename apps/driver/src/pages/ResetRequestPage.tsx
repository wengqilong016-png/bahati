import { useState, type FormEvent } from 'react';
import { saveResetRequest } from '../lib/actions';
import { captureLocation } from '../lib/geo';
import PhotoCapture from '../components/PhotoCapture';

interface ResetRequestPageProps {
  driverId: string;
}

export default function ResetRequestPage({ driverId }: ResetRequestPageProps) {
  const [kioskId, setKioskId] = useState('');
  const [currentScore, setCurrentScore] = useState('');
  const [reason, setReason] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    setSuccess(false);

    try {
      const geo = await captureLocation();

      await saveResetRequest({
        kiosk_id: kioskId,
        driver_id: driverId,
        reason,
        photo_uri: photoUri || null,
        current_score: currentScore ? parseFloat(currentScore) : null,
        geo,
      });
      setSuccess(true);
      setKioskId('');
      setCurrentScore('');
      setReason('');
      setPhotoUri('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 500, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>分数重置申请</h1>

      <div style={{
        background: '#fef3c7',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        fontSize: 13,
        color: '#92400e',
      }}>
        当机器分数出现异常（当前分数 ≤ 上次记录分数）时，须通过此页面提交重置申请，
        审批通过后方可继续正常任务录入。
      </div>

      {success && (
        <div style={{ background: '#dcfce7', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ✅ 已保存到本地，等待同步审批
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
          当前机器分数
          <input
            type="number"
            inputMode="decimal"
            value={currentScore}
            onChange={(e) => setCurrentScore(e.target.value)}
            placeholder="输入当前分数"
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          重置原因
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={4}
            style={inputStyle}
          />
        </label>

        <PhotoCapture
          value={photoUri}
          onChange={setPhotoUri}
          label="证据照片（可选）"
        />

        <button type="submit" disabled={saving} style={buttonStyle}>
          {saving ? '保存中…' : '提交申请'}
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
