import { useState, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { PhotoCapture } from '../components/PhotoCapture';
import { useAuth } from '../hooks/useAuth';

export function DailyTaskPage() {
  const { machineId } = useParams<{ machineId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const machine = useLiveQuery(() => db.machines.get(machineId ?? ''), [machineId]);

  const [currentScore, setCurrentScore] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhoto = (dataUrl: string) => {
    setPhotos(prev => [...prev, dataUrl]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !machine) return;
    setError(null);
    setSaving(true);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const taskDate = now.slice(0, 10);
    const score = parseInt(currentScore, 10);

    try {
      await db.daily_tasks.add({
        id,
        machine_id: machine.id,
        task_date: taskDate,
        current_score: score,
        photo_urls: photos,
        notes,
        sync_status: 'pending',
        created_at: now,
      });

      await db.sync_queue.add({
        table_name: 'daily_tasks',
        record_id: id,
        operation: 'insert',
        payload: JSON.stringify({
          id,
          machine_id: machine.id,
          task_date: taskDate,
          current_score: score,
          photo_urls: photos,
          notes,
        }),
        retry_count: 0,
        last_error: null,
        created_at: now,
      });

      setSaved(true);
      setTimeout(() => navigate('/machines'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!machine) {
    return <div style={{ padding: 16, color: '#666' }}>Loading machine...</div>;
  }

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← Back
      </button>

      <h2 style={{ margin: '0 0 4px', color: '#0066CC' }}>Daily Task</h2>
      <p style={{ margin: '0 0 20px', color: '#666', fontSize: 14 }}>
        {machine.merchant_name} · {machine.location_name}
      </p>
      <div style={{ background: '#f0f7ff', borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#555' }}>Last Recorded Score</p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#0066CC' }}>
          {machine.last_recorded_score}
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
            placeholder="Enter current score"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 16, boxSizing: 'border-box' }}
          />
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
          disabled={saving}
          style={{ width: '100%', padding: 14, background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving...' : 'Submit Task'}
        </button>
      </form>
    </div>
  );
}
