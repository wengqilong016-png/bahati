-- ============================================================
-- SmartKiosk Phase 1 — Complete Schema (Authoritative)
--
-- 执行顺序 (Execution Order):
--   1.  Drop legacy tables / functions from earlier migrations
--   2.  drivers
--   3.  merchants
--   4.  kiosks
--   5.  kiosk_assignment_history
--   6.  kiosk_onboarding_records
--   7.  tasks
--   8.  score_reset_requests
--   9.  updated_at trigger function (shared)
--  10.  Per-table updated_at triggers
--  11.  Auth trigger: auto-create driver record
--  12.  Task score-validation + snapshot trigger
--  13.  Score-reset approval trigger
--  14.  RPC functions: approve / reject score reset
--  15.  Indexes
--  16.  RLS enable + policies
--  17.  Phase 2 extension stubs (commented out)
-- ============================================================

-- ============================================================
-- A. 数据建模说明 (Data Modeling Notes)
-- ============================================================
--
-- drivers
--   司机身份表。1:1 对应 auth.users，通过 auth trigger 自动创建。
--   存储司机姓名、手机、车牌，以及软删除标志 is_active。
--   Phase 2 预留字段：driver_balance（资金余额）。
--
-- merchants
--   商家信息表，与 kiosks 为 1:N 关系。
--   将商家信息从机器表中解耦，便于未来商家账本扩展。
--   Phase 2 预留字段：ledger_balance（商家账户余额）。
--
-- kiosks
--   机器主表。每台机器关联唯一商家，并追踪当前指派司机。
--   last_recorded_score 受保护：只能由 tasks 插入触发器自动更新，
--   或由 score_reset_requests 审批通过后的触发器更新；
--   司机无法通过 RLS 直接写入该字段。
--
-- kiosk_assignment_history
--   司机-机器指派历史。每次 boss 指派或撤销指派均记录一行，
--   供后续审计和分析使用。
--
-- kiosk_onboarding_records
--   机器入网 / 重新认证记录。onboarding_type 区分首次入网
--   (onboarding) 和重新认证 (recertification)，须经 boss 审批。
--
-- tasks
--   司机日常巡检任务表。每台机器每天只允许一条记录（UNIQUE 约束）。
--   快照字段（snapshot_serial_number / snapshot_merchant_name /
--   snapshot_location_name / snapshot_driver_name）在 BEFORE INSERT
--   触发器中自动填充并锁定，确保历史记录不受商家/机器信息变更影响。
--   current_score 必须大于机器当前 last_recorded_score；
--   若分数下降，司机须提交 score_reset_requests。
--
-- score_reset_requests
--   分数重置申请审批表。司机提交申请（INSERT），boss 通过
--   approve_score_reset() RPC 批准后，由触发器更新
--   kiosks.last_recorded_score，司机无法绕过审批直接修改。
-- ============================================================

-- ============================================================
-- STEP 1: Drop legacy objects from earlier migrations
--         (safe to re-run; CASCADE removes dependent policies)
-- ============================================================

DROP TRIGGER IF EXISTS trg_validate_daily_task_score   ON public.daily_tasks;
DROP TRIGGER IF EXISTS trg_daily_tasks_updated_at      ON public.daily_tasks;
DROP TRIGGER IF EXISTS trg_daily_settlements_updated_at ON public.daily_settlements;
DROP TRIGGER IF EXISTS trg_machines_updated_at         ON public.machines;
DROP TRIGGER IF EXISTS trg_profiles_updated_at         ON public.profiles;
DROP TRIGGER IF EXISTS trg_score_reset_approval        ON public.score_reset_requests;
DROP TRIGGER IF EXISTS trg_on_auth_user_created        ON auth.users;
DROP TRIGGER IF EXISTS trg_on_auth_user_created_driver ON auth.users;

DROP TABLE IF EXISTS public.merchant_ledger_entries  CASCADE;
DROP TABLE IF EXISTS public.driver_ledger_entries    CASCADE;
DROP TABLE IF EXISTS public.sync_log                 CASCADE;
DROP TABLE IF EXISTS public.daily_settlements        CASCADE;
DROP TABLE IF EXISTS public.score_reset_requests     CASCADE;
DROP TABLE IF EXISTS public.daily_tasks              CASCADE;
DROP TABLE IF EXISTS public.machine_onboardings      CASCADE;
DROP TABLE IF EXISTS public.machines                 CASCADE;
DROP TABLE IF EXISTS public.profiles                 CASCADE;

