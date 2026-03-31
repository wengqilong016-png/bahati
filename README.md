# SmartKiosk

Offline-first kiosk management system for field operations, financial settlement, debt management, and approval workflows.

## Architecture

```
/
├── supabase/
│   ├── migrations/
│   │   ├── 20240101000000_initial_schema.sql               # Legacy (historical)
│   │   ├── 20240102000000_phase1_kiosk_adjustments.sql
│   │   ├── 20240103000000_phase1_score_validation.sql
│   │   ├── 20240104000000_phase1_complete_schema.sql        # Phase 1 authority
│   │   └── 20240105000000_phase2_ledger_reconciliation.sql  # Phase 2 authority
│   └── seed.sql                                             # Dev/test sample data
├── apps/
│   ├── driver/          # React + Dexie + Capacitor (offline-first Android APK)
│   └── boss/            # React Web Dashboard (tablet/desktop)
└── README.md
```

## Authoritative Schema Sources

| Phase | Migration File | Status |
|-------|---------------|--------|
| Phase 1 | `20240104000000_phase1_complete_schema.sql` | **Authority** — drivers, merchants, kiosks, tasks, kiosk\_onboarding\_records, score\_reset\_requests |
| Phase 2 | `20240105000000_phase2_ledger_reconciliation.sql` | **Authority** — task\_settlements, driver\_fund\_ledger, merchant\_ledger, daily\_driver\_reconciliations, merchant\_balance\_snapshots |
| Legacy | `20240101000000_initial_schema.sql` | **Historical only** — profiles/machines/daily\_tasks are dropped by Phase 1 |

### Old → New Name Mapping

| Legacy Name (dropped) | Phase 1/2 Name |
|-----------------------|----------------|
| `profiles` | `drivers` |
| `machines` | `kiosks` |
| `daily_tasks` | `tasks` |
| `machine_onboardings` | `kiosk_onboarding_records` |
| `daily_settlements` | `daily_driver_reconciliations` |
| `driver_ledger_entries` | `driver_fund_ledger` |
| `merchant_ledger_entries` | `merchant_ledger` |
| `machine_id` (column) | `kiosk_id` |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Supabase (Auth / Postgres / Storage / RLS) |
| Driver App | React + Dexie + Capacitor (Android APK) |
| Boss Dashboard | React web app (tablet + desktop first) |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Apply the migrations:
   ```bash
   supabase db push
   # or via the Supabase dashboard SQL editor
   ```
3. (Optional) Seed development data:
   ```bash
   # Run supabase/seed.sql manually in the SQL editor
   ```

### 2. Environment Variables

Both apps need a `.env` file:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Driver App (apps/driver)

### Run locally

```bash
cd apps/driver
npm install
npm run dev
```

### Build Android APK

```bash
cd apps/driver
npm run build:capacitor
npm run cap:add:android    # first time only
npm run cap:sync
npm run cap open android  # opens Android Studio → Build → Generate APK
```

## Boss Dashboard (apps/boss)

### Run locally

```bash
cd apps/boss
npm install
npm run dev
```

### Build for production

```bash
cd apps/boss
npm run build
# Deploy the dist/ folder to any static host (Vercel, Netlify, etc.)
```

## Features

### Driver App (Offline-First)
- Works offline — all data saved to IndexedDB via Dexie
- Background sync engine with retry logic (up to 3 retries)
- Photo capture via Capacitor Camera or file input fallback
- Daily task submission per kiosk
- Score reset request workflow
- Kiosk onboarding / re-certification
- Sync status badge with pending count

### Boss Dashboard (Online)
- Summary dashboard with key metrics
- Kiosk management (add, edit status)
- Score reset approval workflow (approve/reject with RPC calls)
- Daily reconciliation confirmation
- Driver fund ledger with filters
- Merchant ledger with kiosk filter

## Database Schema (Phase 1 + Phase 2)

### Phase 1 Tables
- `drivers` — extends auth.users (full\_name, phone, license\_plate, coin\_balance, cash\_balance)
- `merchants` — merchant entities (name, dividend\_rate, retained\_balance, debt\_balance)
- `kiosks` — kiosk machines with merchant\_id FK and driver assignment
- `tasks` — per-kiosk daily score records (kiosk\_id, score\_before, settlement\_status)
- `kiosk_onboarding_records` — driver onboarding/re-certification submissions with photos
- `score_reset_requests` — approval workflow for score resets (kiosk\_id)
- `kiosk_assignment_history` — driver ↔ kiosk assignment history

### Phase 2 Tables
- `task_settlements` — settlement records per task (gross\_revenue, dividend, exchange, expense)
- `driver_fund_ledger` — driver fund account entries (coin\_amount, cash\_amount)
- `merchant_ledger` — merchant account entries (retained\_balance\_after, debt\_balance\_after)
- `daily_driver_reconciliations` — daily driver reconciliation workflow
- `merchant_balance_snapshots` — daily merchant balance snapshots

### Column Restrictions (Phase 2)
- `drivers.coin_balance`, `drivers.cash_balance` — UPDATE revoked for `authenticated`
- `merchants.retained_balance`, `merchants.debt_balance` — SELECT revoked for `authenticated`
- Boss-only read access requires SECURITY DEFINER RPC or ledger/snapshot aggregation

## Default Seed Credentials (development only)

| Role | Email | Password |
|------|-------|----------|
| Boss | boss@smartkiosk.com | boss1234 |
| Driver | driver@smartkiosk.com | driver1234 |
