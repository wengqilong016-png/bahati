import { useState, useRef, useCallback, FormEvent, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { PhotoCapture } from '../components/PhotoCapture';
import { useAuth } from '../hooks/useAuth';
import { useGeolocation } from '../hooks/useGeolocation';
import { db } from '../lib/db';
import type { OnboardingType } from '../lib/types';
import { ONBOARDING_TYPES } from '../lib/types';
import { createKioskOnboarding, saveOnboarding } from '../lib/actions';
import { uploadOnboardingPhoto } from '../lib/storage';

export function OnboardKioskPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const geo = useGeolocation();
  const kiosks = useLiveQuery(() => db.kiosks.toArray(), []);

  // Existing onboarding records to show submission status
  const onboardingRecords = useLiveQuery(
    () => db.kiosk_onboarding_records.toArray(),
    [],
  );

  // Pre-generate a stable ID for this onboarding session's storage path
  const onboardingIdRef = useRef<string>(crypto.randomUUID());
  // Timer ref for auto-dismissing the success banner — cleaned up on unmount
  const savedTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== undefined) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  const initialType: OnboardingType =
    searchParams.get('type') === 'recertification' ? 'recertification' : 'onboarding';

  const [onboardingType, setOnboardingType] = useState<OnboardingType>(initialType);
  const [kioskId, setKioskId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [merchantContactName, setMerchantContactName] = useState('');
  const [merchantPhone, setMerchantPhone] = useState('');
  const [locationName, setLocationName] = useState('');
  const [initialScore, setInitialScore] = useState('');
  const [initialCoinLoan, setInitialCoinLoan] = useState('');
  const [notes, setNotes] = useState('');
  const [dividendRate, setDividendRate] = useState('15');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRecert = onboardingType === 'recertification';
  const title = isRecert ? '复查' : '新机入网';
  const submitLabel = isRecert ? '提交复查' : '提交入网';

  // Auto-capture GPS when the page mounts (non-blocking)
  useEffect(() => {
    void geo.capture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear mode-specific fields when switching between onboarding and re-certification
  useEffect(() => {
    if (isRecert) {
      setSerialNumber('');
      setMerchantName('');
      setMerchantContactName('');
      setMerchantPhone('');
      setLocationName('');
      setInitialScore('');
      setInitialCoinLoan('');
      setDividendRate('15');
    } else {
      setKioskId('');
      setSerialNumber('');
    }
  }, [isRecert]);

  // Pre-fill serial number when a kiosk is selected in re-certification mode
  useEffect(() => {
    if (!isRecert) return;
    const k = kiosks?.find(kk => kk.id === kioskId);
    if (k) setSerialNumber(k.serial_number);
  }, [isRecert, kioskId, kiosks]);

  const uploadFn = useCallback(
    (file: File) => uploadOnboardingPhoto(file, onboardingIdRef.current),
    [],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);

    // Capture GPS silently (non-blocking — submit proceeds even if GPS fails)
    const gpsCoords = geo.coords ?? await geo.capture();

    try {
      if (isRecert) {
        await saveOnboarding({
          id: onboardingIdRef.current,
          kioskId,
          onboardingType,
          photoUrls: photos,
          notes: notes.trim(),
          latitude: gpsCoords?.latitude,
          longitude: gpsCoords?.longitude,
        });
        const { processQueue } = await import('../lib/sync');
        await processQueue();
      } else {
        const parsedInitialScore = parseInt(initialScore, 10);
        const parsedInitialCoinLoan = Number(initialCoinLoan);
        const parsedDividendRate = parseFloat(dividendRate) / 100;

        await createKioskOnboarding({
          onboardingId: onboardingIdRef.current,
          merchantName,
          merchantContactName,
          merchantPhone,
          merchantAddress: locationName,
          kioskSerialNumber: serialNumber,
          kioskLocationName: locationName,
          initialScore: Number.isNaN(parsedInitialScore) ? 0 : parsedInitialScore,
          initialCoinLoan: Number.isNaN(parsedInitialCoinLoan) ? 0 : parsedInitialCoinLoan,
          dividendRate: Number.isNaN(parsedDividendRate) ? 0.15 : parsedDividendRate,
          photoUrls: photos,
          notes: notes.trim(),
          latitude: gpsCoords?.latitude,
          longitude: gpsCoords?.longitude,
        });
      }
      setSaved(true);
      // Reset form for next entry (stay on page for continuous input)
      onboardingIdRef.current = crypto.randomUUID();
      setKioskId('');
      setSerialNumber('');
      setMerchantName('');
      setMerchantContactName('');
      setMerchantPhone('');
      setLocationName('');
      setInitialScore('');
      setInitialCoinLoan('');
      setDividendRate('15');
      setNotes('');
      setPhotos([]);
      // Auto-dismiss the success banner; use ref so it can be cleared on unmount
      if (savedTimerRef.current !== undefined) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← 返回
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
            {t === 'onboarding' ? '➕ 入网' : '🔄 复查'}
          </button>
        ))}
      </div>

      {saved && (
        <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ✅ 已保存！正在跳转...
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
            最近提交
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
              const statusLabel = rec.status === 'approved' ? '✅ 已通过'
                : rec.status === 'rejected' ? '❌ 已拒绝' : '⏳ 审核中';
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
        {isRecert && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              选择机器 *
            </label>
            <select
              value={kioskId}
              onChange={e => setKioskId(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box', background: '#fff' }}
            >
              <option value="">— 请选择机器 —</option>
              {kiosks?.map(k => (
                <option key={k.id} value={k.id}>
                  {k.serial_number} — {k.merchant_name} ({k.location_name})
                </option>
              ))}
            </select>
            {kiosks && kiosks.length === 0 && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#e65100' }}>
                未找到机器，请先同步数据。
              </p>
            )}
          </div>
        )}

        {!isRecert && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
                商家名称 *
              </label>
              <input
                type="text"
                value={merchantName}
                onChange={e => setMerchantName(e.target.value)}
                required
                placeholder="例：Bahati 商店"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
                商家联系人
              </label>
              <input
                type="text"
                value={merchantContactName}
                onChange={e => setMerchantContactName(e.target.value)}
                placeholder="联系人姓名"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
                商家电话
              </label>
              <input
                type="tel"
                value={merchantPhone}
                onChange={e => setMerchantPhone(e.target.value)}
                placeholder="+255700000000"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
                机器位置 *
              </label>
              <input
                type="text"
                value={locationName}
                onChange={e => setLocationName(e.target.value)}
                required
                placeholder="详细地址"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>
          </>
        )}

        {/* Serial number — editable for new onboarding so driver can correct it on-site */}
        {!isRecert && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              机器编号 *
            </label>
            <input
              type="text"
              value={serialNumber}
              onChange={e => setSerialNumber(e.target.value)}
              required
              placeholder="SK-2024-001"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {/* Dividend rate — for new onboarding only */}
        {!isRecert && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              分红比例 (%) *
            </label>
            <input
              type="number"
              value={dividendRate}
              onChange={e => setDividendRate(e.target.value)}
              onFocus={e => e.target.select()}
              required
              min={0}
              max={100}
              step="0.1"
              placeholder="15"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {/* Initial coin loan — for new onboarding only */}
        {!isRecert && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              初始硬币借出
            </label>
            <input
              type="number"
              value={initialCoinLoan}
              onChange={e => setInitialCoinLoan(e.target.value)}
              onFocus={e => e.target.select()}
              min={0}
              step="0.01"
              placeholder="0"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>
        )}

        {!isRecert && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              初始分数 *
            </label>
            <input
              type="number"
              value={initialScore}
              onChange={e => setInitialScore(e.target.value)}
              onFocus={e => e.target.select()}
              required
              min={0}
              placeholder="0"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
            备注
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder={isRecert ? '复查说明...' : '安装说明...'}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
            照片 ({photos.length}){!isRecert && ' *'}
          </label>
          <PhotoCapture
            photos={photos}
            onPhotosChange={setPhotos}
            uploadFn={uploadFn}
            disabled={saving}
          />
          {!isRecert && photos.length === 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#e65100' }}>
              入网必须至少拍摄一张照片。
            </p>
          )}
        </div>

        {/* GPS location */}
        <div style={{ marginBottom: 20, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontWeight: 600, fontSize: 14 }}>📍 GPS 定位</label>
            <button
              type="button"
              disabled={geo.loading || saving}
              onClick={() => void geo.capture()}
              style={{
                padding: '6px 14px', border: '1px solid #0066CC', borderRadius: 6,
                background: geo.loading ? '#f0f0f0' : '#fff', color: '#0066CC',
                fontSize: 13, cursor: geo.loading ? 'not-allowed' : 'pointer',
              }}
            >
              {geo.loading ? '定位中…' : geo.coords ? '🔄 刷新' : '📍 获取定位'}
            </button>
          </div>
          {geo.coords && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#2e7d32' }}>
              ✅ {geo.coords.latitude.toFixed(6)}, {geo.coords.longitude.toFixed(6)}
              {geo.coords.accuracy != null && ` (±${Math.round(geo.coords.accuracy)}m)`}
            </p>
          )}
          {geo.error && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#c62828' }}>⚠️ {geo.error}</p>
          )}
          {!geo.coords && !geo.error && !geo.loading && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888' }}>提交时自动获取定位</p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{ width: '100%', padding: 14, background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? '保存中...' : submitLabel}
        </button>
      </form>
    </div>
  );
}
