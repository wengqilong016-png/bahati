import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const connStatus = useConnectionStatus();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #003d80 0%, #0066CC 100%)',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <h1 style={{ color: '#0066CC', margin: '0 0 4px', fontSize: 26 }}>SmartKiosk</h1>
        <p style={{ color: '#888', margin: '0 0 32px', fontSize: 14 }}>Boss Dashboard</p>

        {/* Connection status banner – only shown for actionable error states */}
        {(connStatus === 'config-error' || connStatus === 'network-error') && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            background: connStatus === 'config-error' ? '#fce8e6' : '#fff3cd',
            border: `1px solid ${connStatus === 'config-error' ? '#f5c6cb' : '#ffc107'}`,
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 24,
            fontSize: 12,
            color: connStatus === 'config-error' ? '#c62828' : '#856404',
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>
              {connStatus === 'config-error' ? '🔴' : '🟠'}
            </span>
            <span>
              {connStatus === 'config-error'
                ? '后端配置缺失：请在部署平台将环境变量名称改为 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。'
                : '无法连接到服务器，请检查网络连接。'}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#444' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="boss@example.com"
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#444' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {error && (
            <div style={{ background: '#fce8e6', color: '#c62828', padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              background: '#0066CC',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
