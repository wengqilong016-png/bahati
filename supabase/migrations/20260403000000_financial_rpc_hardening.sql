-- Hardening: validate merchants.is_active in financial RPCs,
-- and fix soft_delete_driver to also block on 'submitted' reconciliations.
--
-- Changes (minimal, surgical):
--   1. record_task_settlement: add is_active check after merchant fetch
--   2. manual_adjustment_merchant: add is_active check after merchant fetch
--   3. soft_delete_driver: expand 'draft' → IN ('draft','submitted')

BEGIN;

-- ============================================================
-- 1. record_task_settlement: add is_active guard
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_task_settlement(
  p_task_id         UUID,
  p_dividend_method TEXT,
  p_exchange_amount NUMERIC DEFAULT 0,
  p_expense_amount  NUMERIC DEFAULT 0,
  p_expense_note    TEXT    DEFAULT NULL
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
  v_orig_coin       NUMERIC(14,2);
  v_orig_cash       NUMERIC(14,2);
BEGIN
  -- Validate inputs
  IF p_dividend_method NOT IN ('cash', 'retained') THEN
    RAISE EXCEPTION 'Invalid dividend_method: %. Must be cash or retained.', p_dividend_method;
  END IF;
  IF p_exchange_amount < 0 THEN
    RAISE EXCEPTION 'exchange_amount cannot be negative';
  END IF;
  IF p_expense_amount < 0 THEN
    RAISE EXCEPTION 'expense_amount cannot be negative';
  END IF;

  -- Fetch task
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  -- Ensure caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Permission denied: unauthenticated users cannot settle tasks';
  END IF;

  -- Permission: task owner or boss
  IF v_task.driver_id IS DISTINCT FROM auth.uid() AND NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: you are not the driver for this task';
  END IF;

  -- Prevent duplicate settlement
  IF EXISTS (SELECT 1 FROM public.task_settlements WHERE task_id = p_task_id) THEN
    RAISE EXCEPTION 'Settlement already recorded for task: %', p_task_id;
  END IF;

  -- score_before and dividend_rate_snapshot must be populated by the Phase 2 trigger.
  IF v_task.score_before IS NULL OR v_task.dividend_rate_snapshot IS NULL THEN
    RAISE EXCEPTION 'Task % has no score_before/dividend_rate_snapshot. Only tasks created after Phase 2 migration can be settled.', p_task_id;
  END IF;
  v_score_before := v_task.score_before;

  -- Fetch related entities (lock for balance updates)
  SELECT * INTO v_kiosk    FROM public.kiosks    WHERE id = v_task.kiosk_id;
  SELECT * INTO v_merchant FROM public.merchants WHERE id = v_kiosk.merchant_id FOR UPDATE;
  SELECT * INTO v_driver   FROM public.drivers   WHERE id = v_task.driver_id   FOR UPDATE;

  -- >>> ADDED: Block settlement if merchant is inactive
  IF NOT v_merchant.is_active THEN
    RAISE EXCEPTION 'Cannot settle: merchant "%" is inactive', v_merchant.name;
  END IF;

  -- Calculate revenue using the dividend_rate snapshot from task creation time
  v_gross_revenue   := (v_task.current_score - v_score_before) * 200;
  v_dividend_amount := ROUND(v_gross_revenue * v_task.dividend_rate_snapshot, 2);

  -- ===== BALANCE PRE-VALIDATION =====
  v_orig_coin := v_driver.coin_balance;
  v_orig_cash := v_driver.cash_balance;

  v_driver.coin_balance := v_driver.coin_balance + v_gross_revenue;

  IF p_exchange_amount > 0 THEN
    IF v_driver.coin_balance < p_exchange_amount THEN
      RAISE EXCEPTION 'Insufficient coin balance (%) for exchange amount (%)',
        v_driver.coin_balance, p_exchange_amount;
    END IF;
    v_driver.coin_balance := v_driver.coin_balance - p_exchange_amount;
    v_driver.cash_balance := v_driver.cash_balance + p_exchange_amount;
  END IF;

  IF p_dividend_method = 'cash' AND v_dividend_amount > 0 THEN
    IF v_driver.cash_balance < v_dividend_amount THEN
      RAISE EXCEPTION 'Insufficient cash balance (%) for dividend payment (%)',
        v_driver.cash_balance, v_dividend_amount;
    END IF;
    v_driver.cash_balance := v_driver.cash_balance - v_dividend_amount;
  END IF;

  IF p_expense_amount > 0 THEN
    IF v_driver.cash_balance < p_expense_amount THEN
      RAISE EXCEPTION 'Insufficient cash balance (%) for expense payment (%)',
        v_driver.cash_balance, p_expense_amount;
    END IF;
    v_driver.cash_balance := v_driver.cash_balance - p_expense_amount;
  END IF;

  -- ===== INSERT task_settlement =====
  INSERT INTO public.task_settlements (
    task_id, kiosk_id, merchant_id, driver_id, task_date,
    score_before, score_after, gross_revenue,
    dividend_rate, dividend_amount, dividend_method,
    exchange_amount, expense_amount, expense_note
  ) VALUES (
    p_task_id, v_task.kiosk_id, v_kiosk.merchant_id, v_task.driver_id, v_task.task_date,
    v_score_before, v_task.current_score, v_gross_revenue,
    v_task.dividend_rate_snapshot, v_dividend_amount, p_dividend_method,
    p_exchange_amount, p_expense_amount, p_expense_note
  ) RETURNING id INTO v_settlement_id;

  -- ===== DRIVER FUND LEDGER =====
  v_driver.coin_balance := v_orig_coin;
  v_driver.cash_balance := v_orig_cash;

  -- 1) Coin collection
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

  -- 2) Coin exchange
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

  -- 3) Cash dividend paid
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

  -- 4) Expense payment
  IF p_expense_amount > 0 THEN
    v_driver.cash_balance := v_driver.cash_balance - p_expense_amount;
    INSERT INTO public.driver_fund_ledger (
      driver_id, task_id, settlement_id, txn_type,
      coin_amount, cash_amount, coin_balance_after, cash_balance_after,
      description, created_by
    ) VALUES (
      v_task.driver_id, p_task_id, v_settlement_id, 'expense_payment',
      0, -p_expense_amount, v_driver.coin_balance, v_driver.cash_balance,
      format('现场支出 %s: %s', p_expense_amount, COALESCE(p_expense_note, '')),
      auth.uid()
    );
  END IF;

  -- Update driver running balances
  UPDATE public.drivers
  SET coin_balance = v_driver.coin_balance,
      cash_balance = v_driver.cash_balance
  WHERE id = v_task.driver_id;

  -- ===== MERCHANT LEDGER =====
  IF p_dividend_method = 'cash' THEN
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

  UPDATE public.merchants
  SET retained_balance = v_merchant.retained_balance,
      debt_balance     = v_merchant.debt_balance
  WHERE id = v_kiosk.merchant_id
    AND (
      retained_balance IS DISTINCT FROM v_merchant.retained_balance OR
      debt_balance     IS DISTINCT FROM v_merchant.debt_balance
    );

  UPDATE public.tasks
  SET settlement_status = 'settled'
  WHERE id = p_task_id;

  RETURN v_settlement_id;
