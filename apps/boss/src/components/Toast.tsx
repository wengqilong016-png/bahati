import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { colors, radius, shadow, font } from '../lib/theme';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  exiting: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

const BG_COLORS: Record<ToastType, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 250);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, type, message, exiting: false }]);
    setTimeout(() => removeToast(id), 3000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="false"
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'none',
            minWidth: 260,
            maxWidth: 420,
          }}
        >
          {toasts.map(toast => (
            <div
              key={toast.id}
              role="status"
              className={toast.exiting ? 'toast-exit' : 'toast-enter'}
              style={{
                background: BG_COLORS[toast.type],
                color: '#fff',
                borderRadius: radius.md,
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: shadow.modal,
                fontSize: font.sizes.md,
                fontWeight: font.weights.medium,
                pointerEvents: 'auto',
              }}
            >
              <span style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: font.weights.bold,
                fontSize: font.sizes.sm,
                flexShrink: 0,
              }}>
                {ICONS[toast.type]}
              </span>
              <span style={{ flex: 1 }}>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
