import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface LoginPageProps {
  onLogin: (driverId: string, phone: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({ phone });
      if (authError) throw authError;
      setStep('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms',
      });
      if (authError) throw authError;
      if (data.user) {
        onLogin(data.user.id, phone);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>SmartKiosk 司机登录</h1>

      {step === 'phone' ? (
        <form onSubmit={handleSendOtp}>
          <label style={{ display: 'block', marginBottom: 8 }}>
            手机号
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254712345678"
              required
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>
          <button
            type="submit"
            disabled={loading || !phone}
            style={{ padding: '8px 24px', marginTop: 8 }}
          >
            {loading ? '发送中…' : '发送验证码'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <p style={{ marginBottom: 8 }}>验证码已发送至 {phone}</p>
          <label style={{ display: 'block', marginBottom: 8 }}>
            验证码
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              required
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>
          <button
            type="submit"
            disabled={loading || !otp}
            style={{ padding: '8px 24px', marginTop: 8 }}
          >
            {loading ? '验证中…' : '登录'}
          </button>
          <button
            type="button"
            onClick={() => setStep('phone')}
            style={{ marginLeft: 8, padding: '8px 24px', marginTop: 8 }}
          >
            返回
          </button>
        </form>
      )}

      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
    </div>
  );
}