DROP FUNCTION IF EXISTS public.validate_daily_task_score()      CASCADE;
DROP FUNCTION IF EXISTS public.handle_score_reset_approval()    CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user()                CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_driver()              CASCADE;
DROP FUNCTION IF EXISTS public.approve_score_reset(UUID, UUID)  CASCADE;
DROP FUNCTION IF EXISTS public.reject_score_reset(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.is_boss()                        CASCADE;

-- ============================================================
-- STEP 2: drivers
-- ============================================================

CREATE TABLE public.drivers (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL DEFAULT '',
  phone         TEXT,
  license_plate TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Phase 2 预留: driver_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.drivers IS '司机身份表。1:1 对应 auth.users，通过 auth trigger 自动创建。';
COMMENT ON COLUMN public.drivers.is_active IS '软删除标志；停用后不得新建任务或申请。';

-- ============================================================
-- STEP 3: merchants
-- ============================================================

CREATE TABLE public.merchants (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  address      TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Phase 2 预留: ledger_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.merchants IS '商家信息表。与 kiosks 1:N，为 Phase 2 商家账本预留扩展位。';
COMMENT ON COLUMN public.merchants.is_active IS '软删除标志；停用商家不影响历史任务快照。';

-- ============================================================
-- STEP 4: kiosks
-- ============================================================

CREATE TABLE public.kiosks (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number       TEXT        UNIQUE NOT NULL,
  merchant_id         UUID        NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  location_name       TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'maintenance')),
  last_recorded_score INTEGER     NOT NULL DEFAULT 0
                        CHECK (last_recorded_score >= 0),
  assigned_driver_id  UUID        REFERENCES public.drivers(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.kiosks IS
  '机器主表。last_recorded_score 受保护，只能由系统触发器写入，司机无权直接修改。';
COMMENT ON COLUMN public.kiosks.last_recorded_score IS
  '最近一次记录的积分值。只能由 tasks 插入触发器或 score_reset_requests 审批触发器更新。';

-- ============================================================
-- STEP 5: kiosk_assignment_history
-- ============================================================

CREATE TABLE public.kiosk_assignment_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id      UUID        NOT NULL REFERENCES public.kiosks(id)  ON DELETE CASCADE,
  driver_id     UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  assigned_by   UUID,       -- boss auth.users id
  notes         TEXT,

  CONSTRAINT kah_unassigned_after_assigned
    CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

COMMENT ON TABLE  public.kiosk_assignment_history IS
  '司机-机器指派历史，每次指派/撤销均记录一行，供审计使用。';
COMMENT ON COLUMN public.kiosk_assignment_history.assigned_by IS 'Boss 的 auth.users.id，无 FK 以避免循环依赖。';

-- ============================================================
-- STEP 6: kiosk_onboarding_records
-- ============================================================

CREATE TABLE public.kiosk_onboarding_records (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id         UUID        NOT NULL REFERENCES public.kiosks(id)  ON DELETE CASCADE,
  driver_id        UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  onboarding_type  TEXT        NOT NULL DEFAULT 'onboarding'
                     CHECK (onboarding_type IN ('onboarding', 'recertification')),
  photo_urls       TEXT[]      NOT NULL DEFAULT '{}',
  notes            TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by      UUID,       -- boss auth.users id
  reviewed_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT kor_reviewed_at_requires_reviewer
    CHECK (reviewed_at IS NULL OR reviewed_by IS NOT NULL)
);

COMMENT ON TABLE  public.kiosk_onboarding_records IS
  '机器入网 / 重新认证记录。须经 boss 审批后机器方可正式入网。';
COMMENT ON COLUMN public.kiosk_onboarding_records.onboarding_type IS
  'onboarding = 首次入网；recertification = 重新认证（如换点或故障修复后）。';

-- ============================================================
-- STEP 7: tasks
-- ============================================================

CREATE TABLE public.tasks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id      UUID        NOT NULL REFERENCES public.kiosks(id)  ON DELETE RESTRICT,
  driver_id     UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  task_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  current_score INTEGER     NOT NULL CHECK (current_score >= 0),
  photo_urls    TEXT[]      NOT NULL DEFAULT '{}',
  notes         TEXT,
  status        TEXT        NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted', 'reviewed')),

  -- 关键快照字段（由 BEFORE INSERT 触发器填充，不可被客户端覆盖）
  snapshot_serial_number TEXT NOT NULL DEFAULT '',
  snapshot_merchant_name TEXT NOT NULL DEFAULT '',
  snapshot_location_name TEXT NOT NULL DEFAULT '',
  snapshot_driver_name   TEXT NOT NULL DEFAULT '',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (kiosk_id, task_date)
);

COMMENT ON TABLE  public.tasks IS
  '司机日常巡检任务。每台机器每天限一条记录。快照字段由触发器填充，不受商家/机器信息后续变更影响。';
COMMENT ON COLUMN public.tasks.current_score IS
  '本次巡检读取的积分值，必须大于 kiosks.last_recorded_score；若分数下降须提交 score_reset_requests。';
COMMENT ON COLUMN public.tasks.snapshot_serial_number IS '任务创建时的机器序列号快照。';
COMMENT ON COLUMN public.tasks.snapshot_merchant_name IS '任务创建时的商家名称快照。';
COMMENT ON COLUMN public.tasks.snapshot_location_name IS '任务创建时的机器位置快照。';
COMMENT ON COLUMN public.tasks.snapshot_driver_name   IS '任务创建时的司机姓名快照。';

-- ============================================================
-- STEP 8: score_reset_requests
-- ============================================================

CREATE TABLE public.score_reset_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id            UUID        NOT NULL REFERENCES public.kiosks(id)  ON DELETE RESTRICT,
  driver_id           UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  current_score       INTEGER     NOT NULL CHECK (current_score >= 0),
  requested_new_score INTEGER     NOT NULL CHECK (requested_new_score >= 0),
  reason              TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by         UUID,       -- boss auth.users id
  reviewed_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT srr_new_score_differs
    CHECK (requested_new_score <> current_score),
  CONSTRAINT srr_reviewed_at_requires_reviewer
    CHECK (reviewed_at IS NULL OR reviewed_by IS NOT NULL)
);

COMMENT ON TABLE  public.score_reset_requests IS
  '分数重置申请审批表。司机提交、boss 审批，审批通过后由触发器更新 kiosks.last_recorded_score。';
COMMENT ON COLUMN public.score_reset_requests.current_score IS '提交申请时机器当前积分（快照）。';
COMMENT ON COLUMN public.score_reset_requests.requested_new_score IS '申请重置后的目标积分值。';

-- ============================================================
-- STEP 9: updated_at auto-update function (shared)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- STEP 10: Per-table updated_at triggers
-- ============================================================

CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_merchants_updated_at
  BEFORE UPDATE ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_kiosks_updated_at
  BEFORE UPDATE ON public.kiosks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- STEP 11: Auth trigger — auto-create driver record
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_driver()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only create a driver row when the signup role is 'driver' (default).
  -- Boss accounts are managed separately and do not get a drivers row.
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'driver') = 'driver' THEN
    INSERT INTO public.drivers (id, full_name, phone)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[handle_new_driver] Failed to create driver for user %: % %',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_driver();

