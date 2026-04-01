// Design tokens – single source of truth for the Boss app UI
export const colors = {
  primary: '#0066CC',
  primaryLight: '#e8f0fe',
  primaryDark: '#003d80',

  success: '#1e7e34',
  successLight: '#e6f4ea',
  successDark: '#1565c0',

  warning: '#e65100',
  warningLight: '#fff3e0',

  danger: '#c62828',
  dangerLight: '#fce8e6',

  info: '#1565c0',
  infoLight: '#e3f2fd',

  text: '#333',
  textSecondary: '#666',
  textMuted: '#888',
  textDisabled: '#aaa',

  border: '#e0e0e0',
  borderLight: '#f0f0f0',
  divider: '#ddd',

  bg: '#f5f5f5',
  surface: '#fff',
  surfaceHover: '#f5f8ff',
  surfaceAlt: '#fafafa',
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  badge: 10,
  pill: 20,
};

export const shadow = {
  card: '0 1px 4px rgba(0,0,0,0.08)',
  cardHover: '0 4px 12px rgba(0,0,0,0.12)',
  modal: '0 8px 32px rgba(0,0,0,0.18)',
  bottomNav: '0 -4px 16px rgba(0,0,0,0.08)',
};

export const font = {
  family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  sizes: {
    xs: 11,
    sm: 12,
    md: 14,
    base: 15,
    lg: 16,
    xl: 18,
    xxl: 20,
    h1: 24,
    metric: 22,
  },
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const transition = {
  fast: 'all 0.15s ease',
  normal: 'all 0.2s ease',
};
