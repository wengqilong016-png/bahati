-- Fix validate_task_score() trigger: add SECURITY DEFINER so it runs as the
-- function owner (postgres/service_role) and can bypass RLS on kiosks.
--
-- Root cause: the Phase 2 migration (20240105000000) recreated this function
-- without SECURITY DEFINER.  The trigger does SELECT … FOR UPDATE on kiosks,
-- which requires UPDATE permission.  Because the kiosks_update_boss RLS policy
-- restricts UPDATE to bosses only, a driver-initiated task INSERT could not see
-- the kiosk row, producing "Kiosk not found: <kiosk_id>".

CREATE OR REPLACE FUNCTION public.validate_task_score()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kiosk         public.kiosks%ROWTYPE;
  v_merchant      public.merchants%ROWTYPE;
  v_merchant_name TEXT;
  v_driver_name   TEXT;
BEGIN
  -- Fetch kiosk (lock the row to avoid race conditions).
  -- SECURITY DEFINER ensures RLS does not hide the kiosk from the driver.
  SELECT * INTO v_kiosk
  FROM public.kiosks
  WHERE id = NEW.kiosk_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kiosk not found: %', NEW.kiosk_id;
  END IF;

  -- Validate monotone score requirement
  IF NEW.current_score <= v_kiosk.last_recorded_score THEN
    RAISE EXCEPTION 'current_score (%) must be greater than last_recorded_score (%). If the score decreased, submit a score_reset_request instead.',
      NEW.current_score, v_kiosk.last_recorded_score;
  END IF;

  -- Resolve snapshot values from related tables
  SELECT * INTO v_merchant
  FROM public.merchants m
  WHERE m.id = v_kiosk.merchant_id;

  v_merchant_name := COALESCE(v_merchant.name, '');

  SELECT d.full_name INTO v_driver_name
  FROM public.drivers d
  WHERE d.id = NEW.driver_id;

  -- Populate snapshot fields (overwrite any client-supplied values)
  NEW.snapshot_serial_number := v_kiosk.serial_number;
  NEW.snapshot_merchant_name := v_merchant_name;
  NEW.snapshot_location_name := v_kiosk.location_name;
  NEW.snapshot_driver_name   := COALESCE(v_driver_name, '');

  -- Phase 2: record score_before for revenue calculation
  NEW.score_before := v_kiosk.last_recorded_score;

  -- Phase 2: snapshot dividend_rate at task creation time.
  -- Settlement uses this snapshot (not the merchant's current rate) to prevent
  -- historical task calculations from drifting when the rate is changed later.
  NEW.dividend_rate_snapshot := COALESCE(v_merchant.dividend_rate, 0);

  -- Advance kiosk's last_recorded_score
  UPDATE public.kiosks
  SET last_recorded_score = NEW.current_score,
      updated_at = now()
  WHERE id = NEW.kiosk_id;

  RETURN NEW;
END;
$$;
