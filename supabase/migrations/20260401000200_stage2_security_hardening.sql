-- ============================================================
-- Stage 2 hardening: SECURITY DEFINER search_path + read RPC
-- ============================================================

-- 1) Harden score-reset trigger function with explicit search_path
CREATE OR REPLACE FUNCTION public.handle_score_reset_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    UPDATE public.kiosks
    SET last_recorded_score = NEW.requested_new_score,
        updated_at = now()
    WHERE id = NEW.kiosk_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Harden RPCs with explicit search_path
CREATE OR REPLACE FUNCTION public.approve_score_reset(
  p_request_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.score_reset_requests%ROWTYPE;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can approve score reset requests'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req
  FROM public.score_reset_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Score reset request not found: %', p_request_id;
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (current status: %)', v_req.status;
  END IF;

  UPDATE public.score_reset_requests
  SET status      = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_score_reset(
  p_request_id UUID,
  p_reason     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.score_reset_requests%ROWTYPE;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can reject score reset requests'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req
  FROM public.score_reset_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Score reset request not found: %', p_request_id;
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (current status: %)', v_req.status;
  END IF;

  UPDATE public.score_reset_requests
  SET status           = 'rejected',
      reviewed_by      = auth.uid(),
      reviewed_at      = now(),
      rejection_reason = p_reason
  WHERE id = p_request_id;
END;
$$;

-- 3) Add a safe read RPC for driver balances.
--    Drivers can read their own balance; bosses can read any driver by id.
CREATE OR REPLACE FUNCTION public.read_driver_balances(
  p_driver_id UUID DEFAULT NULL
)
RETURNS TABLE(
  driver_id UUID,
  full_name TEXT,
  coin_balance NUMERIC,
  cash_balance NUMERIC,
  is_active BOOLEAN,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_driver UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_target_driver := COALESCE(p_driver_id, auth.uid());

  IF v_target_driver <> auth.uid() AND NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: can only read your own balance'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.id, d.full_name, d.coin_balance, d.cash_balance, d.is_active, d.updated_at
  FROM public.drivers d
  WHERE d.id = v_target_driver;
END;
$$;

-- 4) Restrict function execute grants to authenticated role.
REVOKE ALL ON FUNCTION public.approve_score_reset(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_score_reset(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_score_reset(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_score_reset(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.read_driver_balances(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_driver_balances(UUID) TO authenticated;