END;
$$;

COMMENT ON FUNCTION public.record_task_settlement IS
  '为已提交的任务记录财务结算。调用者：任务司机或 Boss。拒绝不活跃商户的结算请求。';


-- ============================================================
-- 2. manual_adjustment_merchant: add is_active guard
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

  -- >>> ADDED: Block adjustment if merchant is inactive
  IF NOT v_merchant.is_active THEN
    RAISE EXCEPTION 'Cannot adjust: merchant "%" is inactive', v_merchant.name;
  END IF;

  v_merchant.retained_balance := v_merchant.retained_balance + p_retained_adj;
  v_merchant.debt_balance     := v_merchant.debt_balance + p_debt_adj;

  IF v_merchant.retained_balance < 0 OR v_merchant.debt_balance < 0 THEN
    RAISE EXCEPTION
      'Manual adjustment would result in negative balances: retained_balance=%, debt_balance=%',
      v_merchant.retained_balance,
      v_merchant.debt_balance;
  END IF;

  INSERT INTO public.merchant_ledger (
    merchant_id, txn_type, amount,
    retained_balance_after, debt_balance_after,
    description, created_by
  ) VALUES (
    p_merchant_id, 'manual_adjustment',
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
  '老板手工调整商家留存余额和/或债务余额。拒绝不活跃商户。';


-- ============================================================
-- 3. soft_delete_driver: block on 'submitted' reconciliations too
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_driver(p_driver_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_tasks   INTEGER;
  v_pending_reconc  INTEGER;
  v_pending_resets  INTEGER;
BEGIN
  IF public.current_user_role() <> 'boss' THEN
    RAISE EXCEPTION 'Only boss can deactivate drivers';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = p_driver_id) THEN
    RAISE EXCEPTION 'Driver not found: %', p_driver_id;
  END IF;

  SELECT count(*) INTO v_pending_tasks
  FROM public.tasks t
  WHERE t.driver_id = p_driver_id
    AND t.settlement_status = 'pending';

  IF v_pending_tasks > 0 THEN
    RAISE EXCEPTION 'Cannot deactivate: driver has % unsettled task(s)', v_pending_tasks;
  END IF;

  -- >>> CHANGED: Also block on 'submitted' (not just 'draft')
  SELECT count(*) INTO v_pending_reconc
  FROM public.daily_driver_reconciliations ddr
  WHERE ddr.driver_id = p_driver_id
    AND ddr.status IN ('draft', 'submitted');

  IF v_pending_reconc > 0 THEN
    RAISE EXCEPTION 'Cannot deactivate: driver has % unfinished reconciliation(s)', v_pending_reconc;
  END IF;

  SELECT count(*) INTO v_pending_resets
  FROM public.score_reset_requests srr
  WHERE srr.driver_id = p_driver_id
    AND srr.status = 'pending';

  IF v_pending_resets > 0 THEN
    RAISE EXCEPTION 'Cannot deactivate: driver has % pending score reset request(s)', v_pending_resets;
  END IF;

  UPDATE public.drivers
     SET is_active = FALSE, updated_at = now()
   WHERE id = p_driver_id;

  UPDATE public.kiosks
     SET assigned_driver_id = NULL, updated_at = now()
   WHERE assigned_driver_id = p_driver_id;

  UPDATE public.kiosk_assignment_history
     SET unassigned_at = now(), updated_at = now()
   WHERE driver_id = p_driver_id
     AND unassigned_at IS NULL;
END;
$$;

COMMIT;
