import { NavLink } from 'react-router-dom';
import { useConnectionStatus, type ConnectionStatus } from '../hooks/useConnectionStatus';

const tabs = [
  { to: '/home', label: 'Home', icon: '🏠' },
  { to: '/kiosks', label: 'Kiosks', icon: '🏪' },
  { to: '/onboard', label: 'Onboard', icon: '➕' },
  { to: '/settlement', label: 'Settlement', icon: '💰' },
  { to: '/reconciliation', label: 'Daily Close', icon: '📋' },
  { to: '/sync', label: 'Sync', icon: '🔄' },
];

const CONNECTION_COLORS: Record<ConnectionStatus, string> = {
  connected: '#22c55e',
  'config-error': '#ef4444',
  'network-error': '#f97316',
  checking: '#a3a3a3',
};

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  'config-error': 'Config Error',
  'network-error': 'Network Error',
  checking: 'Connecting…',
};

export function NavBar() {
  const connStatus = useConnectionStatus();
  const dotColor = CONNECTION_COLORS[connStatus];
  const label = CONNECTION_LABELS[connStatus];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#fff',
      borderTop: '1px solid #e0e0e0',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* Connection status bar – only shown when there is an actionable problem */}
      {connStatus !== 'connected' && connStatus !== 'checking' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '3px 0',
          background: '#fff8f0',
          borderBottom: '1px solid #fde68a',
        }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: dotColor,
            display: 'inline-block',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: '#92400e' }}>
            {label}
          </span>
        </div>
      )}

      {/* Tab row */}
      <div style={{ display: 'flex' }}>
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            style={({ isActive }) => ({
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '8px 4px',
              textDecoration: 'none',
              color: isActive ? '#0066CC' : '#666',
              fontSize: 10,
              fontWeight: isActive ? 700 : 400,
            })}
          >
            <span style={{ fontSize: 20, lineHeight: 1.4 }}>{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
