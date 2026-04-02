-- ============================================================
-- Boss driver management RPCs + kiosk GPS columns
-- ============================================================

-- 1) Add latitude/longitude to kiosks for map support
ALTER TABLE public.kiosks
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

COMMENT ON COLUMN public.kiosks.latitude  IS 'GPS latitude for map display';
COMMENT ON COLUMN public.kiosks.longitude IS 'GPS longitude for map display';

-- 2) RLS: do not allow boss clients to UPDATE drivers directly
--    Boss driver mutations must go through SECURITY DEFINER RPCs so
--    business rules remain centralized and cannot be bypassed.
DROP POLICY IF EXISTS "drivers_update_boss" ON public.drivers;

-- 3) Boss-only RPC: update_driver_info
--    Allows boss to edit driver profile fields
CREATE OR REPLACE FUNCTION public.update_driver_info(
  p_driver_id    UUID,
  p_full_name    TEXT    DEFAULT NULL,
  p_phone        TEXT    DEFAULT NULL,
  p_license_plate TEXT   DEFAULT NULL,
  p_is_active    BOOLEAN DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: boss only'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = p_driver_id) THEN
    RAISE EXCEPTION 'Driver not found'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.drivers
  SET
    full_name     = COALESCE(p_full_name,     full_name),
    phone         = COALESCE(p_phone,         phone),
    license_plate = COALESCE(p_license_plate, license_plate),
    is_active     = COALESCE(p_is_active,     is_active),
    updated_at    = now()
  WHERE id = p_driver_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_driver_info(UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_driver_info(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- 4) Boss-only RPC: toggle_driver_active
--    Convenience function to enable/disable a driver
CREATE OR REPLACE FUNCTION public.toggle_driver_active(
  p_driver_id UUID,
  p_is_active BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: boss only'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.drivers
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_driver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_driver_active(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_driver_active(UUID, BOOLEAN) TO authenticated;

-- 5) Boss-only RPC: update_kiosk_coordinates
--    Allows boss to set GPS coordinates for a kiosk
CREATE OR REPLACE FUNCTION public.update_kiosk_coordinates(
  p_kiosk_id  UUID,
  p_latitude  NUMERIC,
  p_longitude NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: boss only'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.kiosks
  SET latitude = p_latitude, longitude = p_longitude, updated_at = now()
  WHERE id = p_kiosk_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kiosk not found'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_kiosk_coordinates(UUID, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_kiosk_coordinates(UUID, NUMERIC, NUMERIC) TO authenticated;
