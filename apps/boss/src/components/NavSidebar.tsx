import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useConnectionStatus, type ConnectionStatus } from '../hooks/useConnectionStatus';
import { colors, radius, shadow, font, transition } from '../lib/theme';

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

// Inline SVG icons for nav items
const NavIcons: Record<string, React.FC<{ size?: number; color?: string }>> = {
  dashboard: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  drivers: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  merchants: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1-6h16l1 6" /><path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" />
      <path d="M9 9v12M15 9v12" />
    </svg>
  ),
  kiosks: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" />
    </svg>
  ),
  approvals: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  tasks: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  ),
  reports: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  map: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  ),
  more: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1" fill={color} /><circle cx="12" cy="12" r="1" fill={color} /><circle cx="19" cy="12" r="1" fill={color} />
    </svg>
  ),
  collapse: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  expand: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  signout: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

const navItems = [
  { to: '/dashboard', label: 'Dashboard', iconKey: 'dashboard' },
  { to: '/drivers', label: '司机管理', iconKey: 'drivers' },
  { to: '/merchants', label: '商家管理', iconKey: 'merchants' },
  { to: '/kiosks', label: '机器管理', iconKey: 'kiosks' },
  { to: '/tasks', label: '每日任务', iconKey: 'tasks' },
  { to: '/approvals', label: '审批中心', iconKey: 'approvals' },
  { to: '/reports', label: '报表中心', iconKey: 'reports' },
  { to: '/map', label: '地图概览', iconKey: 'map' },
];

const bottomNavItems = navItems.slice(0, 5);
const SIDEBAR_FULL = 220;
const SIDEBAR_MINI = 56;

