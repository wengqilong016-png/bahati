/** Shared type definitions for SmartKiosk Phase 1 */

/* ---------- Enums ---------- */

export type SyncStatus = 'pending' | 'synced' | 'failed';

export type KioskStatus =
  | 'pending_onboarding'
  | 'active'
  | 'needs_recertification'
  | 'deactivated';

export type TaskType =
  | 'collection'
  | 'restock'
  | 'cleaning'
  | 'inspection'
  | 'repair';

export type ResetRequestStatus = 'pending' | 'approved' | 'rejected';

/* ---------- Core domain ---------- */

export interface Driver {
  id: string;
  phone: string;
  name: string;
  created_at: string;
}

export interface Merchant {
  id: string;
  name: string;
  address: string;
  contact_phone: string;
  created_at: string;
}

export interface Kiosk {
  id: string;
  merchant_id: string;
  serial_number: string;
  status: KioskStatus;
  last_certified_at: string | null;
  created_at: string;
}

export interface KioskOnboardingRecord {
  id: string;
  kiosk_id: string;
  driver_id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_address: string;
  merchant_contact: string;
  serial_number: string;
  photo_uri: string | null;
  notes: string;
  created_at: string;
  sync_status: SyncStatus;
}

export interface Task {
  id: string;
  kiosk_id: string;
  driver_id: string;
  task_type: TaskType;
  amount: number | null;
  notes: string;
  photo_uri: string | null;
  created_at: string;
  sync_status: SyncStatus;
}

export interface ScoreResetRequest {
  id: string;
  kiosk_id: string;
  driver_id: string;
  reason: string;
  photo_uri: string | null;
  status: ResetRequestStatus;
  created_at: string;
  sync_status: SyncStatus;
}

/* ---------- Sync queue ---------- */

export interface SyncQueueItem {
  id?: number; // auto-increment
  table: 'kiosk_onboarding_records' | 'tasks' | 'score_reset_requests';
  record_id: string;
  payload: string; // JSON string
  attempts: number;
  last_error: string;
  created_at: string;
}
