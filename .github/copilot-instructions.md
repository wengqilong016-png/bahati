# SmartKiosk — GitHub Copilot Instructions

## Project Summary

SmartKiosk is an offline-first kiosk management system comprising:
1. **Driver App**: A React + Dexie + Capacitor Android app.
    - Offline-first, writes to IndexedDB and syncs via `sync_queue`.
2. **Boss Dashboard**: A React web app for tablets/desktops.
    - Online-only, communicates directly with Supabase via the JS client.
3. **Shared backend**: PostgreSQL + Supabase migrations manage schema, with RLS-enforced security.

## Architecture Rules

### Schema Reference
- Use **Phase 1/2 table names**. Ignore legacy schema.

| Legacy Table/Column        | Current Table/Column               |
|----------------------------|------------------------------------|
| `profiles`                 | `drivers`                          |
| `machines`                 | `kiosks`                           |
| `machine_id` (column)      | `kiosk_id`                         |
| (See README for full table mapping) |

### Role-based Logic
- **Driver Role**: Rows exist in `drivers` table.
- **Boss Role**: Identified via `auth.users.raw_user_meta_data->>'role' = 'boss'`. No entry in `drivers`.

> Always call `public.current_user_role()` for roles instead of hardcoding.

---

### Offline Sync — Driver App:
- Writes always queue:
  - IndexedDB (Dexie) → `sync_queue`.
  - **Retry Logic**: Max 3 attempts, conflict resolution handled server-side.

---

### Security Layers:
- **RLS Policies**:
  - Drivers access their data only.
  - Boss operations require `SECURITY DEFINER` RPC calls.

- **Prohibited Actions**:
  - No `UPDATE` on `drivers.coin_balance` or `cash_balance`. Use designated RPCs.
  - No merchant balance reads for `authenticated` users. Boss-only via RPC.

---

### Financial Logic Scope:
- Arithmetic in server-side procedures only (`submit_daily_reconciliation`).
- Drivers input balances only at close of day.

---

## Coding Standards

### TypeScript
- **Strict Mode** enforced.
- Avoid `any`; use `unknown` with type narrowing.

### React
- **Stateless Functional Components + Hooks Only**:
  - Extract custom hooks for data-fetching and sync logic:
    `useSync`, `useKiosks`.

### Supabase
- Always destructure `{ data, error }`.
- Use typed clients and RPCs.

### SQL
- New migrations follow: `YYYYMMDDHHMMSS_name.sql`.

---

## Testing and CI Requirements

- Validate both apps with `npm run build`.
- Document manual test steps for sync queues, RLS, or RPC logic PRs.

---

## Pitfalls to Avoid

1. Stick to Vite 6.x (`package.json` locked).
2. Do NOT use Capacitor 7+ (`Driver App`: Capacitor `6.2.x`).
3. Avoid `localStorage` queuing; Dexie is preferred.
4. Boss accounts: Create via `supabase/sql/create_boss_account.sql`.

---