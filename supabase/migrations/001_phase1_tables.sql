-- SmartKiosk Phase 1: Core tables
-- Run this migration against your Supabase project

-- 1. Drivers
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Merchants
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Kiosks
CREATE TABLE IF NOT EXISTS kiosks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  serial_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_onboarding'
    CHECK (status IN ('pending_onboarding','active','needs_recertification','deactivated')),
  current_score NUMERIC NOT NULL DEFAULT 0,
  last_certified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Kiosk onboarding records
--    kiosk_id / merchant_id are nullable UUIDs — the driver submits serial_number
--    and the backend resolves / creates the kiosk + merchant later.
CREATE TABLE IF NOT EXISTS kiosk_onboarding_records (
  id UUID PRIMARY KEY,
  kiosk_id UUID REFERENCES kiosks(id),
  driver_id UUID REFERENCES drivers(id) NOT NULL,
  merchant_id UUID REFERENCES merchants(id),
  merchant_name TEXT NOT NULL DEFAULT '',
  merchant_address TEXT NOT NULL DEFAULT '',
  merchant_contact TEXT NOT NULL DEFAULT '',
  serial_number TEXT NOT NULL,
  photo_uri TEXT NOT NULL,               -- certification photo is required
  notes TEXT NOT NULL DEFAULT '',
  geo JSONB,                             -- {lat, lng, accuracy, captured_at}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tasks (daily operations)
--    kiosk_id stores the serial number as TEXT (driver enters it in the field).
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  driver_id UUID REFERENCES drivers(id) NOT NULL,
  task_type TEXT NOT NULL
    CHECK (task_type IN ('collection','restock','cleaning','inspection','repair')),
  amount NUMERIC,
  current_score NUMERIC,                 -- current_score must be > last_recorded_score
  last_recorded_score NUMERIC,
  notes TEXT NOT NULL DEFAULT '',
  photo_uri TEXT,
  geo JSONB,                             -- {lat, lng, accuracy, captured_at}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Score reset requests
--    kiosk_id stores the serial number as TEXT.
CREATE TABLE IF NOT EXISTS score_reset_requests (
  id UUID PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  driver_id UUID REFERENCES drivers(id) NOT NULL,
  reason TEXT NOT NULL,
  photo_uri TEXT,
  current_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  geo JSONB,                             -- {lat, lng, accuracy, captured_at}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Score validation: current_score must be > last_recorded_score when both are set
ALTER TABLE tasks ADD CONSTRAINT chk_score_increase
  CHECK (current_score IS NULL OR last_recorded_score IS NULL OR current_score > last_recorded_score);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_driver ON tasks(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_kiosk ON tasks(kiosk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_driver ON kiosk_onboarding_records(driver_id);
CREATE INDEX IF NOT EXISTS idx_reset_driver ON score_reset_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_kiosks_serial ON kiosks(serial_number);

-- Row-Level Security
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_onboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_reset_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated drivers can read/write their own records
-- Drivers can read their own row
CREATE POLICY drivers_select_own ON drivers
  FOR SELECT TO authenticated USING (id = auth.uid());

-- Merchants are readable by all authenticated users (drivers need merchant info)
CREATE POLICY merchants_select_all ON merchants
  FOR SELECT TO authenticated USING (true);

-- Kiosks are readable by all authenticated users
CREATE POLICY kiosks_select_all ON kiosks
  FOR SELECT TO authenticated USING (true);

-- Onboarding: drivers can insert and read their own records
CREATE POLICY onboarding_insert_own ON kiosk_onboarding_records
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());
CREATE POLICY onboarding_select_own ON kiosk_onboarding_records
  FOR SELECT TO authenticated USING (driver_id = auth.uid());

-- Tasks: drivers can insert and read their own records
CREATE POLICY tasks_insert_own ON tasks
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());
CREATE POLICY tasks_select_own ON tasks
  FOR SELECT TO authenticated USING (driver_id = auth.uid());

-- Score reset requests: drivers can insert and read their own records
CREATE POLICY reset_insert_own ON score_reset_requests
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());
CREATE POLICY reset_select_own ON score_reset_requests
  FOR SELECT TO authenticated USING (driver_id = auth.uid());
