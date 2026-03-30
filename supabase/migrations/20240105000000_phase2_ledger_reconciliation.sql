-- ============================================================
-- SmartKiosk Phase 2 — Ledger & Daily Reconciliation
--
-- 执行顺序 (Execution Order):
--   1.  ALTER tasks — add score_before (populated by trigger)
--   2.  Update validate_task_score() trigger to populate score_before
--   3.  ALTER merchants — add dividend_rate, retained_balance, debt_balance
--   4.  ALTER drivers  — add coin_balance, cash_balance
--   5.  task_settlements
--   6.  merchant_ledger
--   7.  driver_fund_ledger
--   8.  daily_driver_reconciliations
--   9.  merchant_balance_snapshots
--  10.  RPC: record_task_settlement
--  11.  RPC: record_merchant_debt / record_debt_repayment
--  12.  RPC: record_cash_handover / record_coin_topup
--  13.  RPC: submit_daily_reconciliation / confirm_daily_reconciliation
--  14.  RPC: manual_adjustment_merchant / manual_adjustment_driver
--  15.  Indexes
--  16.  RLS policies
--  17.  updated_at triggers
-- ============================================================
--
-- A. 数据建模说明 (Phase 2 Data Modeling Notes)
-- ============================================================
--
-- task_settlements
--   每次巡检任务的财务结算详情。
--   gross_revenue = (score_after − score_before) × 200
--   dividend_amount = gross_revenue × dividend_rate
--   dividend_method: cash=现场结算 | retained=留存
--   exchange_amount: 商家拿现金向司机换硬币的金额
--
-- merchant_ledger
--   商家账本，记录商家每笔财务交易。
--   交易类型：initial_coins, additional_loan, dividend_cash,
--             dividend_retained, coin_exchange, debt_repayment,
--             manual_adjustment
--   每笔记录含 retained_balance_after 和 debt_balance_after 快照。
--
-- driver_fund_ledger
--   司机资金账本，记录硬币与现金的每笔变动。
--   交易类型：coin_collection, coin_out_exchange, cash_in_exchange,
--             cash_dividend_paid, cash_handover, coin_topup,
--             manual_adjustment
--   每笔记录含 coin_balance_after 和 cash_balance_after 快照。
--
-- daily_driver_reconciliations
--   司机每日结算核对表。
--   开日余额 → 理论余额（从账本计算）→ 实际余额（司机报数）→ 差异
--   核对项：理论应收现金、实际现金、理论硬币余额、实际硬币余额
--
-- merchant_balance_snapshots
--   商家留存余额与债务余额的每日快照，在日结确认时生成。
--
-- 关键规则：
--   1. 商家初始借给的硬币 → merchant_ledger initial_coins → debt_balance ↑
--   2. 商家额外借款 → merchant_ledger additional_loan → debt_balance ↑
--   3. 商家分红：cash=现场结算 | retained=留存
--   4. 司机工作硬币 = 滚动余额 (drivers.coin_balance)
--   5. 商家账和司机账绝不能混
-- ============================================================

-- ============================================================
-- STEP 1: Extend tasks table with score_before
-- ============================================================

ALTER TABLE public.tasks
  ADD COLUMN score_before INTEGER;

COMMENT ON COLUMN public.tasks.score_before IS
  '任务创建时机器的上次记录分数（由触发器自动填充）。Phase 2 用于计算 gross_revenue = (current_score - score_before) × 200。';

-- ============================================================
-- STEP 2: Update validate_task_score() to populate score_before
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

  -- Phase 2: record score_before for revenue calculation
  NEW.score_before := v_kiosk.last_recorded_score;

  -- Advance kiosk's last_recorded_score
  UPDATE public.kiosks
  SET last_recorded_score = NEW.current_score,
      updated_at = now()
  WHERE id = NEW.kiosk_id;

  RETURN NEW;
END;
$$;

-- ============================================================
-- STEP 3: Extend merchants table
-- ============================================================

ALTER TABLE public.merchants
  ADD COLUMN dividend_rate     NUMERIC(5,4)  NOT NULL DEFAULT 0.30,
  ADD COLUMN retained_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN debt_balance      NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.merchants.dividend_rate     IS
  '商家分红比例（0.00~1.00）。dividend_amount = gross_revenue × dividend_rate。';
COMMENT ON COLUMN public.merchants.retained_balance  IS
  '商家留存余额：已赚取但未提取的分红累计。';
COMMENT ON COLUMN public.merchants.debt_balance      IS
  '商家债务余额：含初始硬币借出和额外借款。';

-- ============================================================
-- STEP 4: Extend drivers table
-- ============================================================

ALTER TABLE public.drivers
  ADD COLUMN coin_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN cash_balance NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.drivers.coin_balance IS
  '司机当前硬币余额（货币值），滚动累计。';
COMMENT ON COLUMN public.drivers.cash_balance IS
  '司机当前现金余额，滚动累计。';

-- ============================================================
-- STEP 5: task_settlements
-- ============================================================

