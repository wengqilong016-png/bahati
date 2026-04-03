import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

// Map Supabase English error messages (which are always in English regardless of locale)
// to user-facing Chinese messages.
function localizeAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return '邮箱或密码错误，请重试。';
  if (/email not confirmed/i.test(msg)) return '邮箱尚未验证，请联系管理员。';
  if (/network|fetch|failed to fetch/i.test(msg)) return '网络连接失败，请检查网络后重试。';
  if (/too many requests/i.test(msg)) return '登录尝试过于频繁，请稍候再试。';
  console.error('未匹配的登录错误原文:', msg);
  return '登录失败，请稍后重试。';
}

export function LoginPage() {
  const { user, loading: authLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const connStatus = useConnectionStatus();

  // Auto-redirect when a session is already active (e.g. app reopen)
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/home', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(localizeAuthError(err));
    } else {
      navigate('/home');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
      padding: 16,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 32,
        width: '100%',
        maxWidth: 360,
        boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
      }}>
        <h1 style={{ color: '#0066CC', margin: '0 0 8px', fontSize: 24 }}>SmartKiosk</h1>
        <p style={{ color: '#666', margin: '0 0 24px', fontSize: 14 }}>司机端</p>

        {/* Connection status badge – only shown for actionable error states */}
        {(connStatus === 'config-error' || connStatus === 'network-error') && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            background: connStatus === 'config-error' ? '#fce8e6' : '#fff3cd',
            border: `1px solid ${connStatus === 'config-error' ? '#f5c6cb' : '#ffc107'}`,
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 20,
            fontSize: 12,
            color: connStatus === 'config-error' ? '#c62828' : '#856404',
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>
              {connStatus === 'config-error' ? '🔴' : '🟠'}
            </span>
            <span>
              {connStatus === 'config-error'
                ? '后端配置缺失：请在部署平台将环境变量重命名为 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。'
                : '无法连接服务器，请检查网络连接。'}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 600 }}>
              邮箱
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 16,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 600 }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 16,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#CC0000', fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0066CC',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
