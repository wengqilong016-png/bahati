/**
 * Lightweight geolocation capture — no map UI, just coordinates.
 * Falls back gracefully on devices without GPS or when permission denied.
 */

import type { GeoPoint } from './types';

/**
 * One-shot position capture with a configurable timeout.
 * Returns null when geolocation is unavailable or the user denies permission.
 */
export function captureLocation(timeoutMs = 10_000): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          captured_at: new Date().toISOString(),
        });
      },
      () => {
        // Permission denied or position unavailable — degrade gracefully
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
