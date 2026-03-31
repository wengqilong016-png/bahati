-- ============================================================
-- Create / promote a boss account
--
-- Prerequisites:
--   1. Create the user in Supabase Auth UI (or via API).
--   2. Run this SQL in Supabase SQL Editor, replacing the email.
--
-- Boss accounts have raw_user_meta_data->>'role' = 'boss'
-- and intentionally have NO row in public.drivers.
-- ============================================================

DO $$
DECLARE
  v_user_id uuid;
  v_email   text := 'boss@example.com'; -- ← change to your admin email
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'User with email % not found in auth.users. Create the user in Auth first.',
      v_email;
  END IF;

  -- Set role metadata to 'boss'
  UPDATE auth.users
  SET raw_user_meta_data =
        COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', 'boss')
  WHERE id = v_user_id;

  -- Boss accounts do NOT get a public.drivers row.
  -- Remove any accidental driver row that may have been created.
  DELETE FROM public.drivers WHERE id = v_user_id;

  RAISE NOTICE 'Boss account configured for user % (%)', v_email, v_user_id;
END $$;
