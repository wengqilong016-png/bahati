-- ============================================================
-- SmartKiosk Seed Data
-- ============================================================
-- Note: profiles reference auth.users, so we insert auth.users first.
-- This seed is for local development / testing only.
-- ============================================================

DO $$
DECLARE
  v_boss_id   UUID := '00000000-0000-0000-0000-000000000001';
  v_driver_id UUID := '00000000-0000-0000-0000-000000000002';
  v_machine1  UUID := '10000000-0000-0000-0000-000000000001';
  v_machine2  UUID := '10000000-0000-0000-0000-000000000002';
  v_machine3  UUID := '10000000-0000-0000-0000-000000000003';
BEGIN

  -- Insert boss user into auth.users
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at,
    aud, role
  ) VALUES (
    v_boss_id,
    'boss@smartkiosk.com',
    crypt('boss1234', gen_salt('bf')),
    now(),
    '{"role": "boss", "full_name": "Ahmad Malik"}'::jsonb,
    now(), now(),
    'authenticated', 'authenticated'
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert driver user into auth.users
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at,
    aud, role
  ) VALUES (
    v_driver_id,
    'driver@smartkiosk.com',
    crypt('driver1234', gen_salt('bf')),
    now(),
    '{"role": "driver", "full_name": "Budi Santoso"}'::jsonb,
    now(), now(),
    'authenticated', 'authenticated'
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert profiles (trigger may already have created them; use ON CONFLICT)
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (v_boss_id, 'boss', 'Ahmad Malik', '+62811000001')
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone;

  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (v_driver_id, 'driver', 'Budi Santoso', '+62811000002')
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone;

  -- Insert machines
  INSERT INTO public.machines (id, serial_number, location_name, merchant_name, merchant_contact, status, last_recorded_score, assigned_driver_id)
  VALUES
    (v_machine1, 'SKM-001', 'Pasar Minggu', 'Toko Jaya', '+62811111001', 'active', 1500, v_driver_id),
    (v_machine2, 'SKM-002', 'Kebayoran Baru', 'Warung Berkah', '+62811111002', 'active', 870, v_driver_id),
    (v_machine3, 'SKM-003', 'Fatmawati', 'Minimart Sejahtera', '+62811111003', 'maintenance', 320, v_driver_id)
  ON CONFLICT (id) DO NOTHING;

  -- Insert daily_tasks
  INSERT INTO public.daily_tasks (machine_id, driver_id, task_date, current_score, notes, status)
  VALUES
    (v_machine1, v_driver_id, CURRENT_DATE - 1, 1480, 'Normal operation', 'reviewed'),
    (v_machine2, v_driver_id, CURRENT_DATE - 1, 850, 'Slight paper jam fixed', 'submitted'),
    (v_machine1, v_driver_id, CURRENT_DATE, 1500, 'All good', 'submitted')
  ON CONFLICT (machine_id, task_date) DO NOTHING;

  -- Insert score_reset_requests
  INSERT INTO public.score_reset_requests (machine_id, driver_id, current_score, requested_new_score, reason, status)
  VALUES
    (v_machine3, v_driver_id, 320, 0, 'Machine was serviced and counter reset needed', 'pending'),
    (v_machine1, v_driver_id, 1500, 0, 'End of month full cycle reset', 'approved')
  ON CONFLICT DO NOTHING;

  -- Approve one of the score reset requests
  UPDATE public.score_reset_requests
  SET status = 'approved', reviewed_by = v_boss_id, reviewed_at = now() - interval '2 hours'
  WHERE machine_id = v_machine1
    AND driver_id = v_driver_id
    AND status = 'approved'
    AND reviewed_by IS NULL;

  -- Insert daily_settlements
  INSERT INTO public.daily_settlements (driver_id, settlement_date, total_machines_visited, total_collections, notes, status)
  VALUES
    (v_driver_id, CURRENT_DATE - 1, 3, 25000.00, 'All collections delivered', 'confirmed'),
    (v_driver_id, CURRENT_DATE, 2, 12500.00, 'Still on route', 'submitted')
  ON CONFLICT (driver_id, settlement_date) DO NOTHING;

  -- Confirm yesterday's settlement
  UPDATE public.daily_settlements
  SET confirmed_by = v_boss_id, confirmed_at = now() - interval '1 hour', status = 'confirmed'
  WHERE driver_id = v_driver_id
    AND settlement_date = CURRENT_DATE - 1
    AND status = 'confirmed'
    AND confirmed_at IS NULL;

  -- Insert driver_ledger_entries
  INSERT INTO public.driver_ledger_entries (driver_id, entry_type, amount, balance_after, description)
  VALUES
    (v_driver_id, 'collection', 25000.00, 25000.00, 'Daily collection 2024-01-01'),
    (v_driver_id, 'payout', -20000.00, 5000.00, 'Weekly payout'),
    (v_driver_id, 'collection', 12500.00, 17500.00, 'Daily collection 2024-01-02');

  -- Insert merchant_ledger_entries
  INSERT INTO public.merchant_ledger_entries (machine_id, entry_type, amount, balance_after, description, snapshot_machine_serial, snapshot_merchant_name)
  VALUES
    (v_machine1, 'revenue', 15000.00, 15000.00, 'Revenue from daily task', 'SKM-001', 'Toko Jaya'),
    (v_machine2, 'revenue', 10000.00, 10000.00, 'Revenue from daily task', 'SKM-002', 'Warung Berkah'),
    (v_machine1, 'fee', -500.00, 14500.00, 'Service fee deduction', 'SKM-001', 'Toko Jaya');

END $$;
