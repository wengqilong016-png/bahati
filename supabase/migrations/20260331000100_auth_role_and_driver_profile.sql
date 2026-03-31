-- ============================================================
-- Auth role helper + driver profile completion RPC
--
-- ROOT CAUSE FIX: Earlier versions of this migration referenced
-- public.profiles, which was DROPPED in phase 1
-- (20240104000000_phase1_complete_schema.sql line 88):
--
--   DROP TABLE IF EXISTS public.profiles CASCADE;
--
-- The authoritative tables/columns are:
--   • Boss role  → auth.users.raw_user_meta_data->>'role' = 'boss'
--                  (same source as the existing is_boss() helper)
--   • Driver row → public.drivers  (id, full_name, phone, …)
--                  public.drivers has NO role column.
-- ============================================================

-- 1) Helper: current_user_role()
--    Returns the caller's role ('boss' | 'driver') or NULL.
--    Boss is identified by raw_user_meta_data, drivers by a row
--    in public.drivers — exactly how is_boss() works.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN u.raw_user_meta_data->>'role' = 'boss' THEN 'boss'
      WHEN EXISTS (
        SELECT 1 FROM public.drivers d WHERE d.id = u.id
      ) THEN 'driver'
      WHEN u.raw_user_meta_data->>'role' = 'driver' THEN 'driver'
      ELSE NULL
    END
  FROM auth.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- 2) RPC: complete_driver_profile(full_name, phone)
--    Upserts the caller's row in public.drivers.
--    public.drivers schema (from phase 1):
--      id, full_name, phone, license_plate, is_active,
--      created_at, updated_at
--    (Phase 2 adds coin_balance, cash_balance — not touched here.)
--    There is NO public.profiles table in this schema.

CREATE OR REPLACE FUNCTION public.complete_driver_profile(
  p_full_name text,
  p_phone     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(trim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'p_full_name is required'
      USING ERRCODE = '22023';
  END IF;

  -- public.drivers is the authoritative driver identity table.
  -- The auth trigger (handle_new_driver) normally creates this row
  -- on signup; this RPC handles the case where it was missed or
  -- needs to be updated post-verification.
  INSERT INTO public.drivers (id, full_name, phone, created_at, updated_at)
  VALUES (auth.uid(), p_full_name, p_phone, now(), now())
  ON CONFLICT (id) DO UPDATE
    SET full_name  = EXCLUDED.full_name,
        phone      = COALESCE(EXCLUDED.phone, public.drivers.phone),
        is_active  = true,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.complete_driver_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_driver_profile(text, text) TO authenticated;
