import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/home', label: 'Home', icon: '🏠' },
  { to: '/kiosks', label: 'Kiosks', icon: '🏪' },
  { to: '/onboard', label: 'Onboard', icon: '➕' },
  { to: '/settlement', label: '结算', icon: '💰' },
  { to: '/reconciliation', label: '日结', icon: '📋' },
  { to: '/sync', label: 'Sync', icon: '🔄' },
];

export function NavBar() {
  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      display: 'flex',
      background: '#fff',
      borderTop: '1px solid #e0e0e0',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
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
    </nav>
  );
}
