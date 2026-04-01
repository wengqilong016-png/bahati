\echo 'Stage2 RLS/Privilege assertions starting...'
\set ON_ERROR_STOP on

-- Usage example:
-- psql "$SUPABASE_DB_URL" \
--   -v driver_id="<driver-auth-uuid>" \
--   -v boss_id="<boss-auth-uuid>" \
--   -v recon_date="2026-04-01" \
--   -f supabase/tests/stage2_rls_assertions.sql

-- Required runtime variables
\if :{?driver_id}
\else
\echo 'ERROR: missing -v driver_id=<uuid>'
\quit 1
\endif

\if :{?boss_id}
\else
\echo 'ERROR: missing -v boss_id=<uuid>'
\quit 1
\endif

-- Optional runtime variable
\if :{?recon_date}
\else
\set recon_date `date +%F`
\endif

BEGIN;

-- ------------------------------------------------------------
-- 0) Static hardening checks for SECURITY DEFINER functions
-- ------------------------------------------------------------
DO $$
DECLARE
  v_bad_count integer;
BEGIN
  SELECT count(*) INTO v_bad_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'handle_score_reset_approval',
      'approve_score_reset',
      'reject_score_reset',
      'read_driver_balances'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
      WHERE cfg = 'search_path=''
    );

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'FAIL: % function(s) are missing search_path='''' hardening', v_bad_count;
  END IF;

  RAISE NOTICE 'PASS: SECURITY DEFINER functions are pinned to search_path='''' ';
END
$$;

-- ------------------------------------------------------------
-- 1) Driver context assertions
-- ------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'driver_id', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN
    EXECUTE format('UPDATE public.drivers SET coin_balance = 999 WHERE id = %L', :'driver_id');
    RAISE EXCEPTION 'FAIL: driver could update protected coin_balance';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: direct update on drivers.coin_balance denied';
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM retained_balance, debt_balance FROM public.merchants LIMIT 1;
    RAISE EXCEPTION 'FAIL: driver could read restricted merchant balances';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: direct select on merchants.retained_balance/debt_balance denied';
  END;
END;
$$;

-- Driver can read own balance via RPC
SELECT * FROM public.read_driver_balances(:'driver_id'::uuid);

-- Driver cannot read another driver's balance via RPC
DO $$
DECLARE
  v_other uuid;
BEGIN
  SELECT d.id INTO v_other
  FROM public.drivers d
  WHERE d.id <> :'driver_id'::uuid
  LIMIT 1;

  IF v_other IS NULL THEN
    RAISE NOTICE 'SKIP: no second driver row available for cross-driver denial check';
    RETURN;
  END IF;

  BEGIN
    PERFORM * FROM public.read_driver_balances(v_other);
    RAISE EXCEPTION 'FAIL: driver could read other driver balances via RPC';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: driver cross-driver read via RPC denied';
  END;
END
$$;

RESET ROLE;

-- ------------------------------------------------------------
-- 2) Boss context assertions
-- ------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'boss_id', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- Boss-only merchant balance RPC should succeed
SELECT * FROM public.read_merchant_balances() LIMIT 5;

-- Boss can read any driver's balances via read_driver_balances
SELECT * FROM public.read_driver_balances(:'driver_id'::uuid);

RESET ROLE;

-- ------------------------------------------------------------
-- 3) Opening formula evidence query
-- ------------------------------------------------------------
WITH target_recon AS (
  SELECT r.*
  FROM public.daily_driver_reconciliations r
  WHERE r.driver_id = :'driver_id'::uuid
    AND r.reconciliation_date = :'recon_date'::date
  LIMIT 1
),
day_delta AS (
  SELECT
    dfl.driver_id,
    COALESCE(SUM(dfl.coin_amount), 0) AS coin_delta,
    COALESCE(SUM(dfl.cash_amount), 0) AS cash_delta
  FROM public.driver_fund_ledger dfl
  WHERE dfl.driver_id = :'driver_id'::uuid
    AND dfl.txn_date = :'recon_date'::date
  GROUP BY dfl.driver_id
)
SELECT
  tr.driver_id,
  tr.reconciliation_date,
  tr.opening_coin_balance,
  tr.opening_cash_balance,
  dd.coin_delta,
  dd.cash_delta,
  (tr.opening_coin_balance + dd.coin_delta) AS recomputed_theoretical_coin,
  (tr.opening_cash_balance + dd.cash_delta) AS recomputed_theoretical_cash,
  tr.theoretical_coin_balance,
  tr.theoretical_cash_balance
FROM target_recon tr
LEFT JOIN day_delta dd ON dd.driver_id = tr.driver_id;

ROLLBACK;
\echo 'Stage2 assertions finished.'
