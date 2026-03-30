import { useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/db';
import { PhotoCapture } from '../components/PhotoCapture';
import { useAuth } from '../hooks/useAuth';
import type { OnboardingType } from '../lib/types';

export function OnboardMachinePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const initialType: OnboardingType =
    searchParams.get('type') === 'recertification' ? 'recertification' : 'onboarding';

  const [onboardingType, setOnboardingType] = useState<OnboardingType>(initialType);
  const [machineId, setMachineId] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isRecert = onboardingType === 'recertification';
  const title = isRecert ? 'Re-certification' : 'Kiosk Onboarding';
  const submitLabel = isRecert ? 'Submit Re-certification' : 'Submit Onboarding';

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
      onboarding_type: onboardingType,
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
        onboarding_type: onboardingType,
        photo_urls: photos,
        notes,
      }),
      retry_count: 0,
      last_error: null,
      created_at: now,
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => navigate('/home'), 1200);
  };

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← Back
      </button>

      <h2 style={{ margin: '0 0 16px', color: '#0066CC' }}>{title}</h2>

      {/* Type toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['onboarding', 'recertification'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setOnboardingType(t)}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', border: 'none',
              background: onboardingType === t ? '#0066CC' : '#f0f0f0',
              color: onboardingType === t ? '#fff' : '#333',
            }}
          >
            {t === 'onboarding' ? '➕ Onboarding' : '🔄 Re-certification'}
          </button>
        ))}
      </div>

      {saved && (
        <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ✅ Saved! Redirecting...
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
            Machine ID / Serial Number *
          </label>
          <input
            value={machineId}
            onChange={e => setMachineId(e.target.value)}
            required
            placeholder="Enter machine UUID or serial number"
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
            placeholder={isRecert ? 'Describe re-certification details...' : 'Any notes about the installation...'}
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
          {saving ? 'Saving...' : submitLabel}
        </button>
      </form>
    </div>
  );
}
