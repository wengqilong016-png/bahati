import { useState, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { PhotoCapture } from '../components/PhotoCapture';
import { useAuth } from '../hooks/useAuth';
import { validateDailyTaskScore } from '../lib/validation';
import { saveDailyTask } from '../lib/actions';

export function DailyTaskPage() {
  const { kioskId } = useParams<{ kioskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const kiosk = useLiveQuery(() => db.kiosks.get(kioskId ?? ''), [kioskId]);

  const [currentScore, setCurrentScore] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhoto = (dataUrl: string) => {
    setPhotos(prev => [...prev, dataUrl]);
  };

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

    try {
      await saveDailyTask({
        kioskId: kiosk.id,
        currentScore: score,
        lastRecordedScore: kiosk.last_recorded_score,
        photoUrls: photos,
        notes,
      });
      setSaved(true);
      setTimeout(() => navigate('/kiosks'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!kiosk) {
    return <div style={{ padding: 16, color: '#666' }}>Loading kiosk...</div>;
  }

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← Back
      </button>

      <h2 style={{ margin: '0 0 4px', color: '#0066CC' }}>Daily Task</h2>
      <p style={{ margin: '0 0 20px', color: '#666', fontSize: 14 }}>
        {kiosk.merchant_name} · {kiosk.location_name}
      </p>
      <div style={{ background: '#f0f7ff', borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#555' }}>Last Recorded Score</p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#0066CC' }}>
          {kiosk.last_recorded_score}
        </p>
      </div>

      {saved && <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 12, borderRadius: 8, marginBottom: 16 }}>✅ Saved!</div>}
      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Current Score *</label>
          <input
            type="number"
            value={currentScore}
            onChange={e => setCurrentScore(e.target.value)}
            required
            min={0}
            placeholder={`Must be > ${kiosk.last_recorded_score}`}
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
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
            Photos ({photos.length})
          </label>
          <PhotoCapture onCapture={handlePhoto} />
          {photos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {photos.map((p, i) => (
                <img key={i} src={p} alt={`photo ${i + 1}`} style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={saving || !!scoreError}
          style={{ width: '100%', padding: 14, background: (saving || scoreError) ? '#ccc' : '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: (saving || scoreError) ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving...' : 'Submit Task'}
        </button>

        {scoreError && (
          <button
            type="button"
            onClick={() => navigate(`/kiosks/${kiosk.id}/score-reset`)}
            style={{ width: '100%', marginTop: 12, padding: 14, background: '#fff', color: '#e65100', border: '1px solid #e65100', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            Submit Score Reset Request Instead
          </button>
        )}
      </form>
    </div>
  );
}