CREATE TABLE public.task_settlements (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID          NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  kiosk_id        UUID          NOT NULL REFERENCES public.kiosks(id) ON DELETE RESTRICT,
  merchant_id     UUID          NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  driver_id       UUID          NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  task_date       DATE          NOT NULL,

  score_before    INTEGER       NOT NULL,
  score_after     INTEGER       NOT NULL,
  gross_revenue   NUMERIC(14,2) NOT NULL,
  dividend_rate   NUMERIC(5,4)  NOT NULL,
  dividend_amount NUMERIC(14,2) NOT NULL,
  dividend_method TEXT          NOT NULL
                    CHECK (dividend_method IN ('cash', 'retained')),
  exchange_amount NUMERIC(14,2) NOT NULL DEFAULT 0
                    CHECK (exchange_amount >= 0),

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT ts_task_unique UNIQUE (task_id),
  CONSTRAINT ts_gross_revenue_formula
    CHECK (gross_revenue = (score_after - score_before) * 200),
  CONSTRAINT ts_dividend_nonnegative
    CHECK (dividend_amount >= 0),
  CONSTRAINT ts_score_order
    CHECK (score_after > score_before)
);

COMMENT ON TABLE public.task_settlements IS
  '任务结算表。记录每次巡检任务的财务结算详情：营收、分红、换币。一个 task 对应最多一条 settlement。';
COMMENT ON COLUMN public.task_settlements.gross_revenue   IS '毛收入 = (score_after − score_before) × 200。';
COMMENT ON COLUMN public.task_settlements.dividend_rate   IS '结算时商家分红比例快照。';
COMMENT ON COLUMN public.task_settlements.dividend_amount IS '商家分红金额 = gross_revenue × dividend_rate（四舍五入到分）。';
COMMENT ON COLUMN public.task_settlements.dividend_method IS '分红方式：cash=现场结算，retained=留存。';
COMMENT ON COLUMN public.task_settlements.exchange_amount IS '商家拿现金向司机换硬币的金额（≥0）。';

-- ============================================================
-- STEP 6: merchant_ledger
-- ============================================================

CREATE TABLE public.merchant_ledger (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id            UUID          NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  kiosk_id               UUID          REFERENCES public.kiosks(id) ON DELETE SET NULL,
  task_id                UUID          REFERENCES public.tasks(id) ON DELETE SET NULL,
  settlement_id          UUID          REFERENCES public.task_settlements(id) ON DELETE SET NULL,

  txn_type               TEXT          NOT NULL
                           CHECK (txn_type IN (
                             'initial_coins',
                             'additional_loan',
                             'dividend_cash',
                             'dividend_retained',
                             'coin_exchange',
                             'debt_repayment',
                             'manual_adjustment'
                           )),
  amount                 NUMERIC(14,2) NOT NULL,
  retained_balance_after NUMERIC(14,2) NOT NULL,
  debt_balance_after     NUMERIC(14,2) NOT NULL,

  description            TEXT,
  created_by             UUID,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.merchant_ledger IS
  '商家账本。记录商家每笔财务交易，含交易后余额快照。商家账和司机账绝不能混。';
COMMENT ON COLUMN public.merchant_ledger.txn_type IS
  'initial_coins=初始硬币借出(增加债务), additional_loan=额外借款(增加债务), '
  'dividend_cash=分红现场结算, dividend_retained=分红留存(增加留存余额), '
  'coin_exchange=现金换硬币, debt_repayment=债务偿还(减少债务), '
  'manual_adjustment=手工调账。';
COMMENT ON COLUMN public.merchant_ledger.amount IS
  '交易金额。语义取决于 txn_type。';
COMMENT ON COLUMN public.merchant_ledger.retained_balance_after IS
  '交易后商家留存余额快照。';
COMMENT ON COLUMN public.merchant_ledger.debt_balance_after IS
  '交易后商家债务余额快照。';

-- ============================================================
-- STEP 7: driver_fund_ledger
-- ============================================================

CREATE TABLE public.driver_fund_ledger (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id          UUID          NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  task_id            UUID          REFERENCES public.tasks(id) ON DELETE SET NULL,
  settlement_id      UUID          REFERENCES public.task_settlements(id) ON DELETE SET NULL,

  txn_type           TEXT          NOT NULL
                       CHECK (txn_type IN (
                         'coin_collection',
                         'coin_out_exchange',
                         'cash_in_exchange',
                         'cash_dividend_paid',
                         'cash_handover',
                         'coin_topup',
                         'manual_adjustment'
                       )),
  coin_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  coin_balance_after NUMERIC(14,2) NOT NULL,
  cash_balance_after NUMERIC(14,2) NOT NULL,

  description        TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.driver_fund_ledger IS
  '司机资金账本。记录司机硬币与现金的每笔变动，含交易后余额快照。司机账和商家账绝不能混。';
COMMENT ON COLUMN public.driver_fund_ledger.txn_type IS
  'coin_collection=收币(从机器), coin_out_exchange=换币出(给商家), '
  'cash_in_exchange=换币收现(从商家), cash_dividend_paid=支付商家现场分红, '
  'cash_handover=上缴现金(给老板), coin_topup=硬币补充(从老板), '
  'manual_adjustment=手工调账。';
COMMENT ON COLUMN public.driver_fund_ledger.coin_amount IS
  '硬币变动金额。正数=收入，负数=支出。';
COMMENT ON COLUMN public.driver_fund_ledger.cash_amount IS
  '现金变动金额。正数=收入，负数=支出。';
COMMENT ON COLUMN public.driver_fund_ledger.coin_balance_after IS
  '交易后司机硬币余额快照。';
COMMENT ON COLUMN public.driver_fund_ledger.cash_balance_after IS
  '交易后司机现金余额快照。';

-- ============================================================
-- STEP 8: daily_driver_reconciliations
-- ============================================================

CREATE TABLE public.daily_driver_reconciliations (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id                UUID          NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  reconciliation_date      DATE          NOT NULL,

  -- 开日余额（来自前一日结确认后的实际余额）
  opening_coin_balance     NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_cash_balance     NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- 理论结余（开日余额 + 当日账本变动合计）
  theoretical_coin_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  theoretical_cash_balance NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- 实际结余（司机报数）
  actual_coin_balance      NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_cash_balance      NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- 差异 = 实际 − 理论
  coin_variance            NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_variance            NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- 当日汇总统计
  total_kiosks_visited     INTEGER       NOT NULL DEFAULT 0,
  total_gross_revenue      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_coins_collected    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_coins_exchanged    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_cash_from_exchange NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_dividend_cash      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_dividend_retained  NUMERIC(14,2) NOT NULL DEFAULT 0,

  status                   TEXT          NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'submitted', 'confirmed')),
  notes                    TEXT,
  confirmed_by             UUID,
  confirmed_at             TIMESTAMPTZ,

  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (driver_id, reconciliation_date)
);

