# Stage 2 Hardening Runbook

## Scope
- SECURITY DEFINER hardening (`SET search_path` locked down to empty string) for score-reset RPCs.
- Add `read_driver_balances` RPC for safe driver/boss balance reads.
- RLS/column-privilege assertion script for staging verification.

## Apply migrations
```bash
supabase db reset
# or remote
supabase db push
```

## Run assertion script
```bash
psql "$SUPABASE_DB_URL" \
  -v driver_id="<driver-auth-uuid>" \
  -v boss_id="<boss-auth-uuid>" \
  -v recon_date="2026-04-01" \
  -f supabase/tests/stage2_rls_assertions.sql
```

- `driver_id` and `boss_id` are required.
- `recon_date` is optional; defaults to current date if omitted.

## Expected checks
1. SECURITY DEFINER target functions are pinned to `search_path=''`.
2. Direct `UPDATE drivers.coin_balance/cash_balance` as `authenticated` is denied.
3. Direct `SELECT merchants.retained_balance/debt_balance` as `authenticated` is denied.
4. Driver can read self via `read_driver_balances` but cannot read other drivers.
5. Boss can read merchant balances via `read_merchant_balances` and driver balances via `read_driver_balances`.
6. Opening/theoretical reconciliation evidence query returns expected arithmetic columns.

## Rollback guidance
- Preferred: restore from DB backup/snapshot taken before migration.
- Emergency: create a follow-up migration that restores prior function definitions and revokes `read_driver_balances`.

## Notes
- Assertion script runs inside a transaction and finishes with `ROLLBACK` (non-destructive).
- If there is only one driver row, the cross-driver denial check is reported as `SKIP`.
