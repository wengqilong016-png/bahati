-- ============================================================
-- Phase 1: Score validation — daily_tasks.current_score must be
-- greater than the machine's last_recorded_score at insert time.
-- Drivers whose score went down must use score_reset_requests.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_daily_task_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_last_score INTEGER;
BEGIN
  SELECT last_recorded_score INTO v_last_score
  FROM public.machines
  WHERE id = NEW.machine_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine % not found', NEW.machine_id;
  END IF;

  IF NEW.current_score <= v_last_score THEN
    RAISE EXCEPTION 'current_score (%) must be greater than last_recorded_score (%). Use a score reset request instead.',
      NEW.current_score, v_last_score;
  END IF;

  -- Auto-update the machine's last_recorded_score
  UPDATE public.machines
  SET last_recorded_score = NEW.current_score,
      updated_at = now()
  WHERE id = NEW.machine_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_daily_task_score
  BEFORE INSERT ON public.daily_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_daily_task_score();
