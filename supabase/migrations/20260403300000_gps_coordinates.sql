-- Add GPS coordinates to tasks and kiosk_onboarding_records.
-- Also update approve_onboarding and driver_create_onboarding_bundle to handle coords.

-- 1. Add lat/lng to tasks (recorded at task submission time)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);

-- 2. Add lat/lng to kiosk_onboarding_records (recorded at onboarding submission)
ALTER TABLE public.kiosk_onboarding_records
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);

-- 3. Update approve_onboarding to copy GPS coords from onboarding record to kiosks table
CREATE OR REPLACE FUNCTION public.approve_onboarding(
  p_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.kiosk_onboarding_records%ROWTYPE;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can approve onboarding requests';
  END IF;

  SELECT * INTO v_rec
    FROM public.kiosk_onboarding_records
   WHERE id = p_record_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding record not found: %', p_record_id;
  END IF;

  IF v_rec.status <> 'pending' THEN
    RAISE EXCEPTION 'Record is not pending (current status: %)', v_rec.status;
  END IF;

  UPDATE public.kiosk_onboarding_records
     SET status      = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = p_record_id;

  -- Copy GPS coordinates from onboarding record to the kiosk (if available)
  IF v_rec.latitude IS NOT NULL AND v_rec.longitude IS NOT NULL THEN
    UPDATE public.kiosks
       SET latitude  = v_rec.latitude,
           longitude = v_rec.longitude
     WHERE id = v_rec.kiosk_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_onboarding(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_onboarding(UUID) TO authenticated;

-- 4. Update driver_create_onboarding_bundle with latitude/longitude parameters
REVOKE ALL ON FUNCTION public.driver_create_onboarding_bundle(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC) FROM PUBLIC;
DROP FUNCTION IF EXISTS public.driver_create_onboarding_bundle(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.driver_create_onboarding_bundle(
  p_merchant_name TEXT,
  p_kiosk_serial_number TEXT,
  p_kiosk_location_name TEXT,
  p_onboarding_id UUID DEFAULT gen_random_uuid(),
  p_merchant_contact_name TEXT DEFAULT NULL,
  p_merchant_phone TEXT DEFAULT NULL,
  p_merchant_address TEXT DEFAULT NULL,
  p_kiosk_initial_score INTEGER DEFAULT 0,
  p_initial_coin_loan NUMERIC DEFAULT 0,
  p_photo_urls TEXT[] DEFAULT '{}',
  p_notes TEXT DEFAULT NULL,
  p_dividend_rate NUMERIC DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  merchant_id UUID,
  kiosk_id UUID,
  onboarding_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
  v_merchant public.merchants%ROWTYPE;
  v_kiosk public.kiosks%ROWTYPE;
  v_dividend_rate NUMERIC(5,4);
BEGIN
  v_driver_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = v_driver_id AND is_active) THEN
    RAISE EXCEPTION 'Permission denied: only active drivers can create onboarding bundles';
  END IF;

  -- Validation
  IF btrim(COALESCE(p_merchant_name, '')) = '' THEN
    RAISE EXCEPTION 'Merchant name is required';
  END IF;
  IF btrim(COALESCE(p_kiosk_serial_number, '')) = '' THEN
    RAISE EXCEPTION 'Kiosk serial number is required';
  END IF;
  IF btrim(COALESCE(p_kiosk_location_name, '')) = '' THEN
    RAISE EXCEPTION 'Kiosk location name is required';
  END IF;
  IF p_kiosk_initial_score < 0 THEN
    RAISE EXCEPTION 'Initial score must be non-negative';
  END IF;
  IF p_initial_coin_loan < 0 THEN
    RAISE EXCEPTION 'Initial coin loan must be non-negative';
  END IF;
  IF COALESCE(array_length(p_photo_urls, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one photo is required for onboarding';
  END IF;

  v_dividend_rate := COALESCE(p_dividend_rate, 0.30);

  -- Create merchant
  INSERT INTO public.merchants (
    name,
    contact_name,
    phone,
    address,
    dividend_rate
  ) VALUES (
    btrim(p_merchant_name),
    NULLIF(btrim(COALESCE(p_merchant_contact_name, '')), ''),
    NULLIF(btrim(COALESCE(p_merchant_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_merchant_address, '')), ''),
    v_dividend_rate
  )
  RETURNING * INTO v_merchant;

  -- Create kiosk (with GPS if provided)
  INSERT INTO public.kiosks (
    serial_number,
    merchant_id,
    location_name,
    status,
    last_recorded_score,
    assigned_driver_id,
    latitude,
    longitude
  ) VALUES (
    btrim(p_kiosk_serial_number),
    v_merchant.id,
    btrim(p_kiosk_location_name),
    'active',
    p_kiosk_initial_score,
    v_driver_id,
    p_latitude,
    p_longitude
  )
  RETURNING * INTO v_kiosk;

  INSERT INTO public.kiosk_assignment_history (
    kiosk_id,
    driver_id,
    assigned_by,
    notes
  ) VALUES (
    v_kiosk.id,
    v_driver_id,
    NULL,
    'Auto-assigned during new machine onboarding'
  );

  -- Create onboarding record (with GPS)
  INSERT INTO public.kiosk_onboarding_records (
    id,
    kiosk_id,
    driver_id,
    onboarding_type,
    photo_urls,
    notes,
    status,
    latitude,
    longitude
  ) VALUES (
    p_onboarding_id,
    v_kiosk.id,
    v_driver_id,
    'onboarding',
    p_photo_urls,
    COALESCE(p_notes, ''),
    'pending',
    p_latitude,
    p_longitude
  );

  -- Initial coin loan ledger entry
  IF p_initial_coin_loan > 0 THEN
    UPDATE public.merchants
       SET debt_balance = debt_balance + p_initial_coin_loan,
           updated_at   = now()
     WHERE id = v_merchant.id;

    INSERT INTO public.merchant_ledger (
      merchant_id,
      entry_type,
      amount,
      running_retained,
      running_debt,
      notes,
      created_by
    ) VALUES (
      v_merchant.id,
      'initial_coins',
      p_initial_coin_loan,
      v_merchant.retained_balance,
      v_merchant.debt_balance + p_initial_coin_loan,
      format('Initial coin loan created during onboarding for kiosk %s', v_kiosk.serial_number),
      v_driver_id
    );
  END IF;

  RETURN QUERY SELECT v_merchant.id, v_kiosk.id, p_onboarding_id;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_create_onboarding_bundle(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_create_onboarding_bundle(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
