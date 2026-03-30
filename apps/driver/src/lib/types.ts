// ============================================================
// Phase 1 — Shared type definitions
// ============================================================

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export type OnboardingType = 'onboarding' | 'recertification';

export const ONBOARDING_TYPES: readonly OnboardingType[] = ['onboarding', 'recertification'] as const;

// ---- Dexie local interfaces --------------------------------

export interface LocalMachine {
  id: string;
  serial_number: string;
  location_name: string;
  merchant_name: string;
  merchant_contact?: string;
  status: string;
  last_recorded_score: number;
}

export interface LocalDailyTask {
  id: string;
  machine_id: string;
  task_date: string;
  current_score: number;
  photo_urls: string[];
  notes: string;
  sync_status: SyncStatus;
  created_at: string;
}

export interface LocalScoreResetRequest {
  id: string;
  machine_id: string;
  current_score: number;
  requested_new_score: number;
  reason: string;
  sync_status: SyncStatus;
  created_at: string;
}

export interface LocalMachineOnboarding {
  id: string;
  machine_id: string;
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
