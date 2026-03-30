# SmartKiosk

Offline-first kiosk management system for field operations, financial settlement, debt management, and approval workflows.

## Architecture

```
/
├── supabase/
│   ├── migrations/
│   │   └── 20240101000000_initial_schema.sql   # Full schema, RLS, triggers, RPCs
│   └── seed.sql                                 # Dev/test sample data
├── apps/
│   ├── driver/          # React + Dexie + Capacitor (offline-first Android APK)
│   └── boss/            # React Web Dashboard (tablet/desktop)
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Supabase (Auth / Postgres / Storage / RLS) |
| Driver App | React + Dexie + Capacitor (Android APK) |
| Boss Dashboard | React web app (tablet + desktop first) |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Apply the migration:
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
npm run build
npx cap add android        # first time only
npx cap sync android
npx cap open android       # opens Android Studio → Build → Generate APK
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
- Daily task submission per machine
- Score reset request workflow
- Daily settlement (draft → submit)
- Sync status badge with pending count

### Boss Dashboard (Online)
- Summary dashboard with key metrics
- Machine management (add, edit status)
- Score reset approval workflow (approve/reject with RPC calls)
- Settlement confirmation
- Driver ledger with filters
- Merchant ledger with machine filter

## Database Schema

- `profiles` — extends auth.users with role (driver/boss)
- `machines` — kiosk machines with assignment to drivers
- `machine_onboardings` — driver onboarding submissions with photos
- `daily_tasks` — per-machine daily score records
- `score_reset_requests` — approval workflow for score resets
- `daily_settlements` — driver daily financial summaries
- `driver_ledger_entries` — driver fund account entries
- `merchant_ledger_entries` — merchant account entries (boss-only)
- `sync_log` — offline sync tracking

## Default Seed Credentials (development only)

| Role | Email | Password |
|------|-------|----------|
| Boss | boss@smartkiosk.com | boss1234 |
| Driver | driver@smartkiosk.com | driver1234 |
