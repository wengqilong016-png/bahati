import { useUpdateChecker } from '../hooks/useUpdateChecker';

/**
 * A dismissible banner that appears when a newer APK is available
 * on GitHub Releases.  Renders nothing when no update is found
 * or after the user dismisses it.
 */
export function UpdateBanner() {
  const { hasUpdate, latestVersion, downloadUrl, dismiss, dismissed } = useUpdateChecker();

  if (!hasUpdate || dismissed) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 16px',
        background: '#0066CC',
        color: '#fff',
        fontSize: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <span>
        🆕 新版本 <strong>v{latestVersion}</strong> 已发布
      </span>

      <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#fff',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: 6,
              padding: '4px 12px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            更新
          </a>
        )}
        <button
          onClick={dismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: 18,
            cursor: 'pointer',
            lineHeight: 1,
            padding: '0 4px',
          }}
          aria-label="关闭更新提示"
        >
          ✕
        </button>
      </span>
    </div>
  );
}
