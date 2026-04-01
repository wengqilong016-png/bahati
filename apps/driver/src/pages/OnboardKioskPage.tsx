import { useState, useRef, useCallback, FormEvent, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { PhotoCapture } from '../components/PhotoCapture';
import { useAuth } from '../hooks/useAuth';
import { db } from '../lib/db';
import type { OnboardingType } from '../lib/types';
import { ONBOARDING_TYPES } from '../lib/types';
import { saveOnboarding, updateKioskDetails } from '../lib/actions';
import { uploadOnboardingPhoto } from '../lib/storage';

export function OnboardKioskPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const kiosks = useLiveQuery(() => db.kiosks.toArray(), []);

  // Existing onboarding records to show submission status
  const onboardingRecords = useLiveQuery(
    () => db.kiosk_onboarding_records.toArray(),
    [],
  );

  // Pre-generate a stable ID for this onboarding session's storage path
  const onboardingIdRef = useRef<string>(crypto.randomUUID());

  const initialType: OnboardingType =
    searchParams.get('type') === 'recertification' ? 'recertification' : 'onboarding';

  const [onboardingType, setOnboardingType] = useState<OnboardingType>(initialType);
  const [kioskId, setKioskId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [initialScore, setInitialScore] = useState('0');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRecert = onboardingType === 'recertification';
  const title = isRecert ? 'Re-certification' : 'New Machine Onboarding';
  const submitLabel = isRecert ? 'Submit Re-certification' : 'Submit Onboarding';

  // Pre-fill serial number when a kiosk is selected
  useEffect(() => {
    const k = kiosks?.find(k => k.id === kioskId);
    if (k) setSerialNumber(k.serial_number);
  }, [kioskId, kiosks]);

  const uploadFn = useCallback(
    (file: File) => uploadOnboardingPhoto(file, onboardingIdRef.current),
    [],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);

    try {
      // For new onboarding: update kiosk serial number and initial score if changed.
      // Fetch directly from Dexie to guarantee we have the actual stored row
      // (the kiosks LiveQuery array may not yet be populated on first render).
      if (!isRecert && kioskId) {
        const k = await db.kiosks.get(kioskId);
        if (!k) {
          throw new Error('Kiosk not found in local database. Please sync first to load your assigned kiosks.');
        }
        const parsedScore = parseInt(initialScore, 10);
        const scoreChanged = !isNaN(parsedScore) && parsedScore !== k.last_recorded_score;
        const serialChanged = serialNumber.trim() !== '' && serialNumber.trim() !== k.serial_number;
        if (serialChanged || scoreChanged) {
          await updateKioskDetails({
            kioskId,
            serialNumber: serialChanged ? serialNumber.trim() : undefined,
            initialScore: scoreChanged ? parsedScore : undefined,
          });
        }
      }

      // Build enhanced notes with serial number and initial score metadata for new onboarding
      const enhancedNotes = !isRecert
        ? [
            serialNumber.trim() ? `Serial: ${serialNumber.trim()}` : null,
            `Initial Score: ${initialScore || '0'}`,
            notes.trim() || null,
          ].filter(Boolean).join(' | ')
        : notes;

      await saveOnboarding({
        id: onboardingIdRef.current,
        kioskId,
        onboardingType,
        photoUrls: photos,
        notes: enhancedNotes,
      });
      // Sync to push record to server
      const { processQueue } = await import('../lib/sync');
      await processQueue();
      setSaved(true);
      setTimeout(() => navigate('/home'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← Back
      </button>

      <h2 style={{ margin: '0 0 16px', color: '#0066CC' }}>{title}</h2>

      {/* Type toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(ONBOARDING_TYPES).map(t => (
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
      {error && (
        <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Show recent onboarding records with review status */}
      {onboardingRecords && onboardingRecords.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#555', fontWeight: 600 }}>
            Recent Submissions
          </h3>
          {[...onboardingRecords]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 5)
            .map(rec => {
              const k = kiosks?.find(kk => kk.id === rec.kiosk_id);
              const statusColor = rec.status === 'approved' ? '#1e7e34'
                : rec.status === 'rejected' ? '#c62828' : '#e65100';
              const statusBg = rec.status === 'approved' ? '#e6f4ea'
                : rec.status === 'rejected' ? '#fce8e6' : '#fff3e0';
              const statusLabel = rec.status === 'approved' ? '✅ Approved'
                : rec.status === 'rejected' ? '❌ Rejected' : '⏳ Pending';
              return (
                <div key={rec.id} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 10, marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {k?.serial_number ?? rec.kiosk_id.slice(0, 8)} · {rec.onboarding_type}
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: statusBg, color: statusColor }}>
                      {statusLabel}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#999' }}>
                    {new Date(rec.created_at).toLocaleDateString()}
                  </p>
                </div>
              );
            })}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
            Select Kiosk *
          </label>
          <select
            value={kioskId}
            onChange={e => setKioskId(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box', background: '#fff' }}
          >
            <option value="">— Select a kiosk —</option>
            {kiosks?.map(k => (
              <option key={k.id} value={k.id}>
                {k.serial_number} — {k.merchant_name} ({k.location_name})
              </option>
            ))}
          </select>
          {kiosks && kiosks.length === 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#e65100' }}>
              No kiosks found. Please sync first to load your assigned kiosks.
            </p>
          )}
        </div>

        {/* Serial number — editable for new onboarding so driver can correct it on-site */}
        {!isRecert && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              Machine Serial Number *
            </label>
            <input
              type="text"
              value={serialNumber}
              onChange={e => setSerialNumber(e.target.value)}
              required
              placeholder="e.g. SK-2024-001"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
            />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#888' }}>
              You can edit this to match the serial number printed on the machine.
            </p>
          </div>
        )}

        {/* Initial score — for new onboarding only */}
        {!isRecert && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              Initial Score Reading *
            </label>
            <input
              type="number"
              value={initialScore}
              onChange={e => setInitialScore(e.target.value)}
              required
              min={0}
              placeholder="0"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
            />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#888' }}>
              Enter the current score reading shown on the machine display.
            </p>
          </div>
        )}

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
            Photos ({photos.length}){!isRecert && ' *'}
          </label>
          <PhotoCapture
            photos={photos}
            onPhotosChange={setPhotos}
            uploadFn={uploadFn}
            disabled={saving}
          />
          {!isRecert && photos.length === 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#e65100' }}>
              At least one photo is required for onboarding.
            </p>
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
