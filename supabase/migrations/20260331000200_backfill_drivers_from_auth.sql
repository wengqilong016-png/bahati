-- ============================================================
-- Backfill missing public.drivers rows from auth.users
--
-- ROOT CAUSE FIX: Earlier versions inserted into public.profiles
-- which was DROPPED in phase 1. This version inserts into
-- public.drivers (the correct table for driver identity).
--
-- Boss accounts (raw_user_meta_data->>'role' = 'boss') are
-- intentionally excluded — bosses have no row in public.drivers.
-- ============================================================

INSERT INTO public.drivers (id, full_name, phone, is_active, created_at, updated_at)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), 'Driver') AS full_name,
  NULLIF(COALESCE(u.phone, u.raw_user_meta_data->>'phone', ''), '')  AS phone,
  true                                                                AS is_active,
  COALESCE(u.created_at, now())                                       AS created_at,
  now()                                                               AS updated_at
FROM auth.users u
LEFT JOIN public.drivers d ON d.id = u.id
WHERE d.id IS NULL
  -- Skip boss accounts; they do not get a public.drivers row
  AND COALESCE(u.raw_user_meta_data->>'role', 'driver') <> 'boss';
