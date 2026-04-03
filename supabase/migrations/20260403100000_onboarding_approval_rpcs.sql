-- Onboarding approval RPCs for boss to approve/reject kiosk onboarding requests.
-- Follows the same pattern as approve_score_reset / reject_score_reset.

-- approve_onboarding: boss approves a pending onboarding record
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
END;
$$;

-- reject_onboarding: boss rejects a pending onboarding record with a reason
CREATE OR REPLACE FUNCTION public.reject_onboarding(
  p_record_id UUID,
  p_reason    TEXT DEFAULT NULL
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
    RAISE EXCEPTION 'Permission denied: only bosses can reject onboarding requests';
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
     SET status           = 'rejected',
         reviewed_by      = auth.uid(),
         reviewed_at      = now(),
         rejection_reason = p_reason
   WHERE id = p_record_id;
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.approve_onboarding(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_onboarding(UUID, TEXT) TO authenticated;