-- ============================================================
-- STEP 12: Task score-validation + snapshot BEFORE INSERT trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_task_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_kiosk         public.kiosks%ROWTYPE;
  v_merchant_name TEXT;
  v_driver_name   TEXT;
BEGIN
  -- Fetch kiosk (lock the row to avoid race conditions)
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
  SELECT m.name INTO v_merchant_name
  FROM public.merchants m
  WHERE m.id = v_kiosk.merchant_id;

  SELECT d.full_name INTO v_driver_name
  FROM public.drivers d
  WHERE d.id = NEW.driver_id;

  -- Populate snapshot fields (overwrite any client-supplied values)
  NEW.snapshot_serial_number := v_kiosk.serial_number;
  NEW.snapshot_merchant_name := COALESCE(v_merchant_name, '');
  NEW.snapshot_location_name := v_kiosk.location_name;
  NEW.snapshot_driver_name   := COALESCE(v_driver_name, '');

  -- Advance kiosk's last_recorded_score
  UPDATE public.kiosks
  SET last_recorded_score = NEW.current_score,
      updated_at = now()
  WHERE id = NEW.kiosk_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_task_score
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_task_score();

-- ============================================================
-- STEP 13: Score-reset approval AFTER UPDATE trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_score_reset_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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

CREATE TRIGGER trg_score_reset_approval
  AFTER UPDATE OF status ON public.score_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_score_reset_approval();

