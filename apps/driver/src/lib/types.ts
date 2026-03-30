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

/* ---------- Geolocation ---------- */

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy: number;
  captured_at: string;
}

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
  /** Cumulative score tracked on the kiosk */
  current_score: number;
  created_at: string;
}

export interface KioskOnboardingRecord {
  id: string;
  /** Nullable — backend resolves kiosk UUID from serial_number after sync */
  kiosk_id: string | null;
  driver_id: string;
  /** Nullable — backend resolves/creates merchant after sync */
  merchant_id: string | null;
  merchant_name: string;
  merchant_address: string;
  merchant_contact: string;
  serial_number: string;
  /** Required – base64 data-URI of certification photo */
  photo_uri: string;
  notes: string;
  geo: GeoPoint | null;
  created_at: string;
  sync_status: SyncStatus;
}

export interface Task {
  id: string;
  kiosk_id: string;
  driver_id: string;
  task_type: TaskType;
  amount: number | null;
  /** current_score must be > last_recorded_score; enforced at capture time */
  current_score: number | null;
  last_recorded_score: number | null;
  notes: string;
  /** Optional photo – base64 data-URI */
  photo_uri: string | null;
  geo: GeoPoint | null;
  created_at: string;
  sync_status: SyncStatus;
}

export interface ScoreResetRequest {
  id: string;
  kiosk_id: string;
  driver_id: string;
  reason: string;
  /** Optional evidence photo */
  photo_uri: string | null;
  current_score: number | null;
  status: ResetRequestStatus;
  geo: GeoPoint | null;
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
