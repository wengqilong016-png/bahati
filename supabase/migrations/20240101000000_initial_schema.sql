-- ============================================================
-- SmartKiosk Initial Schema
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('driver', 'boss')),
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT UNIQUE NOT NULL,
  location_name TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_contact TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  last_recorded_score INTEGER DEFAULT 0,
  assigned_driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.machine_onboardings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_date DATE NOT NULL DEFAULT CURRENT_DATE,
  current_score INTEGER NOT NULL,
  photo_urls TEXT[] DEFAULT '{}',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (machine_id, task_date)
);

CREATE TABLE IF NOT EXISTS public.score_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_score INTEGER NOT NULL,
  requested_new_score INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_machines_visited INTEGER NOT NULL DEFAULT 0,
  total_collections NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'confirmed')),
  confirmed_by UUID REFERENCES public.profiles(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (driver_id, settlement_date)
);

CREATE TABLE IF NOT EXISTS public.driver_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  settlement_id UUID REFERENCES public.daily_settlements(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('collection', 'advance', 'deduction', 'payout')),
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  daily_task_id UUID REFERENCES public.daily_tasks(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('revenue', 'fee', 'refund', 'adjustment')),
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  description TEXT,
  snapshot_machine_serial TEXT NOT NULL,
  snapshot_merchant_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- TRIGGERS: updated_at auto-update
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_machines_updated_at
  BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_daily_tasks_updated_at
  BEFORE UPDATE ON public.daily_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_daily_settlements_updated_at
  BEFORE UPDATE ON public.daily_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TRIGGER: auto-create profile on auth.users insert
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'driver'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER: approve score reset updates machine score
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_score_reset_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    UPDATE public.machines
    SET last_recorded_score = NEW.requested_new_score,
        updated_at = now()
    WHERE id = NEW.machine_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_score_reset_approval
  AFTER UPDATE OF status ON public.score_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_score_reset_approval();

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_score_reset(
  p_request_id UUID,
  p_reviewer_id UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_request public.score_reset_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.score_reset_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Score reset request not found: %', p_request_id;
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (current status: %)', v_request.status;
  END IF;

  UPDATE public.score_reset_requests
  SET status = 'approved',
      reviewed_by = p_reviewer_id,
      reviewed_at = now()
  WHERE id = p_request_id;

  UPDATE public.machines
  SET last_recorded_score = v_request.requested_new_score,
      updated_at = now()
  WHERE id = v_request.machine_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_score_reset(
  p_request_id UUID,
  p_reviewer_id UUID,
  p_reason TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_request public.score_reset_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.score_reset_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Score reset request not found: %', p_request_id;
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (current status: %)', v_request.status;
  END IF;

  UPDATE public.score_reset_requests
  SET status = 'rejected',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      rejection_reason = p_reason
  WHERE id = p_request_id;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a boss?
CREATE OR REPLACE FUNCTION public.is_boss()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'boss'
  );
$$;

-- profiles policies
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_boss());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- machines policies
CREATE POLICY "machines_select_driver"
  ON public.machines FOR SELECT
  USING (assigned_driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "machines_insert_boss"
  ON public.machines FOR INSERT
  WITH CHECK (public.is_boss());

CREATE POLICY "machines_update_boss"
  ON public.machines FOR UPDATE
  USING (public.is_boss());

CREATE POLICY "machines_delete_boss"
  ON public.machines FOR DELETE
  USING (public.is_boss());

-- machine_onboardings policies
CREATE POLICY "onboardings_select"
  ON public.machine_onboardings FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "onboardings_insert_driver"
  ON public.machine_onboardings FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "onboardings_update_boss"
  ON public.machine_onboardings FOR UPDATE
  USING (public.is_boss());

-- daily_tasks policies
CREATE POLICY "daily_tasks_select"
  ON public.daily_tasks FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "daily_tasks_insert_driver"
  ON public.daily_tasks FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "daily_tasks_update_boss"
  ON public.daily_tasks FOR UPDATE
  USING (public.is_boss());

-- score_reset_requests policies
CREATE POLICY "srr_select"
  ON public.score_reset_requests FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "srr_insert_driver"
  ON public.score_reset_requests FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "srr_update_boss"
  ON public.score_reset_requests FOR UPDATE
  USING (public.is_boss());

-- daily_settlements policies
CREATE POLICY "settlements_select"
  ON public.daily_settlements FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "settlements_insert_driver"
  ON public.daily_settlements FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "settlements_update"
  ON public.daily_settlements FOR UPDATE
  USING (driver_id = auth.uid() OR public.is_boss());

-- driver_ledger_entries policies
CREATE POLICY "dle_select"
  ON public.driver_ledger_entries FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "dle_insert_boss"
  ON public.driver_ledger_entries FOR INSERT
  WITH CHECK (public.is_boss());

CREATE POLICY "dle_update_boss"
  ON public.driver_ledger_entries FOR UPDATE
  USING (public.is_boss());

-- merchant_ledger_entries policies
CREATE POLICY "mle_select_boss"
  ON public.merchant_ledger_entries FOR SELECT
  USING (public.is_boss());

CREATE POLICY "mle_insert_boss"
  ON public.merchant_ledger_entries FOR INSERT
  WITH CHECK (public.is_boss());

CREATE POLICY "mle_update_boss"
  ON public.merchant_ledger_entries FOR UPDATE
  USING (public.is_boss());

-- sync_log policies
CREATE POLICY "sync_log_select"
  ON public.sync_log FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "sync_log_insert_driver"
  ON public.sync_log FOR INSERT
  WITH CHECK (driver_id = auth.uid());