COMMENT ON TABLE public.daily_driver_reconciliations IS
  '司机每日结算核对表。核对项：理论应收现金 vs 实际现金、理论硬币余额 vs 实际硬币余额。';
COMMENT ON COLUMN public.daily_driver_reconciliations.opening_coin_balance IS
  '开日硬币余额，取自前一日结确认后的 actual_coin_balance。';
COMMENT ON COLUMN public.daily_driver_reconciliations.theoretical_coin_balance IS
  '理论硬币余额 = opening_coin_balance + 当日所有 driver_fund_ledger 硬币变动合计。';
COMMENT ON COLUMN public.daily_driver_reconciliations.actual_coin_balance IS
  '实际硬币余额，由司机盘点上报。';
COMMENT ON COLUMN public.daily_driver_reconciliations.coin_variance IS
  '硬币差异 = actual_coin_balance − theoretical_coin_balance。';

-- ============================================================
-- STEP 9: merchant_balance_snapshots
-- ============================================================

CREATE TABLE public.merchant_balance_snapshots (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      UUID          NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  snapshot_date    DATE          NOT NULL,
  retained_balance NUMERIC(14,2) NOT NULL,
  debt_balance     NUMERIC(14,2) NOT NULL,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (merchant_id, snapshot_date)
);

COMMENT ON TABLE public.merchant_balance_snapshots IS
  '商家留存余额与债务余额每日快照。在日结确认时自动生成。';

