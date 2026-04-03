import { useState, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';

export interface GeoCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

interface UseGeolocationReturn {
  coords: GeoCoords | null;
  loading: boolean;
  error: string | null;
  capture: () => Promise<GeoCoords | null>;
}

/**
 * Hook to capture GPS coordinates via Capacitor Geolocation.
 * Works on Android (native) and falls back to browser Geolocation API on web.
 * Does NOT auto-capture — call `capture()` when needed.
 */
export function useGeolocation(): UseGeolocationReturn {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (): Promise<GeoCoords | null> => {
    setLoading(true);
    setError(null);
    try {
      // Request permission first (no-op if already granted)
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') {
          setError('未授权定位权限');
          setLoading(false);
          return null;
        }
      }

      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15_000,
      });

      const result: GeoCoords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      setCoords(result);
      setLoading(false);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '定位失败，请检查GPS是否开启';
      setError(msg);
      setLoading(false);
      return null;
    }
  }, []);

  return { coords, loading, error, capture };
}
