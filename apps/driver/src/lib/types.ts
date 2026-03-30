// ============================================================
// Phase 1 — Shared type definitions
//
// Authoritative source: 20240104000000_phase1_complete_schema.sql
// Tables: drivers, merchants, kiosks, tasks, kiosk_onboarding_records,
//         score_reset_requests, kiosk_assignment_history
// ============================================================

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export type OnboardingType = 'onboarding' | 'recertification';

export const ONBOARDING_TYPES: readonly OnboardingType[] = ['onboarding', 'recertification'] as const;

// ---- Dexie local interfaces --------------------------------

/**
 * Local representation of a kiosk (Phase 1: public.kiosks).
 * merchant_name / merchant_contact are denormalised from the
 * merchants table during pullKiosks() so they are available offline.
 */
export interface LocalKiosk {
  id: string;
  serial_number: string;
  location_name: string;
  merchant_id: string;
  merchant_name: string;       // denormalised from merchants.name
  merchant_contact?: string;   // denormalised from merchants.phone
  status: string;
  last_recorded_score: number;
}

/**
 * Local representation of a task (Phase 1: public.tasks).
 * Uses kiosk_id (not machine_id) per Phase 1 authority.
 */
export interface LocalTask {
  id: string;
  kiosk_id: string;
  task_date: string;
  current_score: number;
  photo_urls: string[];
  notes: string;
  sync_status: SyncStatus;
  created_at: string;
}

export interface LocalScoreResetRequest {
  id: string;
  kiosk_id: string;
  current_score: number;
  requested_new_score: number;
  reason: string;
  sync_status: SyncStatus;
  created_at: string;
}

/**
 * Local representation of a kiosk onboarding record
 * (Phase 1: public.kiosk_onboarding_records).
 */
export interface LocalKioskOnboarding {
  id: string;
  kiosk_id: string;
  onboarding_type: OnboardingType;
  photo_urls: string[];
  notes: string;
  sync_status: SyncStatus;
  created_at: string;
}

export interface SyncQueueItem {
  id?: number;
  table_name: string;
  record_id: string;
  operation: 'insert' | 'update' | 'delete';
  payload: string;
  retry_count: number;
  last_error: string | null;
  created_at: string;
}