export function NavSidebar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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

  const sidebarWidth = collapsed ? SIDEBAR_MINI : SIDEBAR_FULL;

  return (
    <>
      {/* ===== Desktop / Tablet sidebar (≥769px) ===== */}
      <aside
        className="boss-sidebar"
        style={{
          width: sidebarWidth,
          minHeight: '100vh',
          background: colors.surface,
          borderRight: `1px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          transition: 'width 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: collapsed ? '16px 0' : '18px 16px 12px',
          borderBottom: `1px solid ${colors.border}`,
          whiteSpace: 'nowrap',
          display: 'flex',
          flexDirection: 'column',
          alignItems: collapsed ? 'center' : 'flex-start',
          gap: 4,
        }}>
          {!collapsed && (
            <>
              <h1 style={{ margin: 0, fontSize: 17, color: colors.primary, fontWeight: font.weights.bold, fontFamily: font.family }}>SmartKiosk</h1>
              <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>老板后台</p>
            </>
          )}
          {collapsed && (
            <span style={{ fontSize: 20 }} title="SmartKiosk">⬡</span>
          )}

          {/* Connection status indicator */}
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColor,
                display: 'inline-block',
                flexShrink: 0,
                boxShadow: connStatus === 'connected' ? `0 0 0 2px ${dotColor}33` : 'none',
              }} />
              <span style={{ fontSize: font.sizes.xs, color: connStatus === 'connected' ? colors.textSecondary : dotColor, fontWeight: font.weights.semibold }}>
                {connLabel}
              </span>
            </div>
          )}
          {connStatus === 'config-error' && !collapsed && (
            <div style={{
              marginTop: 6,
              padding: '6px 8px',
              background: colors.dangerLight,
              border: `1px solid #f5c6cb`,
              borderRadius: radius.sm,
              fontSize: 10,
              color: colors.danger,
              lineHeight: 1.4,
              whiteSpace: 'normal',
            }}>
              环境变量未正确配置，请将变量名改为 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }} aria-label="主导航">
          {navItems.map(item => {
            const Icon = NavIcons[item.iconKey];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className="nav-item"
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 10,
                  padding: collapsed ? '11px 0' : '9px 16px',
                  textDecoration: 'none',
                  color: isActive ? colors.primary : colors.textSecondary,
                  background: isActive ? colors.primaryLight : 'transparent',
                  fontWeight: isActive ? font.weights.bold : font.weights.normal,
                  fontSize: font.sizes.sm + 1,
                  borderLeft: isActive ? `3px solid ${colors.primary}` : '3px solid transparent',
                  whiteSpace: 'nowrap',
                  transition: transition.fast,
                })}
              >
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <Icon size={18} />
                </span>
                {!collapsed && item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer: collapse toggle + sign out */}
        <div style={{ padding: collapsed ? '10px 0' : '10px 12px', borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 6, alignItems: collapsed ? 'center' : 'stretch' }}>
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: collapsed ? 36 : '100%',
              padding: '7px',
              background: 'none',
              color: colors.textMuted,
              border: `1px solid ${colors.divider}`,
              borderRadius: radius.sm,
              cursor: 'pointer',
              fontSize: font.sizes.sm,
              transition: transition.fast,
            }}
          >
            {collapsed ? <NavIcons.expand size={16} /> : (
              <>
                <NavIcons.collapse size={16} />
                <span style={{ marginLeft: 6, whiteSpace: 'nowrap' }}>收起</span>
              </>
            )}
          </button>

          {!collapsed && (
            <button
              onClick={() => void handleSignOut()}
              aria-label="退出登录"
              style={{
                width: '100%',
                padding: '7px',
                background: 'none',
                color: colors.textSecondary,
                border: `1px solid ${colors.divider}`,
                borderRadius: radius.sm,
                cursor: 'pointer',
                fontSize: font.sizes.sm,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: transition.fast,
              }}
            >
              <NavIcons.signout size={15} />
              退出登录
            </button>
          )}
          {collapsed && (
            <button
              onClick={() => void handleSignOut()}
              aria-label="退出登录"
              title="退出登录"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                padding: '7px',
                background: 'none',
                color: colors.danger,
                border: `1px solid ${colors.divider}`,
                borderRadius: radius.sm,
                cursor: 'pointer',
              }}
            >
              <NavIcons.signout size={16} color={colors.danger} />
            </button>
          )}
        </div>
      </aside>

      {/* ===== Mobile bottom tab bar (≤768px) ===== */}
      <nav
        className="boss-bottom-nav"
        aria-label="底部导航"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderTop: `1px solid ${colors.border}`,
          display: 'none',
          zIndex: 100,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          {bottomNavItems.map(item => {
            const Icon = NavIcons[item.iconKey];
            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '7px 2px 5px',
                  textDecoration: 'none',
                  color: isActive ? colors.primary : colors.textMuted,
                  fontSize: 10,
                  fontWeight: isActive ? font.weights.bold : font.weights.normal,
                  flex: 1,
                  transition: transition.fast,
                  position: 'relative',
                }}
              >
                {isActive && (
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    left: '25%',
                    right: '25%',
                    height: 2,
                    background: colors.primary,
                    borderRadius: '0 0 2px 2px',
                  }} />
                )}
                <Icon size={20} color={isActive ? colors.primary : colors.textMuted} />
                <span style={{ marginTop: 3 }}>{item.label}</span>
              </NavLink>
            );
          })}
          {/* More menu button */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="更多菜单"
            aria-expanded={menuOpen}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '7px 2px 5px',
              background: 'none',
              border: 'none',
              color: menuOpen ? colors.primary : colors.textMuted,
              fontSize: 10,
              fontWeight: menuOpen ? font.weights.bold : font.weights.normal,
              cursor: 'pointer',
              flex: 1,
              transition: transition.fast,
            }}
          >
            <NavIcons.more size={20} color={menuOpen ? colors.primary : colors.textMuted} />
            <span style={{ marginTop: 3 }}>更多</span>
          </button>
        </div>

        {/* Slide-up more drawer */}
        {menuOpen && (
          <div
            className="slide-up"
            style={{
              position: 'fixed',
              bottom: 57,
              left: 0,
              right: 0,
              background: colors.surface,
              borderTop: `1px solid ${colors.border}`,
              boxShadow: shadow.bottomNav,
              padding: '14px 16px',
              borderRadius: `${radius.xl}px ${radius.xl}px 0 0`,
            }}
          >
            {navItems.slice(bottomNavItems.length).map(item => {
              const Icon = NavIcons[item.iconKey];
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 8px',
                    textDecoration: 'none',
                    color: isActive ? colors.primary : colors.text,
                    fontWeight: isActive ? font.weights.bold : font.weights.normal,
                    fontSize: font.sizes.base,
                    borderRadius: radius.md,
                    background: isActive ? colors.primaryLight : 'transparent',
                  }}
                >
                  <Icon size={20} color={isActive ? colors.primary : colors.textSecondary} />
                  {item.label}
                </NavLink>
              );
            })}
            <button
              onClick={() => { setMenuOpen(false); void handleSignOut(); }}
              aria-label="退出登录"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                marginTop: 8,
                padding: '11px 8px',
                background: 'none',
                color: colors.danger,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                cursor: 'pointer',
                fontSize: font.sizes.base,
                textAlign: 'left',
              }}
            >
              <NavIcons.signout size={20} color={colors.danger} />
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
        .nav-item:hover {
          background-color: ${colors.primaryLight} !important;
          color: ${colors.primary} !important;
        }
      `}</style>
    </>
  );
}

