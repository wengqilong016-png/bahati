-- ============================================================
-- Diagnostic: verify auth ↔ drivers consistency
--
-- Run this in Supabase SQL Editor after applying migrations to
-- confirm every non-boss user has a public.drivers row.
-- ============================================================

SELECT
  u.id,
  u.email,
  u.raw_user_meta_data->>'role'  AS meta_role,
  d.full_name                    AS driver_full_name,
  d.is_active                    AS driver_is_active,
  CASE
    WHEN u.raw_user_meta_data->>'role' = 'boss' AND d.id IS NULL     THEN 'OK (boss)'
    WHEN u.raw_user_meta_data->>'role' = 'boss' AND d.id IS NOT NULL THEN 'WARN: boss has drivers row'
    WHEN d.id IS NOT NULL                                             THEN 'OK (driver)'
    ELSE                                                                   'MISSING drivers row'
  END AS status
FROM auth.users u
LEFT JOIN public.drivers d ON d.id = u.id
ORDER BY u.created_at DESC;
