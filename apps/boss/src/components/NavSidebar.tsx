import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useConnectionStatus, type ConnectionStatus } from '../hooks/useConnectionStatus';

const CONNECTION_COLORS: Record<ConnectionStatus, string> = {
  connected: '#22c55e',
  'config-error': '#ef4444',
  'network-error': '#f97316',
  checking: '#a3a3a3',
};

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connected: '已连接',
  'config-error': '配置错误',
  'network-error': '网络错误',
  checking: '连接中…',
};

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/drivers', label: '司机管理', icon: '🚗' },
  { to: '/merchants', label: '商家管理', icon: '🏷️' },
  { to: '/kiosks', label: '机器管理', icon: '🏪' },
  { to: '/approvals', label: '审批中心', icon: '✅' },
  { to: '/reports', label: '报表中心', icon: '📈' },
  { to: '/map', label: '地图概览', icon: '🗺️' },
];

const bottomNavItems = navItems.slice(0, 5);

export function NavSidebar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const connStatus = useConnectionStatus();
  const dotColor = CONNECTION_COLORS[connStatus];
  const connLabel = CONNECTION_LABELS[connStatus];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      {/* ===== Desktop / Tablet sidebar (≥769px) ===== */}
      <aside className="boss-sidebar" style={{
        width: 200,
        minHeight: '100vh',
        background: '#fff',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap' }}>
          <h1 style={{ margin: 0, fontSize: 17, color: '#0066CC', fontWeight: 700 }}>SmartKiosk</h1>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#999' }}>老板后台</p>
          {/* Connection status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              display: 'inline-block',
              flexShrink: 0,
              boxShadow: connStatus === 'connected' ? `0 0 0 2px ${dotColor}33` : 'none',
            }} />
            <span style={{ fontSize: 11, color: connStatus === 'connected' ? '#666' : dotColor, fontWeight: 500 }}>
              {connLabel}
            </span>
          </div>
          {/* Warn on misconfiguration */}
          {connStatus === 'config-error' && (
            <div style={{
              marginTop: 8,
              padding: '6px 8px',
              background: '#fce8e6',
              border: '1px solid #f5c6cb',
              borderRadius: 6,
              fontSize: 10,
              color: '#c62828',
              lineHeight: 1.4,
              whiteSpace: 'normal',
            }}>
              环境变量未正确配置，请将变量名改为 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 16px',
                textDecoration: 'none',
                color: isActive ? '#0066CC' : '#444',
                background: isActive ? '#e8f0fe' : 'transparent',
                fontWeight: isActive ? 700 : 400,
                fontSize: 13,
                borderLeft: isActive ? '3px solid #0066CC' : '3px solid transparent',
                whiteSpace: 'nowrap',
              })}
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => void handleSignOut()}
            style={{
              width: '100%',
              padding: '7px 0',
              background: 'none',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* ===== Mobile bottom tab bar (≤768px) ===== */}
      <nav className="boss-bottom-nav" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#fff',
        borderTop: '1px solid #e0e0e0',
        display: 'none',
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          {bottomNavItems.map(item => {
            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
            return (
              <NavLink
                key={item.to}
                to={item.to}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '6px 2px 4px',
                  textDecoration: 'none',
                  color: isActive ? '#0066CC' : '#888',
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 400,
                  flex: 1,
                }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span style={{ marginTop: 2 }}>{item.label}</span>
              </NavLink>
            );
          })}
          {/* More menu button */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '6px 2px 4px',
              background: 'none',
              border: 'none',
              color: menuOpen ? '#0066CC' : '#888',
              fontSize: 10,
              fontWeight: menuOpen ? 700 : 400,
              cursor: 'pointer',
              flex: 1,
            }}
          >
            <span style={{ fontSize: 20 }}>⋯</span>
            <span style={{ marginTop: 2 }}>更多</span>
          </button>
        </div>

        {/* Slide-up more menu */}
        {menuOpen && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            borderTop: '1px solid #e0e0e0',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
            padding: '12px 16px',
          }}>
            {navItems.slice(bottomNavItems.length).map(item => {
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 8px',
                    textDecoration: 'none',
                    color: isActive ? '#0066CC' : '#444',
                    fontWeight: isActive ? 700 : 400,
                    fontSize: 14,
                    borderRadius: 8,
                    background: isActive ? '#e8f0fe' : 'transparent',
                  }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </NavLink>
              );
            })}
            <button
              onClick={() => { setMenuOpen(false); void handleSignOut(); }}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 8,
                padding: '10px',
                background: 'none',
                color: '#c62828',
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              退出登录
            </button>
          </div>
        )}
      </nav>

      {/* CSS media queries for responsive layout */}
      <style>{`
        @media (max-width: 768px) {
          .boss-sidebar { display: none !important; }
          .boss-bottom-nav { display: block !important; }
        }
      `}</style>
    </>
  );
}
