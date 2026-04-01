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
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!kiosk) return <div style={{ padding: 16, color: '#666' }}>Loading kiosk...</div>;

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← Back
      </button>

      <h2 style={{ margin: '0 0 4px', color: '#0066CC' }}>Request Score Reset</h2>
      <p style={{ margin: '0 0 20px', color: '#666', fontSize: 14 }}>
        {kiosk.merchant_name} · {kiosk.location_name}
      </p>

      <div style={{ background: '#fff3e0', borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#e65100' }}>Current Score</p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#e65100' }}>
          {kiosk.last_recorded_score}
        </p>
      </div>

      {/* Existing request status from approval flow */}
      {latestRequest && latestRequest.status === 'pending' && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          ⏳ A score reset request is pending approval ({latestRequest.current_score} → {latestRequest.requested_new_score}). Please wait for the result.
        </div>
      )}
      {latestRequest && latestRequest.status === 'approved' && (
        <div style={{ background: '#e6f4ea', border: '1px solid #a5d6a7', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          ✅ Last reset request approved ({latestRequest.current_score} → {latestRequest.requested_new_score}). Score updated.
        </div>
      )}
      {latestRequest && latestRequest.status === 'rejected' && (
        <div style={{ background: '#fce8e6', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          ❌ Last reset request rejected{latestRequest.rejection_reason ? `: ${latestRequest.rejection_reason}` : ''}
        </div>
      )}

      {saved && <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 12, borderRadius: 8, marginBottom: 16 }}>✅ Request submitted for approval</div>}
      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Requested New Score</label>
          <input
            type="number"
            value={newScore}
            onChange={e => setNewScore(e.target.value)}
            required
            min={0}
            placeholder={`Must be < ${kiosk.last_recorded_score}`}
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
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Reason *</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
            rows={4}
            placeholder="Explain why the score needs to be reset..."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <button
          type="submit"
          disabled={saving || !!scoreError}
          style={{ width: '100%', padding: 14, background: (saving || scoreError) ? '#ccc' : '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: (saving || scoreError) ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Submitting...' : 'Submit Reset Request'}
        </button>
      </form>
    </div>
  );
}