-- ============================================================
-- STEP 14: RPC functions — approve / reject score reset
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_score_reset(
  p_request_id UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req public.score_reset_requests%ROWTYPE;
BEGIN
  -- Caller must be a boss
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can approve score reset requests';
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

  -- Update status; kiosk score is updated by trg_score_reset_approval
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
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req public.score_reset_requests%ROWTYPE;
BEGIN
  -- Caller must be a boss
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can reject score reset requests';
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

-- ============================================================
-- STEP 15: Indexes
-- ============================================================

-- kiosks
CREATE INDEX idx_kiosks_merchant        ON public.kiosks (merchant_id);
CREATE INDEX idx_kiosks_assigned_driver ON public.kiosks (assigned_driver_id);
CREATE INDEX idx_kiosks_status          ON public.kiosks (status);

-- kiosk_assignment_history
CREATE INDEX idx_kah_kiosk  ON public.kiosk_assignment_history (kiosk_id);
CREATE INDEX idx_kah_driver ON public.kiosk_assignment_history (driver_id);

-- kiosk_onboarding_records
CREATE INDEX idx_kor_kiosk  ON public.kiosk_onboarding_records (kiosk_id);
CREATE INDEX idx_kor_driver ON public.kiosk_onboarding_records (driver_id);
CREATE INDEX idx_kor_status ON public.kiosk_onboarding_records (status);

-- tasks
CREATE INDEX idx_tasks_kiosk       ON public.tasks (kiosk_id);
CREATE INDEX idx_tasks_driver      ON public.tasks (driver_id);
CREATE INDEX idx_tasks_date        ON public.tasks (task_date DESC);
CREATE INDEX idx_tasks_driver_date ON public.tasks (driver_id, task_date DESC);

-- score_reset_requests
CREATE INDEX idx_srr_kiosk  ON public.score_reset_requests (kiosk_id);
CREATE INDEX idx_srr_driver ON public.score_reset_requests (driver_id);
CREATE INDEX idx_srr_status ON public.score_reset_requests (status);

-- ============================================================
-- STEP 16: Row Level Security
-- ============================================================

ALTER TABLE public.drivers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_onboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_reset_requests     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: is_boss()
-- Boss accounts exist in auth.users with role metadata 'boss'.
-- There is intentionally no public.bosses table in Phase 1;
-- boss identity is verified via raw_user_meta_data.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_boss()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'boss'
  );
$$;

-- -------- drivers --------
-- Drivers can read and update their own row.
-- Boss can read all driver rows.
-- Row creation is handled exclusively by the auth trigger.

CREATE POLICY "drivers_select_own_or_boss"
  ON public.drivers FOR SELECT
  USING (id = auth.uid() OR public.is_boss());

CREATE POLICY "drivers_update_own"
  ON public.drivers FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- -------- merchants --------
-- All authenticated users can read merchants (needed for task display).
-- Only boss can write.

CREATE POLICY "merchants_select"
  ON public.merchants FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "merchants_insert_boss"
  ON public.merchants FOR INSERT
  WITH CHECK (public.is_boss());

CREATE POLICY "merchants_update_boss"
  ON public.merchants FOR UPDATE
  USING (public.is_boss());

CREATE POLICY "merchants_delete_boss"
  ON public.merchants FOR DELETE
  USING (public.is_boss());

-- -------- kiosks --------
-- Drivers see only their assigned kiosk(s); boss sees all.
-- Only boss can insert/update/delete kiosks.
-- (Drivers cannot UPDATE kiosks directly — last_recorded_score is
--  protected by having no driver UPDATE policy.)

CREATE POLICY "kiosks_select_driver_or_boss"
  ON public.kiosks FOR SELECT
  USING (assigned_driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "kiosks_insert_boss"
  ON public.kiosks FOR INSERT
  WITH CHECK (public.is_boss());

CREATE POLICY "kiosks_update_boss"
  ON public.kiosks FOR UPDATE
  USING (public.is_boss());

CREATE POLICY "kiosks_delete_boss"
  ON public.kiosks FOR DELETE
  USING (public.is_boss());

-- -------- kiosk_assignment_history --------
-- Drivers can see their own assignment history; boss sees all.
-- Only boss can insert/update assignment records.

CREATE POLICY "kah_select"
  ON public.kiosk_assignment_history FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "kah_insert_boss"
  ON public.kiosk_assignment_history FOR INSERT
  WITH CHECK (public.is_boss());

CREATE POLICY "kah_update_boss"
  ON public.kiosk_assignment_history FOR UPDATE
  USING (public.is_boss());

-- -------- kiosk_onboarding_records --------
-- Drivers can insert and see their own records; boss sees all and can approve.

CREATE POLICY "kor_select"
  ON public.kiosk_onboarding_records FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "kor_insert_driver"
  ON public.kiosk_onboarding_records FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "kor_update_boss"
  ON public.kiosk_onboarding_records FOR UPDATE
  USING (public.is_boss());

-- -------- tasks --------
-- Drivers can insert tasks for themselves and read their own; boss reads all.
-- Boss can update task status (e.g., mark as reviewed).
-- No driver UPDATE policy → drivers cannot modify a submitted task.

CREATE POLICY "tasks_select"
  ON public.tasks FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "tasks_insert_driver"
  ON public.tasks FOR INSERT
  WITH CHECK (
    driver_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.kiosks k
      WHERE k.id = kiosk_id
        AND k.assigned_driver_id = auth.uid()
    )
  );