-- ============================================================
-- STEP 10: RPC — record_task_settlement
--   司机或 Boss 为已提交的任务记录财务结算。
--   计算 gross_revenue、dividend_amount，写入 task_settlements、
--   merchant_ledger、driver_fund_ledger，更新运行余额。
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_task_settlement(
  p_task_id         UUID,
  p_dividend_method TEXT,       -- 'cash' | 'retained'
  p_exchange_amount NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task            public.tasks%ROWTYPE;
  v_kiosk           public.kiosks%ROWTYPE;
  v_merchant        public.merchants%ROWTYPE;
  v_driver          public.drivers%ROWTYPE;
  v_score_before    INTEGER;
  v_gross_revenue   NUMERIC(14,2);
  v_dividend_amount NUMERIC(14,2);
  v_settlement_id   UUID;
BEGIN
  -- Validate inputs
  IF p_dividend_method NOT IN ('cash', 'retained') THEN
    RAISE EXCEPTION 'Invalid dividend_method: %. Must be cash or retained.', p_dividend_method;
  END IF;
  IF p_exchange_amount < 0 THEN
    RAISE EXCEPTION 'exchange_amount cannot be negative';
  END IF;

  -- Fetch task
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  -- Permission: task owner or boss
  IF v_task.driver_id <> auth.uid() AND NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: you are not the driver for this task';
  END IF;

  -- Prevent duplicate settlement
  IF EXISTS (SELECT 1 FROM public.task_settlements WHERE task_id = p_task_id) THEN
    RAISE EXCEPTION 'Settlement already recorded for task: %', p_task_id;
  END IF;

  -- score_before must be populated by the Phase 2 trigger.
  -- Reject legacy tasks that lack score_before to prevent incorrect revenue calculation.
  IF v_task.score_before IS NULL THEN
    RAISE EXCEPTION 'Task % has no score_before. Only tasks created after Phase 2 migration can be settled.', p_task_id;
  END IF;
  v_score_before := v_task.score_before;

  -- Fetch related entities (lock for balance updates)
  SELECT * INTO v_kiosk    FROM public.kiosks    WHERE id = v_task.kiosk_id;
  SELECT * INTO v_merchant FROM public.merchants WHERE id = v_kiosk.merchant_id FOR UPDATE;
  SELECT * INTO v_driver   FROM public.drivers   WHERE id = v_task.driver_id   FOR UPDATE;

  -- Calculate revenue
  v_gross_revenue   := (v_task.current_score - v_score_before) * 200;
  v_dividend_amount := ROUND(v_gross_revenue * v_merchant.dividend_rate, 2);

  -- Validate exchange_amount
  IF p_exchange_amount > v_gross_revenue THEN
    RAISE EXCEPTION 'exchange_amount (%) cannot exceed gross_revenue (%)',
      p_exchange_amount, v_gross_revenue;
  END IF;

  -- ===== INSERT task_settlement =====
  INSERT INTO public.task_settlements (
    task_id, kiosk_id, merchant_id, driver_id, task_date,
    score_before, score_after, gross_revenue,
    dividend_rate, dividend_amount, dividend_method, exchange_amount
  ) VALUES (
    p_task_id, v_task.kiosk_id, v_kiosk.merchant_id, v_task.driver_id, v_task.task_date,
    v_score_before, v_task.current_score, v_gross_revenue,
    v_merchant.dividend_rate, v_dividend_amount, p_dividend_method, p_exchange_amount
  ) RETURNING id INTO v_settlement_id;

  -- ===== DRIVER FUND LEDGER =====

  -- 1) Coin collection: driver picks up all coins from the machine
  v_driver.coin_balance := v_driver.coin_balance + v_gross_revenue;
  INSERT INTO public.driver_fund_ledger (
    driver_id, task_id, settlement_id, txn_type,
    coin_amount, cash_amount, coin_balance_after, cash_balance_after,
    description, created_by
  ) VALUES (
    v_task.driver_id, p_task_id, v_settlement_id, 'coin_collection',
    v_gross_revenue, 0, v_driver.coin_balance, v_driver.cash_balance,
    format('收币: 机器 %s, 分数 %s→%s, 毛收入 %s',
      v_kiosk.serial_number, v_score_before, v_task.current_score, v_gross_revenue),
    auth.uid()
  );

  -- 2) Coin exchange: driver gives coins to merchant, receives cash
  IF p_exchange_amount > 0 THEN
    v_driver.coin_balance := v_driver.coin_balance - p_exchange_amount;
    INSERT INTO public.driver_fund_ledger (
      driver_id, task_id, settlement_id, txn_type,
      coin_amount, cash_amount, coin_balance_after, cash_balance_after,
      description, created_by
    ) VALUES (
      v_task.driver_id, p_task_id, v_settlement_id, 'coin_out_exchange',
      -p_exchange_amount, 0, v_driver.coin_balance, v_driver.cash_balance,
      format('换币出: 商家 %s, 金额 %s', v_merchant.name, p_exchange_amount),
      auth.uid()
    );

    v_driver.cash_balance := v_driver.cash_balance + p_exchange_amount;
    INSERT INTO public.driver_fund_ledger (
      driver_id, task_id, settlement_id, txn_type,
      coin_amount, cash_amount, coin_balance_after, cash_balance_after,
      description, created_by
    ) VALUES (
      v_task.driver_id, p_task_id, v_settlement_id, 'cash_in_exchange',
      0, p_exchange_amount, v_driver.coin_balance, v_driver.cash_balance,
      format('换币收现: 商家 %s, 金额 %s', v_merchant.name, p_exchange_amount),
      auth.uid()
    );
  END IF;

  -- 3) Cash dividend paid: driver pays merchant cash if dividend_method = 'cash'
  IF p_dividend_method = 'cash' AND v_dividend_amount > 0 THEN
    v_driver.cash_balance := v_driver.cash_balance - v_dividend_amount;
    INSERT INTO public.driver_fund_ledger (
      driver_id, task_id, settlement_id, txn_type,
      coin_amount, cash_amount, coin_balance_after, cash_balance_after,
      description, created_by
    ) VALUES (
      v_task.driver_id, p_task_id, v_settlement_id, 'cash_dividend_paid',
      0, -v_dividend_amount, v_driver.coin_balance, v_driver.cash_balance,
      format('支付商家 %s 现场分红 %s', v_merchant.name, v_dividend_amount),
      auth.uid()
    );
  END IF;

  -- Update driver running balances
  UPDATE public.drivers
  SET coin_balance = v_driver.coin_balance,
      cash_balance = v_driver.cash_balance
  WHERE id = v_task.driver_id;

  -- ===== MERCHANT LEDGER =====

  -- 1) Dividend entry
  IF p_dividend_method = 'cash' THEN
    -- Cash dividend: no retained_balance change
    INSERT INTO public.merchant_ledger (
      merchant_id, kiosk_id, task_id, settlement_id, txn_type,
      amount, retained_balance_after, debt_balance_after,
      description, created_by
    ) VALUES (
      v_kiosk.merchant_id, v_task.kiosk_id, p_task_id, v_settlement_id, 'dividend_cash',
      v_dividend_amount, v_merchant.retained_balance, v_merchant.debt_balance,
      format('现场分红 %s, 机器 %s', v_dividend_amount, v_kiosk.serial_number),
      auth.uid()
    );
  ELSE
    -- Retained dividend: increase retained_balance
    v_merchant.retained_balance := v_merchant.retained_balance + v_dividend_amount;
    INSERT INTO public.merchant_ledger (
      merchant_id, kiosk_id, task_id, settlement_id, txn_type,
      amount, retained_balance_after, debt_balance_after,
      description, created_by
    ) VALUES (
      v_kiosk.merchant_id, v_task.kiosk_id, p_task_id, v_settlement_id, 'dividend_retained',
      v_dividend_amount, v_merchant.retained_balance, v_merchant.debt_balance,
      format('留存分红 %s, 机器 %s', v_dividend_amount, v_kiosk.serial_number),
      auth.uid()
    );
  END IF;

  -- 2) Coin exchange (merchant side record, no balance change for merchant)
  IF p_exchange_amount > 0 THEN
    INSERT INTO public.merchant_ledger (
      merchant_id, kiosk_id, task_id, settlement_id, txn_type,
      amount, retained_balance_after, debt_balance_after,
      description, created_by
    ) VALUES (
      v_kiosk.merchant_id, v_task.kiosk_id, p_task_id, v_settlement_id, 'coin_exchange',
      p_exchange_amount, v_merchant.retained_balance, v_merchant.debt_balance,
      format('现金换硬币 %s, 机器 %s', p_exchange_amount, v_kiosk.serial_number),
      auth.uid()
    );
  END IF;

  -- Update merchant running balances
  UPDATE public.merchants
  SET retained_balance = v_merchant.retained_balance,
      debt_balance     = v_merchant.debt_balance
  WHERE id = v_kiosk.merchant_id;

  RETURN v_settlement_id;
