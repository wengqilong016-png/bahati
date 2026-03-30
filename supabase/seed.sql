-- ============================================================
-- SmartKiosk Phase 1 — Seed Data
-- For local development / testing only.
-- Applies after 20240104000000_phase1_complete_schema.sql
-- ============================================================

DO $$
DECLARE
  v_boss_id    UUID := '00000000-0000-0000-0000-000000000001';
  v_driver1_id UUID := '00000000-0000-0000-0000-000000000002';
  v_driver2_id UUID := '00000000-0000-0000-0000-000000000003';
  v_merchant1  UUID := '20000000-0000-0000-0000-000000000001';
  v_merchant2  UUID := '20000000-0000-0000-0000-000000000002';
  v_kiosk1     UUID := '10000000-0000-0000-0000-000000000001';
  v_kiosk2     UUID := '10000000-0000-0000-0000-000000000002';
  v_kiosk3     UUID := '10000000-0000-0000-0000-000000000003';
BEGIN

  -- ----------------------------------------------------------------
  -- auth.users
  -- ----------------------------------------------------------------
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at, aud, role
  ) VALUES
    (v_boss_id,    'boss@smartkiosk.com',    crypt('boss1234',    gen_salt('bf')), now(),
     '{"role":"boss","full_name":"Ahmad Malik"}'::jsonb,
     now(), now(), 'authenticated', 'authenticated'),
    (v_driver1_id, 'driver1@smartkiosk.com', crypt('driver1234', gen_salt('bf')), now(),
     '{"role":"driver","full_name":"Budi Santoso","phone":"+62811000002"}'::jsonb,
     now(), now(), 'authenticated', 'authenticated'),
    (v_driver2_id, 'driver2@smartkiosk.com', crypt('driver5678', gen_salt('bf')), now(),
     '{"role":"driver","full_name":"Citra Dewi","phone":"+62811000003"}'::jsonb,
     now(), now(), 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  -- ----------------------------------------------------------------
  -- drivers (auth trigger may have already created these rows)
  -- ----------------------------------------------------------------
  INSERT INTO public.drivers (id, full_name, phone, license_plate, is_active)
  VALUES
    (v_driver1_id, 'Budi Santoso', '+62811000002', 'B 1234 XY', TRUE),
    (v_driver2_id, 'Citra Dewi',   '+62811000003', 'B 5678 AB', TRUE)
  ON CONFLICT (id) DO UPDATE SET
    full_name     = EXCLUDED.full_name,
    phone         = EXCLUDED.phone,
    license_plate = EXCLUDED.license_plate;

  -- ----------------------------------------------------------------
  -- merchants
  -- ----------------------------------------------------------------
  INSERT INTO public.merchants (id, name, contact_name, phone, address, is_active)
  VALUES
    (v_merchant1, 'Toko Jaya',    'Pak Jaya',  '+62811111001', 'Jl. Pasar Minggu No. 1',    TRUE),
    (v_merchant2, 'Warung Berkah','Bu Berkah',  '+62811111002', 'Jl. Kebayoran Baru No. 10', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- ----------------------------------------------------------------
  -- kiosks
  -- ----------------------------------------------------------------
  INSERT INTO public.kiosks
    (id, serial_number, merchant_id, location_name, status, last_recorded_score, assigned_driver_id)
  VALUES
    (v_kiosk1, 'SKM-001',   v_merchant1, 'Pasar Minggu',   'active',      1500, v_driver1_id),
    (v_kiosk2, 'SKM-002',   v_merchant2, 'Kebayoran Baru', 'active',       870, v_driver1_id),
    (v_kiosk3, 'SKM-002-B', v_merchant2, 'Fatmawati',      'maintenance',  320, v_driver2_id)
  ON CONFLICT (id) DO NOTHING;

  -- ----------------------------------------------------------------
  -- kiosk_assignment_history
  -- ----------------------------------------------------------------
  INSERT INTO public.kiosk_assignment_history
    (kiosk_id, driver_id, assigned_at, assigned_by)
  VALUES
    (v_kiosk1, v_driver1_id, now() - interval '30 days', v_boss_id),
    (v_kiosk2, v_driver1_id, now() - interval '30 days', v_boss_id),
    (v_kiosk3, v_driver2_id, now() - interval '15 days', v_boss_id);

  -- ----------------------------------------------------------------
  -- kiosk_onboarding_records
  -- ----------------------------------------------------------------
  INSERT INTO public.kiosk_onboarding_records
    (kiosk_id, driver_id, onboarding_type, photo_urls, notes,
     status, reviewed_by, reviewed_at)
  VALUES
    (v_kiosk1, v_driver1_id, 'onboarding',
     ARRAY['https://example.com/photos/skm001-a.jpg'],
     'Initial onboarding OK', 'approved', v_boss_id, now() - interval '29 days'),
    (v_kiosk2, v_driver1_id, 'onboarding',
     ARRAY['https://example.com/photos/skm002-a.jpg'],
     'Initial onboarding OK', 'approved', v_boss_id, now() - interval '29 days'),
    (v_kiosk3, v_driver2_id, 'recertification',
     ARRAY['https://example.com/photos/skm002b-a.jpg'],
     'Post-maintenance recheck', 'pending', NULL, NULL);

  -- ----------------------------------------------------------------
  -- tasks
  -- SEED-ONLY WORKAROUND: The trg_validate_task_score trigger
  -- enforces that current_score > last_recorded_score and then
  -- automatically advances last_recorded_score on the kiosk row.
  -- To insert historical tasks out of order we temporarily set
  -- last_recorded_score to (desired_score - 1), insert the task,
  -- and restore the final value at the end of the block.
  -- DO NOT replicate this pattern in production code; always let
  -- the trigger advance the score naturally via sequential INSERTs.
  -- ----------------------------------------------------------------

  -- kiosk1: history day-1 (1479 → 1480)
  UPDATE public.kiosks SET last_recorded_score = 1479 WHERE id = v_kiosk1;
  INSERT INTO public.tasks
    (kiosk_id, driver_id, task_date, current_score, notes, status,
     snapshot_serial_number, snapshot_merchant_name,
     snapshot_location_name, snapshot_driver_name)
  VALUES
    (v_kiosk1, v_driver1_id, CURRENT_DATE - 1, 1480,
     'Normal operation', 'reviewed',
     'SKM-001', 'Toko Jaya', 'Pasar Minggu', 'Budi Santoso')
  ON CONFLICT (kiosk_id, task_date) DO NOTHING;

  -- kiosk1: today (1480 → 1500)
  UPDATE public.kiosks SET last_recorded_score = 1480 WHERE id = v_kiosk1;
  INSERT INTO public.tasks
    (kiosk_id, driver_id, task_date, current_score, notes, status,
     snapshot_serial_number, snapshot_merchant_name,
     snapshot_location_name, snapshot_driver_name)
  VALUES
    (v_kiosk1, v_driver1_id, CURRENT_DATE, 1500,
     'All good', 'submitted',
     'SKM-001', 'Toko Jaya', 'Pasar Minggu', 'Budi Santoso')
  ON CONFLICT (kiosk_id, task_date) DO NOTHING;

  -- kiosk2: history day-1 (849 → 850)
  UPDATE public.kiosks SET last_recorded_score = 849 WHERE id = v_kiosk2;
  INSERT INTO public.tasks
    (kiosk_id, driver_id, task_date, current_score, notes, status,
     snapshot_serial_number, snapshot_merchant_name,
     snapshot_location_name, snapshot_driver_name)
  VALUES
    (v_kiosk2, v_driver1_id, CURRENT_DATE - 1, 850,
     'Slight paper jam fixed', 'submitted',
     'SKM-002', 'Warung Berkah', 'Kebayoran Baru', 'Budi Santoso')
  ON CONFLICT (kiosk_id, task_date) DO NOTHING;

  -- Restore declared kiosk scores (trigger will have advanced them during
  -- successful INSERTs above; reset to our intended baseline).
  UPDATE public.kiosks SET last_recorded_score = 1500 WHERE id = v_kiosk1;
  UPDATE public.kiosks SET last_recorded_score = 870  WHERE id = v_kiosk2;
  UPDATE public.kiosks SET last_recorded_score = 320  WHERE id = v_kiosk3;

  -- ----------------------------------------------------------------
  -- score_reset_requests
  -- ----------------------------------------------------------------
  INSERT INTO public.score_reset_requests
    (kiosk_id, driver_id, current_score, requested_new_score, reason, status)
  VALUES
    (v_kiosk3, v_driver2_id, 320,  0, 'Machine serviced — counter reset needed', 'pending'),
    (v_kiosk1, v_driver1_id, 1500, 0, 'End-of-month full-cycle reset',           'approved')
  ON CONFLICT DO NOTHING;

  -- Mark the approved request as reviewed
  UPDATE public.score_reset_requests
  SET reviewed_by = v_boss_id,
      reviewed_at = now() - interval '2 hours'
  WHERE kiosk_id  = v_kiosk1
    AND driver_id = v_driver1_id
    AND status    = 'approved'
    AND reviewed_by IS NULL;

END $$;