CREATE POLICY "tasks_update_boss"
  ON public.tasks FOR UPDATE
  USING (public.is_boss());

-- -------- score_reset_requests --------
-- Drivers can submit requests for themselves and track status.
-- Only boss (via approve/reject RPC) can update.

CREATE POLICY "srr_select"
  ON public.score_reset_requests FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "srr_insert_driver"
  ON public.score_reset_requests FOR INSERT
  WITH CHECK (
    driver_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.kiosk_assignment_history kah
      WHERE kah.kiosk_id = kiosk_id
        AND kah.driver_id = auth.uid()
        AND kah.unassigned_at IS NULL
    )
  );

CREATE POLICY "srr_update_boss"
  ON public.score_reset_requests FOR UPDATE
  USING (public.is_boss());

-- ============================================================
-- STEP 17: Phase 2 Extension Stubs
--          (commented out — do not activate in Phase 1)
-- ============================================================
--
-- D. 后续 Phase 2 预留点
--
-- 1. driver_ledger_entries（司机资金账本）
--    激活时机：Phase 2 司机结算模块
--    --
--    CREATE TABLE public.driver_ledger_entries (
--      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
--      driver_id     UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
--      task_id       UUID        REFERENCES public.tasks(id) ON DELETE SET NULL,
--      entry_type    TEXT        NOT NULL
--                      CHECK (entry_type IN ('collection','advance','deduction','payout')),
--      amount        NUMERIC(14,2) NOT NULL,
--      balance_after NUMERIC(14,2) NOT NULL,
--      description   TEXT,
--      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
--    );
--    -- 同时在 drivers 表添加：
--    -- ALTER TABLE public.drivers ADD COLUMN driver_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
--    -- 并创建 tasks AFTER INSERT 触发器自动写入 driver_ledger_entries。
--
-- 2. merchant_ledger_entries（商家账本）
--    激活时机：Phase 2 商家对账模块
--    --
--    CREATE TABLE public.merchant_ledger_entries (
--      id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
--      merchant_id            UUID        NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
--      kiosk_id               UUID        REFERENCES public.kiosks(id) ON DELETE SET NULL,
--      task_id                UUID        REFERENCES public.tasks(id) ON DELETE SET NULL,
--      entry_type             TEXT        NOT NULL
--                               CHECK (entry_type IN ('revenue','fee','refund','adjustment')),
--      amount                 NUMERIC(14,2) NOT NULL,
--      balance_after          NUMERIC(14,2) NOT NULL,
--      snapshot_serial_number TEXT        NOT NULL,
--      snapshot_merchant_name TEXT        NOT NULL,
--      description            TEXT,
--      created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
--    );
--    -- 同时在 merchants 表添加：
--    -- ALTER TABLE public.merchants ADD COLUMN ledger_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
--
-- 3. daily_settlements（司机每日汇总结算）
--    激活时机：Phase 2 每日收款汇总
--    --
--    CREATE TABLE public.daily_settlements (
--      id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
--      driver_id              UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
--      settlement_date        DATE        NOT NULL DEFAULT CURRENT_DATE,
--      total_kiosks_visited   INTEGER     NOT NULL DEFAULT 0,
--      total_collections      NUMERIC(14,2) NOT NULL DEFAULT 0,
--      notes                  TEXT,
--      status                 TEXT        NOT NULL DEFAULT 'draft'
--                               CHECK (status IN ('draft','submitted','confirmed')),
--      confirmed_by           UUID,
--      confirmed_at           TIMESTAMPTZ,
--      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
--      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
--      UNIQUE (driver_id, settlement_date)
--    );
--
-- 4. 分数重置后自动写入 merchant_ledger_entries 的 adjustment 记录
--    激活时机：Phase 2 商家账本 + 分数重置联动
--    在 handle_score_reset_approval() 中扩展，审批通过后
--    插入一条 entry_type = 'adjustment' 记录到 merchant_ledger_entries。
--
-- ============================================================
