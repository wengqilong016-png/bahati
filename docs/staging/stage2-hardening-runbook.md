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
psql "$SUPABASE_DB_URL" -f supabase/tests/stage2_rls_assertions.sql
```

## Expected checks
1. Direct `UPDATE drivers.coin_balance/cash_balance` as `authenticated` should fail.
2. Direct `SELECT merchants.retained_balance/debt_balance` as `authenticated` should fail.
3. `read_driver_balances()` should succeed for self-driver read.
4. `read_merchant_balances()` should succeed only for boss users.

## Rollback guidance
- Preferred: restore from DB backup/snapshot taken before migration.
- Emergency: create a follow-up migration that restores prior function definitions and revokes `read_driver_balances`.

## Notes
- The assertion script includes placeholder UUIDs for driver/boss claims.
- Replace placeholders with real auth user ids in staging.
