import { useState, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import { validateScoreResetRequest } from '../lib/validation';
import { saveScoreResetRequest } from '../lib/actions';

export function ScoreResetPage() {
  const { machineId } = useParams<{ machineId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const machine = useLiveQuery(() => db.machines.get(machineId ?? ''), [machineId]);

  const [newScore, setNewScore] = useState('0');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedNewScore = parseInt(newScore, 10);
  const scoreError = newScore !== '' && machine
    ? validateScoreResetRequest(parsedNewScore, machine.last_recorded_score)
    : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !machine) return;
    setError(null);
    setSaving(true);

    try {
      await saveScoreResetRequest({
        machineId: machine.id,
        currentScore: machine.last_recorded_score,
        requestedNewScore: parsedNewScore,
        reason,
      });
      setSaved(true);
      setTimeout(() => navigate('/machines'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!machine) return <div style={{ padding: 16, color: '#666' }}>Loading machine...</div>;

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← Back
      </button>

      <h2 style={{ margin: '0 0 4px', color: '#0066CC' }}>Request Score Reset</h2>
      <p style={{ margin: '0 0 20px', color: '#666', fontSize: 14 }}>
        {machine.merchant_name} · {machine.location_name}
      </p>

      <div style={{ background: '#fff3e0', borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#e65100' }}>Current Score</p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#e65100' }}>
          {machine.last_recorded_score}
        </p>
      </div>

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
            placeholder={`Must be < ${machine.last_recorded_score}`}
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
