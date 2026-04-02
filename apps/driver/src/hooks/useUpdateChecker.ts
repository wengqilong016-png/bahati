import { useEffect, useState, useCallback } from 'react';

const GITHUB_OWNER = 'wengqilong016-png';
const GITHUB_REPO = 'bahati';

/** How often to poll for updates (ms) — every 30 minutes. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

interface UpdateInfo {
  /** Whether a newer version is available. */
  hasUpdate: boolean;
  /** Latest version tag from GitHub Releases (e.g. "0.2.0"). */
  latestVersion: string | null;
  /** Direct download URL for the APK asset. */
  downloadUrl: string | null;
}

/**
 * Compares two semver-style version strings (e.g. "0.1.0" vs "0.2.0").
 * Returns true when `remote` is strictly newer than `local`.
 */
function isNewer(local: string, remote: string): boolean {
  const lp = local.split('.').map(Number);
  const rp = remote.split('.').map(Number);
  for (let i = 0; i < Math.max(lp.length, rp.length); i++) {
    const l = lp[i] ?? 0;
    const r = rp[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

/**
 * Periodically checks the latest GitHub Release for the bahati repository
 * and exposes whether an app update is available.
 */
export function useUpdateChecker(): UpdateInfo & { dismiss: () => void; dismissed: boolean } {
  const [info, setInfo] = useState<UpdateInfo>({
    hasUpdate: false,
    latestVersion: null,
    downloadUrl: null,
  });
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => setDismissed(true), []);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
          { headers: { Accept: 'application/vnd.github.v3+json' } },
        );
        if (!res.ok) return;

        const data = (await res.json()) as {
          tag_name: string;
          assets: Array<{ name: string; browser_download_url: string }>;
        };

        // Strip leading "v" from tag (e.g. "v0.2.0" → "0.2.0")
        const remoteVersion = data.tag_name.replace(/^v/, '');
        const currentVersion = __APP_VERSION__;

        const apkAsset = data.assets.find((a) => a.name.endsWith('.apk'));

        if (!cancelled) {
          setInfo({
            hasUpdate: isNewer(currentVersion, remoteVersion),
            latestVersion: remoteVersion,
            downloadUrl: apkAsset?.browser_download_url ?? null,
          });
        }
      } catch {
        // Network errors are expected when offline — silently ignore.
      }
    }

    void check();
    const id = setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { ...info, dismiss, dismissed };
}
