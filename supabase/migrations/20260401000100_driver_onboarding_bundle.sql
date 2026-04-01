-- Driver onboarding bundle RPC
-- Creates merchant + kiosk + onboarding record in one secure transaction.
-- Also optionally records initial coin loan as merchant debt (initial_coins).

CREATE OR REPLACE FUNCTION public.driver_create_onboarding_bundle(
  p_onboarding_id UUID DEFAULT gen_random_uuid(),
  p_merchant_name TEXT,
  p_merchant_contact_name TEXT DEFAULT NULL,
  p_merchant_phone TEXT DEFAULT NULL,
  p_merchant_address TEXT DEFAULT NULL,
  p_kiosk_serial_number TEXT,
  p_kiosk_location_name TEXT,
  p_kiosk_initial_score INTEGER DEFAULT 0,
  p_initial_coin_loan NUMERIC DEFAULT 0,
  p_photo_urls TEXT[] DEFAULT '{}',
  p_notes TEXT DEFAULT NULL
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
BEGIN
  v_driver_id := auth.uid();

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF btrim(COALESCE(p_merchant_name, '')) = '' THEN
    RAISE EXCEPTION 'merchant name is required';
  END IF;

  IF btrim(COALESCE(p_kiosk_serial_number, '')) = '' THEN
    RAISE EXCEPTION 'kiosk serial number is required';
  END IF;

  IF btrim(COALESCE(p_kiosk_location_name, '')) = '' THEN
    RAISE EXCEPTION 'kiosk location is required';
  END IF;

  IF p_kiosk_initial_score < 0 THEN
    RAISE EXCEPTION 'kiosk initial score must be >= 0';
  END IF;

  IF p_initial_coin_loan < 0 THEN
    RAISE EXCEPTION 'initial coin loan must be >= 0';
  END IF;

  IF COALESCE(array_length(p_photo_urls, 1), 0) = 0 THEN
    RAISE EXCEPTION 'at least one onboarding photo is required';
  END IF;

  INSERT INTO public.merchants (
    name,
    contact_name,
    phone,
    address
  ) VALUES (
    btrim(p_merchant_name),
    NULLIF(btrim(COALESCE(p_merchant_contact_name, '')), ''),
    NULLIF(btrim(COALESCE(p_merchant_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_merchant_address, '')), '')
  )
  RETURNING * INTO v_merchant;

  INSERT INTO public.kiosks (
    serial_number,
    merchant_id,
    location_name,
    status,
    last_recorded_score,
    assigned_driver_id
  ) VALUES (
    btrim(p_kiosk_serial_number),
    v_merchant.id,
    btrim(p_kiosk_location_name),
    'active',
    p_kiosk_initial_score,
    v_driver_id
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
    v_driver_id,
    'Auto-assigned during new machine onboarding'
  );

  INSERT INTO public.kiosk_onboarding_records (
    id,
    kiosk_id,
    driver_id,
    onboarding_type,
    photo_urls,
    notes,
    status
  ) VALUES (
    p_onboarding_id,
    v_kiosk.id,
    v_driver_id,
    'onboarding',
    p_photo_urls,
    COALESCE(p_notes, ''),
    'pending'
  );

  IF p_initial_coin_loan > 0 THEN
    UPDATE public.merchants
    SET debt_balance = debt_balance + p_initial_coin_loan,
        updated_at = now()
    WHERE id = v_merchant.id;

    INSERT INTO public.merchant_ledger (
      merchant_id,
      kiosk_id,
      txn_type,
      amount,
      retained_balance_after,
      debt_balance_after,
      description,
      created_by
    ) VALUES (
      v_merchant.id,
      v_kiosk.id,
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

REVOKE ALL ON FUNCTION public.driver_create_onboarding_bundle(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_create_onboarding_bundle(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT[], TEXT) TO authenticated;
