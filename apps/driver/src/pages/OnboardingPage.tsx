import { useState, type FormEvent } from 'react';
import { saveOnboarding } from '../lib/actions';
import { captureLocation } from '../lib/geo';
import PhotoCapture from '../components/PhotoCapture';

interface OnboardingPageProps {
  driverId: string;
}

export default function OnboardingPage({ driverId }: OnboardingPageProps) {
  const [serialNumber, setSerialNumber] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [merchantAddress, setMerchantAddress] = useState('');
  const [merchantContact, setMerchantContact] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    setSuccess(false);

    try {
      if (!photoUri) {
        throw new Error('入网认证照片为必填项');
      }

      const geo = await captureLocation();

      await saveOnboarding({
        kiosk_id: '', // Will be assigned by backend
        driver_id: driverId,
        merchant_id: '',
        merchant_name: merchantName,
        merchant_address: merchantAddress,
        merchant_contact: merchantContact,
        serial_number: serialNumber,
        photo_uri: photoUri,
        notes,
        geo,
      });
      setSuccess(true);
      setSerialNumber('');
      setMerchantName('');
      setMerchantAddress('');
      setMerchantContact('');
      setPhotoUri('');
      setNotes('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 500, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>机器入网 / 重新认证</h1>

      {success && (
        <div style={{ background: '#dcfce7', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ✅ 已保存到本地，等待同步
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>
          机器序列号
          <input
            type="text"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          商户名称
          <input
            type="text"
            value={merchantName}
            onChange={(e) => setMerchantName(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          商户地址
          <input
            type="text"
            value={merchantAddress}
            onChange={(e) => setMerchantAddress(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          商户联系人电话
          <input
            type="tel"
            value={merchantContact}
            onChange={(e) => setMerchantContact(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <PhotoCapture
          value={photoUri}
          onChange={setPhotoUri}
          required
          label="认证照片（必填）"
        />

        <label style={labelStyle}>
          备注
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={inputStyle}
          />
        </label>

        <button type="submit" disabled={saving || !photoUri} style={buttonStyle}>
          {saving ? '保存中…' : '提交入网'}
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
