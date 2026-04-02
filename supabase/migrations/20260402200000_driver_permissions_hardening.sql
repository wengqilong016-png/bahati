-- ============================================================
-- Driver permissions hardening + soft-delete RPC
-- ============================================================

-- 1) Soft-delete RPC: soft_delete_driver
--    Sets is_active = false after checking for unfinished business.
--    Boss-only; returns a descriptive error if blocked.
CREATE OR REPLACE FUNCTION public.soft_delete_driver(p_driver_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_tasks   INTEGER;
  v_pending_reconc  INTEGER;
  v_pending_resets  INTEGER;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: boss only'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = p_driver_id) THEN
    RAISE EXCEPTION 'Driver not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Check for unsettled tasks (tasks that have task_settlements with pending items)
  SELECT count(*) INTO v_pending_tasks
  FROM public.tasks t
  WHERE t.driver_id = p_driver_id
    AND t.task_date = CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM public.task_settlements ts WHERE ts.task_id = t.id
    );

  -- Check for unsubmitted reconciliations today
  SELECT count(*) INTO v_pending_reconc
  FROM public.daily_driver_reconciliations ddr
  WHERE ddr.driver_id = p_driver_id
    AND ddr.reconciliation_date = CURRENT_DATE
    AND ddr.status = 'draft';

  -- Check for pending score reset requests
  SELECT count(*) INTO v_pending_resets
  FROM public.score_reset_requests srr
  WHERE srr.driver_id = p_driver_id
    AND srr.status = 'pending';

  IF v_pending_tasks > 0 THEN
    RAISE EXCEPTION 'Cannot deactivate: driver has % unsettled task(s) today', v_pending_tasks
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pending_reconc > 0 THEN
    RAISE EXCEPTION 'Cannot deactivate: driver has draft reconciliation(s) today'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pending_resets > 0 THEN
    RAISE EXCEPTION 'Cannot deactivate: driver has % pending score reset request(s)', v_pending_resets
      USING ERRCODE = 'P0001';
  END IF;

  -- Soft-delete: set is_active = false
  UPDATE public.drivers
  SET is_active = false, updated_at = now()
  WHERE id = p_driver_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_driver(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_driver(UUID) TO authenticated;

-- ============================================================
-- 2) RLS hardening: inactive drivers cannot perform write operations
-- ============================================================

-- Helper: is_active_driver()
-- Returns TRUE only if the current user is a driver with is_active = TRUE.
CREATE OR REPLACE FUNCTION public.is_active_driver()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.drivers
    WHERE id = auth.uid()
      AND is_active = TRUE
  );
$$;

-- -------- tasks: tighten INSERT policy --------
-- Drop the existing driver INSERT policy and recreate with is_active check
DROP POLICY IF EXISTS "tasks_insert_driver" ON public.tasks;

CREATE POLICY "tasks_insert_driver"
  ON public.tasks FOR INSERT
  WITH CHECK (
    driver_id = auth.uid()
    AND public.is_active_driver()
    AND EXISTS (
      SELECT 1
      FROM public.kiosks k
      WHERE k.id = kiosk_id
        AND k.assigned_driver_id = auth.uid()
    )
  );

-- -------- score_reset_requests: tighten INSERT policy --------
DROP POLICY IF EXISTS "srr_insert_driver" ON public.score_reset_requests;

CREATE POLICY "srr_insert_driver"
  ON public.score_reset_requests FOR INSERT
  WITH CHECK (
    driver_id = auth.uid()
    AND public.is_active_driver()
    AND EXISTS (
      SELECT 1
      FROM public.kiosk_assignment_history kah
      WHERE kah.kiosk_id = kiosk_id
        AND kah.driver_id = auth.uid()
        AND kah.unassigned_at IS NULL
    )
  );

-- -------- kiosk_onboarding_records: tighten INSERT policy --------
DROP POLICY IF EXISTS "kor_insert_driver" ON public.kiosk_onboarding_records;

CREATE POLICY "kor_insert_driver"
  ON public.kiosk_onboarding_records FOR INSERT
  WITH CHECK (
    driver_id = auth.uid()
    AND public.is_active_driver()
  );

-- ============================================================
-- 3) Grant execute on helper function
-- ============================================================
REVOKE ALL ON FUNCTION public.is_active_driver() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_driver() TO authenticated;
