-- ============================================================
-- Stage 2 follow-up hardening (non-breaking)
-- Re-creates score-reset functions with explicit search_path=public.
-- Compatibility note:
--   This migration is intentionally non-breaking: function signatures,
--   return types, and business logic are unchanged.
-- ============================================================

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

-- Optional trigger helper hardening included for completeness.
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

-- Validation SQL (run post-migration):
-- Confirms proconfig carries search_path=public for all hardened functions.
-- SELECT
--   n.nspname AS schema_name,
--   p.proname AS function_name,
--   pg_get_function_identity_arguments(p.oid) AS identity_args,
--   p.proconfig
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'approve_score_reset',
--     'reject_score_reset',
--     'handle_score_reset_approval'
--   )
-- ORDER BY p.proname, identity_args;
