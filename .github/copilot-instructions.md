# SmartKiosk — GitHub Copilot Instructions

## Build / Test / Lint

```bash
# Driver App
cd apps/driver
npm run build          # tsc + vite build
npm test               # vitest run (26 tests: validation + settlement calc)
npm run test:watch     # vitest watch mode
npx tsc --noEmit       # typecheck only

# Boss Dashboard
cd apps/boss
npm run build          # tsc + vite build
npx tsc --noEmit       # typecheck only

# Run a single test file
cd apps/driver && npx vitest run src/lib/__tests__/validation.test.ts

# Supabase
supabase db push       # deploy migrations to production (requires `supabase link` first)
```

CI runs typecheck on both apps (`.github/workflows/ci.yml`) and builds APK on version bump (`.github/workflows/release-driver-apk.yml`).

## Architecture

**Two apps, one Supabase backend:**

- **Driver App** (`apps/driver/`): React + Dexie + Capacitor 8 Android. Offline-first — all writes go to IndexedDB first, then sync via `sync_queue`. Targets low-end Android phones.
- **Boss Dashboard** (`apps/boss/`): React web app. Online-only, talks directly to Supabase. Uses react-leaflet for kiosk map.
- **Backend** (`supabase/`): PostgreSQL with RLS + SECURITY DEFINER RPCs. Edge Function `invite-driver` for driver account creation.

### Driver App offline sync flow

```
User action → Dexie (local) + sync_queue entry
                     ↓
              processQueue() → Supabase REST INSERT/UPDATE
                     ↓
              markSynced() → update local sync_status
```

- `sync.ts`: `startSync()` pulls 5 tables from server, retries pending photo uploads, then pushes `sync_queue`.
- `actions.ts`: All save functions (`saveDailyTask`, `saveOnboarding`, `saveScoreResetRequest`) write Dexie + enqueue.
- `storage.ts`: Photo compression (max 1280px, JPEG 0.7-0.4 progressive), offline queue in localStorage.
- INSERT duplicate key (Postgres 23505) is treated as success (idempotent retry).
- MAX_RETRIES = 3.

### Settlement & reconciliation are online-only

`settleTask()` and `submitDailyReconciliation()` call RPCs directly — no offline queue. Both pages show offline warnings and disable submit when `navigator.onLine` is false.

### Role system

- **Driver**: Has row in `drivers` table. Call `public.current_user_role()`.
- **Boss**: `auth.users.raw_user_meta_data->>'role' = 'boss'`. No `drivers` row. Create via `supabase/sql/create_boss_account.sql`.
- Boss RPCs use `is_boss()` guard + `SECURITY DEFINER`.

### Photo storage

Two Supabase Storage buckets with RLS (driver can only write to `{auth.uid()}/` prefix):
- `task-photos`: Daily task score verification photos
- `onboarding-photos`: Kiosk onboarding photos

### GPS

- `@capacitor/geolocation` plugin (auto-merges Android permissions via `cap sync`).
- `useGeolocation` hook in `apps/driver/src/hooks/`.
- Coordinates sent with tasks and onboarding records; `approve_onboarding` RPC copies GPS from record to kiosk.

## Key Conventions

### Schema naming

Use Phase 1/2 names. Legacy names exist in early migrations but are superseded:

| Legacy | Current |
|--------|---------|
| `profiles` | `drivers` |
| `machines` | `kiosks` |
| `machine_id` | `kiosk_id` |

### Financial logic is server-side only

Never compute dividends, settlement amounts, or reconciliation totals in client code. The only exception is `settlementCalc.ts` which provides a **read-only projection preview** for the driver UI.

### Prohibited mutations

- No direct `UPDATE` on `drivers.coin_balance` or `cash_balance` — use RPCs.
- No merchant balance reads for `authenticated` role — boss-only via `read_merchant_balances()` RPC.

### TypeScript

- Strict mode enforced. No `any`; use `unknown` with narrowing.
- Supabase calls: always destructure `{ data, error }`.

### Localization

- **Both apps are fully in Chinese (中文)**. All UI text, error messages, validation messages, and loading states must be in Chinese.
- Timezone: `Africa/Dar_es_Salaam` (UTC+3). Helper: `getTodayDarEsSalaam()`.
- Currency: TZS. Helper: `fmtTZS()` / `fmtCurrency()`.

### SQL migrations

Naming: `YYYYMMDDHHMMSS_descriptive_name.sql` in `supabase/migrations/`.

### Dexie

- Current schema version: **7** (`apps/driver/src/lib/db.ts`).
- Bump version and add a new `.stores()` block for any schema change.

### Capacitor

- **Capacitor 8** (`@capacitor/core ^8.0.0`). Do NOT downgrade.
- Vite 6.x — do not upgrade.
- Avoid `localStorage` for data queuing; use Dexie.