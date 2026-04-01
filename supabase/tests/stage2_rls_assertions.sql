-- Stage 2 RLS/privilege assertions
-- Usage (local):
--   supabase db reset
--   psql "$SUPABASE_DB_URL" -f supabase/tests/stage2_rls_assertions.sql

BEGIN;

-- ------------------------------------------------------------
-- 0) Prepare synthetic JWT claims for an authenticated driver.
-- Replace UUIDs with existing rows in your environment as needed.
-- ------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- 1) Driver must NOT directly update protected balance columns.
-- Expected: permission denied.
DO $$
BEGIN
  BEGIN
    UPDATE public.drivers
    SET coin_balance = 999
    WHERE id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'FAIL: driver could update protected coin_balance column';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: direct update on drivers.coin_balance denied';
  END;
END
$$;

-- 2) Driver must NOT directly read restricted merchant columns.
-- Expected: permission denied.
DO $$
BEGIN
  BEGIN
    PERFORM retained_balance, debt_balance FROM public.merchants LIMIT 1;
    RAISE EXCEPTION 'FAIL: driver could read merchant retained/debt columns directly';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: direct select on merchants.retained_balance/debt_balance denied';
  END;
END
$$;

-- 3) Driver can read own balance via SECURITY DEFINER RPC.
SELECT *
FROM public.read_driver_balances('11111111-1111-1111-1111-111111111111');

RESET ROLE;

-- ------------------------------------------------------------
-- 4) Boss-path validation (replace sub with a real boss auth user id)
-- ------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- 4a) Boss can read merchant balances via boss-only RPC.
SELECT * FROM public.read_merchant_balances() LIMIT 5;

-- 4b) Boss can read any driver's balances via new read RPC.
SELECT *
FROM public.read_driver_balances('11111111-1111-1111-1111-111111111111');

RESET ROLE;

-- ------------------------------------------------------------
-- 5) opening formula evidence query (for manual verification)
-- ------------------------------------------------------------
-- For a given reconciliation date, verify:
-- opening_coin_balance = drivers.coin_balance - day_coin_delta
-- when there is no previous confirmed reconciliation.
--
-- Replace date/driver as needed.
WITH day_delta AS (
  SELECT
    dfl.driver_id,
    COALESCE(SUM(dfl.coin_amount), 0) AS coin_delta,
    COALESCE(SUM(dfl.cash_amount), 0) AS cash_delta
  FROM public.driver_fund_ledger dfl
  WHERE dfl.driver_id = '11111111-1111-1111-1111-111111111111'
    AND dfl.txn_date = CURRENT_DATE
  GROUP BY dfl.driver_id
)
SELECT
  dr.coin_balance,
  dr.cash_balance,
  dd.coin_delta,
  dd.cash_delta,
  (dr.coin_balance - dd.coin_delta) AS expected_opening_coin,
  (dr.cash_balance - dd.cash_delta) AS expected_opening_cash
FROM public.drivers dr
JOIN day_delta dd ON dd.driver_id = dr.id
WHERE dr.id = '11111111-1111-1111-1111-111111111111';

ROLLBACK;
