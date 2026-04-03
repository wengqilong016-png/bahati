-- Add NOT FOUND guards for kiosk/merchant/driver lookups in record_task_settlement.
-- Previously, a deleted kiosk would cause a silent NULL dereference.

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

  -- Fetch related entities with NOT FOUND guards (lock for balance updates)
  SELECT * INTO v_kiosk FROM public.kiosks WHERE id = v_task.kiosk_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kiosk not found for task %: kiosk_id=%', p_task_id, v_task.kiosk_id;
  END IF;

  SELECT * INTO v_merchant FROM public.merchants WHERE id = v_kiosk.merchant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant not found for kiosk %: merchant_id=%', v_kiosk.id, v_kiosk.merchant_id;
  END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = v_task.driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found: %', v_task.driver_id;
  END IF;

  -- Block settlement if merchant is inactive
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

-- Ensure correct permissions
REVOKE ALL ON FUNCTION public.record_task_settlement(UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_task_settlement(UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;
