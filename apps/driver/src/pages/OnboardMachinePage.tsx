import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { PhotoCapture } from '../components/PhotoCapture';
import { useAuth } from '../hooks/useAuth';

export function OnboardMachinePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [machineId, setMachineId] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handlePhoto = (dataUrl: string) => {
    setPhotos(prev => [...prev, dataUrl]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.machine_onboardings.add({
      id,
      machine_id: machineId,
      photo_urls: photos,
      notes,
      sync_status: 'pending',
      created_at: now,
    });

    await db.sync_queue.add({
      table_name: 'machine_onboardings',
      record_id: id,
      operation: 'insert',
      payload: JSON.stringify({
        id,
        machine_id: machineId,
        photo_urls: photos,
        notes,
      }),
      retry_count: 0,
      last_error: null,
      created_at: now,
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => navigate('/machines'), 1200);
  };

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>Onboard Machine</h2>

      {saved && (
        <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ✅ Saved! Redirecting...
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
            Machine ID
          </label>
          <input
            value={machineId}
            onChange={e => setMachineId(e.target.value)}
            required
            placeholder="Enter machine UUID or serial"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
            Notes
          </label>
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
          {saving ? 'Saving...' : 'Submit Onboarding'}
        </button>
      </form>
    </div>
  );
}