END;
$$;

COMMENT ON FUNCTION public.record_task_settlement IS
  '为已提交的任务记录财务结算。调用者：任务司机或 Boss。';

-- ============================================================
-- STEP 11: RPC — record_merchant_debt / record_debt_repayment
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_merchant_debt(
  p_merchant_id UUID,
  p_amount      NUMERIC,
  p_debt_type   TEXT,          -- 'initial_coins' | 'additional_loan'
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant  public.merchants%ROWTYPE;
  v_ledger_id UUID;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can record merchant debt';
  END IF;

  IF p_debt_type NOT IN ('initial_coins', 'additional_loan') THEN
    RAISE EXCEPTION 'Invalid debt_type: %. Must be initial_coins or additional_loan.', p_debt_type;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT * INTO v_merchant FROM public.merchants WHERE id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant not found: %', p_merchant_id;
  END IF;

  -- Increase debt balance
  v_merchant.debt_balance := v_merchant.debt_balance + p_amount;

  INSERT INTO public.merchant_ledger (
    merchant_id, txn_type, amount,
    retained_balance_after, debt_balance_after,
    description, created_by
  ) VALUES (
    p_merchant_id, p_debt_type, p_amount,
    v_merchant.retained_balance, v_merchant.debt_balance,
    COALESCE(p_description, CASE p_debt_type
      WHEN 'initial_coins'   THEN format('初始硬币借出 %s', p_amount)
      WHEN 'additional_loan' THEN format('额外借款 %s', p_amount)
    END),
    auth.uid()
  ) RETURNING id INTO v_ledger_id;

  UPDATE public.merchants
  SET debt_balance = v_merchant.debt_balance
  WHERE id = p_merchant_id;

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.record_merchant_debt IS
  '记录商家债务：初始硬币借出或额外借款。Boss 专用。';

-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_debt_repayment(
  p_merchant_id UUID,
  p_amount      NUMERIC,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant  public.merchants%ROWTYPE;
  v_ledger_id UUID;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can record debt repayments';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT * INTO v_merchant FROM public.merchants WHERE id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant not found: %', p_merchant_id;
  END IF;

  IF p_amount > v_merchant.debt_balance THEN
    RAISE EXCEPTION 'Repayment amount (%) exceeds debt balance (%)',
      p_amount, v_merchant.debt_balance;
  END IF;

  -- Decrease debt balance
  v_merchant.debt_balance := v_merchant.debt_balance - p_amount;

  INSERT INTO public.merchant_ledger (
    merchant_id, txn_type, amount,
    retained_balance_after, debt_balance_after,
    description, created_by
  ) VALUES (
    p_merchant_id, 'debt_repayment', -p_amount,
    v_merchant.retained_balance, v_merchant.debt_balance,
    COALESCE(p_description, format('债务偿还 %s', p_amount)),
    auth.uid()
  ) RETURNING id INTO v_ledger_id;

  UPDATE public.merchants
  SET debt_balance = v_merchant.debt_balance
  WHERE id = p_merchant_id;

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.record_debt_repayment IS
  '记录商家债务偿还。Boss 专用。偿还金额不得超过当前债务余额。';

-- ============================================================
-- STEP 12: RPC — record_cash_handover / record_coin_topup
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_cash_handover(
  p_driver_id   UUID,
  p_amount      NUMERIC,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver    public.drivers%ROWTYPE;
  v_ledger_id UUID;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can record cash handovers';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found: %', p_driver_id;
  END IF;

  -- Decrease driver cash balance
  v_driver.cash_balance := v_driver.cash_balance - p_amount;

  INSERT INTO public.driver_fund_ledger (
    driver_id, txn_type,
    coin_amount, cash_amount,
    coin_balance_after, cash_balance_after,
    description, created_by
  ) VALUES (
    p_driver_id, 'cash_handover',
    0, -p_amount,
    v_driver.coin_balance, v_driver.cash_balance,
    COALESCE(p_description, format('现金上缴 %s', p_amount)),
    auth.uid()
  ) RETURNING id INTO v_ledger_id;

  UPDATE public.drivers
  SET cash_balance = v_driver.cash_balance
  WHERE id = p_driver_id;

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.record_cash_handover IS
  '记录司机上缴现金给老板。Boss 专用。';

-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_coin_topup(
  p_driver_id   UUID,
  p_amount      NUMERIC,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver    public.drivers%ROWTYPE;
  v_ledger_id UUID;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can record coin topups';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found: %', p_driver_id;
  END IF;

  -- Increase driver coin balance
  v_driver.coin_balance := v_driver.coin_balance + p_amount;

  INSERT INTO public.driver_fund_ledger (
    driver_id, txn_type,
    coin_amount, cash_amount,
    coin_balance_after, cash_balance_after,
    description, created_by
  ) VALUES (
    p_driver_id, 'coin_topup',
    p_amount, 0,
    v_driver.coin_balance, v_driver.cash_balance,
    COALESCE(p_description, format('硬币补充 %s', p_amount)),
    auth.uid()
  ) RETURNING id INTO v_ledger_id;

  UPDATE public.drivers
  SET coin_balance = v_driver.coin_balance
  WHERE id = p_driver_id;

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.record_coin_topup IS
  '记录老板为司机补充工作硬币。Boss 专用。';

-- ============================================================
-- STEP 13: RPC — submit_daily_reconciliation /
--                confirm_daily_reconciliation
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_daily_reconciliation(
  p_date               DATE,
  p_actual_coin_balance NUMERIC,
  p_actual_cash_balance NUMERIC,
  p_notes              TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id          UUID;
  v_opening_coin       NUMERIC(14,2);
  v_opening_cash       NUMERIC(14,2);
  v_theoretical_coin   NUMERIC(14,2);
  v_theoretical_cash   NUMERIC(14,2);
  v_total_kiosks       INTEGER;
  v_total_gross        NUMERIC(14,2);
  v_total_coins_coll   NUMERIC(14,2);
  v_total_coins_exch   NUMERIC(14,2);
  v_total_cash_exch    NUMERIC(14,2);
  v_total_div_cash     NUMERIC(14,2);
  v_total_div_retained NUMERIC(14,2);
  v_day_coin_delta     NUMERIC(14,2);
  v_day_cash_delta     NUMERIC(14,2);
  v_rec_id             UUID;
  v_prev_rec           public.daily_driver_reconciliations%ROWTYPE;
BEGIN
  v_driver_id := auth.uid();

  -- Verify driver exists (boss can also submit on behalf)
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = v_driver_id)
     AND NOT public.is_boss() THEN
    RAISE EXCEPTION 'Driver not found: %', v_driver_id;
  END IF;

  -- Prevent duplicate
  IF EXISTS (
    SELECT 1 FROM public.daily_driver_reconciliations
    WHERE driver_id = v_driver_id AND reconciliation_date = p_date
  ) THEN
    RAISE EXCEPTION 'Reconciliation already exists for driver % on %', v_driver_id, p_date;
  END IF;

  -- Opening balances from previous day's confirmed reconciliation
  SELECT * INTO v_prev_rec
  FROM public.daily_driver_reconciliations
  WHERE driver_id = v_driver_id
    AND reconciliation_date < p_date
    AND status = 'confirmed'
  ORDER BY reconciliation_date DESC
  LIMIT 1;

  IF FOUND THEN
    v_opening_coin := v_prev_rec.actual_coin_balance;
    v_opening_cash := v_prev_rec.actual_cash_balance;
  ELSE
    -- No previous confirmed reconciliation; use current driver balance as fallback
    -- (for the very first reconciliation, opening = 0 unless coins were topped up)
    v_opening_coin := 0;
    v_opening_cash := 0;
  END IF;

  -- Aggregate from task_settlements for the day.
  -- Note: coins_collected = gross_revenue (driver collects all coins worth gross_revenue).
  -- Note: coins_exchanged = cash_from_exchange = exchange_amount (coins and cash swap at par).
  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(SUM(gross_revenue), 0),
    COALESCE(SUM(exchange_amount), 0),
    COALESCE(SUM(CASE WHEN dividend_method = 'cash' THEN dividend_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN dividend_method = 'retained' THEN dividend_amount ELSE 0 END), 0)
  INTO
    v_total_kiosks, v_total_gross,
    v_total_coins_exch, v_total_div_cash, v_total_div_retained
  FROM public.task_settlements
  WHERE driver_id = v_driver_id
    AND task_date = p_date;

  -- coins_collected equals gross_revenue; cash_from_exchange equals exchange_amount (at par)
  v_total_coins_coll := v_total_gross;
  v_total_cash_exch  := v_total_coins_exch;

  -- Theoretical balance from ledger (accounts for ALL transactions, not just tasks).
  -- Use range comparison instead of created_at::date for index efficiency.
  SELECT COALESCE(SUM(coin_amount), 0), COALESCE(SUM(cash_amount), 0)
  INTO v_day_coin_delta, v_day_cash_delta
  FROM public.driver_fund_ledger
  WHERE driver_id = v_driver_id
    AND created_at >= p_date::timestamptz
    AND created_at <  (p_date + INTERVAL '1 day')::timestamptz;

  v_theoretical_coin := v_opening_coin + v_day_coin_delta;
  v_theoretical_cash := v_opening_cash + v_day_cash_delta;

  -- Insert reconciliation
  INSERT INTO public.daily_driver_reconciliations (
    driver_id, reconciliation_date,
    opening_coin_balance, opening_cash_balance,
    theoretical_coin_balance, theoretical_cash_balance,
    actual_coin_balance, actual_cash_balance,
    coin_variance, cash_variance,
    total_kiosks_visited, total_gross_revenue,
    total_coins_collected, total_coins_exchanged,
    total_cash_from_exchange, total_dividend_cash, total_dividend_retained,
    status, notes
  ) VALUES (
    v_driver_id, p_date,
    v_opening_coin, v_opening_cash,
    v_theoretical_coin, v_theoretical_cash,
    p_actual_coin_balance, p_actual_cash_balance,
    p_actual_coin_balance - v_theoretical_coin,
    p_actual_cash_balance - v_theoretical_cash,
    v_total_kiosks, v_total_gross,
    v_total_coins_coll, v_total_coins_exch,
    v_total_cash_exch, v_total_div_cash, v_total_div_retained,
    'submitted', p_notes
  ) RETURNING id INTO v_rec_id;

  RETURN v_rec_id;
END;
$$;

COMMENT ON FUNCTION public.submit_daily_reconciliation IS
  '司机提交每日结算核对。计算理论余额并记录实际余额与差异。';

-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_daily_reconciliation(
  p_reconciliation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.daily_driver_reconciliations%ROWTYPE;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can confirm reconciliations';
  END IF;

  SELECT * INTO v_rec
  FROM public.daily_driver_reconciliations
  WHERE id = p_reconciliation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation not found: %', p_reconciliation_id;
  END IF;

  IF v_rec.status = 'confirmed' THEN
    RAISE EXCEPTION 'Reconciliation already confirmed';
  END IF;

  -- Mark confirmed
  UPDATE public.daily_driver_reconciliations
  SET status       = 'confirmed',
      confirmed_by = auth.uid(),
      confirmed_at = now()
  WHERE id = p_reconciliation_id;

  -- Update driver balances to actual (close the day)
  UPDATE public.drivers
  SET coin_balance = v_rec.actual_coin_balance,
      cash_balance = v_rec.actual_cash_balance
  WHERE id = v_rec.driver_id;

  -- Create merchant balance snapshots for active merchants
  INSERT INTO public.merchant_balance_snapshots (
    merchant_id, snapshot_date, retained_balance, debt_balance
  )
  SELECT m.id, v_rec.reconciliation_date, m.retained_balance, m.debt_balance
  FROM public.merchants m
  WHERE m.is_active = TRUE
  ON CONFLICT (merchant_id, snapshot_date)
  DO UPDATE SET
    retained_balance = EXCLUDED.retained_balance,
    debt_balance     = EXCLUDED.debt_balance;
END;
$$;

COMMENT ON FUNCTION public.confirm_daily_reconciliation IS
  'Boss 确认司机每日结算核对。确认后更新司机余额为实际值，并生成商家余额快照。';

-- ============================================================
-- STEP 14: RPC — manual_adjustment_merchant /
--                manual_adjustment_driver
-- ============================================================

CREATE OR REPLACE FUNCTION public.manual_adjustment_merchant(
  p_merchant_id    UUID,
  p_retained_adj   NUMERIC DEFAULT 0,
  p_debt_adj       NUMERIC DEFAULT 0,
  p_description    TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant  public.merchants%ROWTYPE;
  v_ledger_id UUID;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can perform manual adjustments';
  END IF;

  IF p_retained_adj = 0 AND p_debt_adj = 0 THEN
    RAISE EXCEPTION 'At least one adjustment amount must be non-zero';
  END IF;

  SELECT * INTO v_merchant FROM public.merchants WHERE id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant not found: %', p_merchant_id;
  END IF;

  v_merchant.retained_balance := v_merchant.retained_balance + p_retained_adj;
  v_merchant.debt_balance     := v_merchant.debt_balance + p_debt_adj;

  INSERT INTO public.merchant_ledger (
    merchant_id, txn_type, amount,
    retained_balance_after, debt_balance_after,
    description, created_by
  ) VALUES (
    p_merchant_id, 'manual_adjustment',
    -- amount stores retained_adj for audit; full detail is in description
    -- and the balance_after fields capture the complete post-txn state
    p_retained_adj,
    v_merchant.retained_balance, v_merchant.debt_balance,
    COALESCE(p_description,
      format('手工调账: 留存调整 %s, 债务调整 %s', p_retained_adj, p_debt_adj)),
    auth.uid()
  ) RETURNING id INTO v_ledger_id;

  UPDATE public.merchants
  SET retained_balance = v_merchant.retained_balance,
      debt_balance     = v_merchant.debt_balance
  WHERE id = p_merchant_id;

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.manual_adjustment_merchant IS
  '老板手工调整商家留存余额和/或债务余额。';

-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.manual_adjustment_driver(
  p_driver_id    UUID,
  p_coin_adj     NUMERIC DEFAULT 0,
  p_cash_adj     NUMERIC DEFAULT 0,
  p_description  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver    public.drivers%ROWTYPE;
  v_ledger_id UUID;
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: only bosses can perform manual adjustments';
  END IF;

  IF p_coin_adj = 0 AND p_cash_adj = 0 THEN
    RAISE EXCEPTION 'At least one adjustment amount must be non-zero';
  END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found: %', p_driver_id;
  END IF;

  v_driver.coin_balance := v_driver.coin_balance + p_coin_adj;
  v_driver.cash_balance := v_driver.cash_balance + p_cash_adj;

  INSERT INTO public.driver_fund_ledger (
    driver_id, txn_type,
    coin_amount, cash_amount,
    coin_balance_after, cash_balance_after,
    description, created_by
  ) VALUES (
    p_driver_id, 'manual_adjustment',
    p_coin_adj, p_cash_adj,
    v_driver.coin_balance, v_driver.cash_balance,
    COALESCE(p_description,
      format('手工调账: 硬币调整 %s, 现金调整 %s', p_coin_adj, p_cash_adj)),
    auth.uid()
  ) RETURNING id INTO v_ledger_id;

  UPDATE public.drivers
  SET coin_balance = v_driver.coin_balance,
      cash_balance = v_driver.cash_balance
  WHERE id = p_driver_id;

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.manual_adjustment_driver IS
  '老板手工调整司机硬币余额和/或现金余额。';

-- ============================================================
-- STEP 15: Indexes
-- ============================================================

-- task_settlements
CREATE INDEX idx_ts_driver_date ON public.task_settlements (driver_id, task_date DESC);
CREATE INDEX idx_ts_merchant    ON public.task_settlements (merchant_id);
CREATE INDEX idx_ts_kiosk       ON public.task_settlements (kiosk_id);

-- merchant_ledger
CREATE INDEX idx_ml_merchant    ON public.merchant_ledger (merchant_id);
CREATE INDEX idx_ml_task        ON public.merchant_ledger (task_id);
CREATE INDEX idx_ml_settlement  ON public.merchant_ledger (settlement_id);
CREATE INDEX idx_ml_created     ON public.merchant_ledger (created_at DESC);
CREATE INDEX idx_ml_txn_type    ON public.merchant_ledger (txn_type);

-- driver_fund_ledger
CREATE INDEX idx_dfl_driver     ON public.driver_fund_ledger (driver_id);
CREATE INDEX idx_dfl_task       ON public.driver_fund_ledger (task_id);
CREATE INDEX idx_dfl_settlement ON public.driver_fund_ledger (settlement_id);
CREATE INDEX idx_dfl_created    ON public.driver_fund_ledger (created_at DESC);
CREATE INDEX idx_dfl_txn_type   ON public.driver_fund_ledger (txn_type);

-- daily_driver_reconciliations
CREATE INDEX idx_ddr_driver_date ON public.daily_driver_reconciliations (driver_id, reconciliation_date DESC);
CREATE INDEX idx_ddr_status      ON public.daily_driver_reconciliations (status);

-- merchant_balance_snapshots
CREATE INDEX idx_mbs_merchant_date ON public.merchant_balance_snapshots (merchant_id, snapshot_date DESC);

-- ============================================================
-- STEP 16: Row Level Security
-- ============================================================

ALTER TABLE public.task_settlements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_ledger              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_fund_ledger           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_driver_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_balance_snapshots   ENABLE ROW LEVEL SECURITY;

-- -------- task_settlements --------
-- Driver sees own settlements; boss sees all.
-- INSERT/UPDATE managed by RPC (SECURITY DEFINER).

CREATE POLICY "ts_select"
  ON public.task_settlements FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

-- -------- merchant_ledger --------
-- Boss only (merchant financial data is sensitive).

CREATE POLICY "ml_select_boss"
  ON public.merchant_ledger FOR SELECT
  USING (public.is_boss());

-- -------- driver_fund_ledger --------
-- Driver sees own entries; boss sees all.

CREATE POLICY "dfl_select"
  ON public.driver_fund_ledger FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

-- -------- daily_driver_reconciliations --------
-- Driver sees own; boss sees all. Driver can insert own. Boss can update.

CREATE POLICY "ddr_select"
  ON public.daily_driver_reconciliations FOR SELECT
  USING (driver_id = auth.uid() OR public.is_boss());

CREATE POLICY "ddr_update_boss"
  ON public.daily_driver_reconciliations FOR UPDATE
  USING (public.is_boss());

-- -------- merchant_balance_snapshots --------
-- Boss only.

CREATE POLICY "mbs_select_boss"
  ON public.merchant_balance_snapshots FOR SELECT
  USING (public.is_boss());

-- ============================================================
-- STEP 17: updated_at triggers for new tables
-- ============================================================

CREATE TRIGGER trg_daily_driver_reconciliations_updated_at
  BEFORE UPDATE ON public.daily_driver_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- END Phase 2 Migration
-- ============================================================
