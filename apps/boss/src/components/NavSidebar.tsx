import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/machines', label: 'Machines', icon: '🏪' },
  { to: '/approvals', label: 'Score Approvals', icon: '✅' },
  { to: '/settlements', label: 'Settlements', icon: '💰' },
  { to: '/ledger/drivers', label: 'Driver Ledger', icon: '👤' },
  { to: '/ledger/merchants', label: 'Merchant Ledger', icon: '🏷️' },
];

export function NavSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'none',
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 200,
          background: '#0066CC',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: 18,
        }}
        className="sidebar-toggle"
        aria-label="Toggle menu"
      >
        ☰
      </button>

      <aside style={{
        width: collapsed ? 0 : 220,
        minHeight: '100vh',
        background: '#fff',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap' }}>
          <h1 style={{ margin: 0, fontSize: 18, color: '#0066CC', fontWeight: 700 }}>SmartKiosk</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#999' }}>Boss Dashboard</p>
        </div>

        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                textDecoration: 'none',
                color: isActive ? '#0066CC' : '#444',
                background: isActive ? '#e8f0fe' : 'transparent',
                fontWeight: isActive ? 700 : 400,
                fontSize: 14,
                borderLeft: isActive ? '3px solid #0066CC' : '3px solid transparent',
                whiteSpace: 'nowrap',
              })}
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => void handleSignOut()}
            style={{
              width: '100%',
              padding: '8px 0',
              background: 'none',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              whiteSpace: 'nowrap',
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
