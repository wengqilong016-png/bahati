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
  last_certified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Kiosk onboarding records
CREATE TABLE IF NOT EXISTS kiosk_onboarding_records (
  id UUID PRIMARY KEY,
  kiosk_id UUID REFERENCES kiosks(id),
  driver_id UUID REFERENCES drivers(id) NOT NULL,
  merchant_id UUID REFERENCES merchants(id),
  merchant_name TEXT NOT NULL DEFAULT '',
  merchant_address TEXT NOT NULL DEFAULT '',
  merchant_contact TEXT NOT NULL DEFAULT '',
  serial_number TEXT NOT NULL,
  photo_uri TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tasks (daily operations)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  kiosk_id UUID NOT NULL,
  driver_id UUID REFERENCES drivers(id) NOT NULL,
  task_type TEXT NOT NULL
    CHECK (task_type IN ('collection','restock','cleaning','inspection','repair')),
  amount NUMERIC,
  notes TEXT NOT NULL DEFAULT '',
  photo_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Score reset requests
CREATE TABLE IF NOT EXISTS score_reset_requests (
  id UUID PRIMARY KEY,
  kiosk_id UUID NOT NULL,
  driver_id UUID REFERENCES drivers(id) NOT NULL,
  reason TEXT NOT NULL,
  photo_uri TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_driver ON tasks(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_kiosk ON tasks(kiosk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_driver ON kiosk_onboarding_records(driver_id);
CREATE INDEX IF NOT EXISTS idx_reset_driver ON score_reset_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_kiosks_serial ON kiosks(serial_number);

-- Row-Level Security (enable per table, policies to be defined per project)
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_onboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_reset_requests ENABLE ROW LEVEL SECURITY;
