import { useState, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import { validateScoreResetRequest } from '../lib/validation';
import { saveScoreResetRequest } from '../lib/actions';

export function ScoreResetPage() {
  const { kioskId } = useParams<{ kioskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const kiosk = useLiveQuery(() => db.kiosks.get(kioskId ?? ''), [kioskId]);

  // Fetch existing score reset requests for this kiosk to show approval status
  const existingRequests = useLiveQuery(
    () => kioskId
      ? db.score_reset_requests.where('kiosk_id').equals(kioskId).toArray()
      : [],
    [kioskId],
  );
  const latestRequest = existingRequests
    ?.map(r => ({ ...r, status: r.status ?? 'pending' as const }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const [newScore, setNewScore] = useState('0');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedNewScore = parseInt(newScore, 10);
  const scoreError = newScore !== '' && kiosk
    ? validateScoreResetRequest(parsedNewScore, kiosk.last_recorded_score)
    : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !kiosk) return;
    setError(null);
    setSaving(true);

    try {
      await saveScoreResetRequest({
        kioskId: kiosk.id,
        currentScore: kiosk.last_recorded_score,
        requestedNewScore: parsedNewScore,
        reason,
      });
      // Sync request to server so the approval flow can pick it up
      const { processQueue } = await import('../lib/sync');
      await processQueue();
      setSaved(true);
      setTimeout(() => navigate('/kiosks'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!kiosk) return <div style={{ padding: 16, color: '#666' }}>加载中...</div>;

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← 返回
      </button>

      <h2 style={{ margin: '0 0 4px', color: '#0066CC' }}>申请分数重置</h2>
      <p style={{ margin: '0 0 20px', color: '#666', fontSize: 14 }}>
        {kiosk.merchant_name} · {kiosk.location_name}
      </p>

      <div style={{ background: '#fff3e0', borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#e65100' }}>当前分数</p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#e65100' }}>
          {kiosk.last_recorded_score}
        </p>
      </div>

      {/* Existing request status from approval flow */}
      {latestRequest && latestRequest.status === 'pending' && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          ⏳ 分数重置申请审核中（{latestRequest.current_score} → {latestRequest.requested_new_score}），请等待结果。
        </div>
      )}
      {latestRequest && latestRequest.status === 'approved' && (
        <div style={{ background: '#e6f4ea', border: '1px solid #a5d6a7', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          ✅ 上次重置申请已通过（{latestRequest.current_score} → {latestRequest.requested_new_score}），分数已更新。
        </div>
      )}
      {latestRequest && latestRequest.status === 'rejected' && (
        <div style={{ background: '#fce8e6', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          ❌ 上次重置申请被拒绝{latestRequest.rejection_reason ? `：${latestRequest.rejection_reason}` : ''}
        </div>
      )}

      {saved && <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 12, borderRadius: 8, marginBottom: 16 }}>✅ 申请已提交，等待审批</div>}
      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>申请新分数</label>
          <input
            type="number"
            value={newScore}
            onChange={e => setNewScore(e.target.value)}
            required
            min={0}
            placeholder={`必须小于 ${kiosk.last_recorded_score}`}
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

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>原因 *</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
            rows={4}
            placeholder="请说明为什么需要重置分数..."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <button
          type="submit"
          disabled={saving || !!scoreError}
          style={{ width: '100%', padding: 14, background: (saving || scoreError) ? '#ccc' : '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: (saving || scoreError) ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? '提交中...' : '提交重置申请'}
        </button>
      </form>
    </div>
  );
}
