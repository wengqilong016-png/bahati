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
 * Phase 2 settlement fields are optional (null for pre-Phase-2 tasks).
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
  // Phase 2 settlement fields
  score_before?: number;
  dividend_rate_snapshot?: number;
  settlement_status?: 'pending' | 'settled';
  gross_revenue?: number;
  dividend_amount?: number;
  exchange_amount?: number;
  expense_amount?: number;
  expense_note?: string;
  dividend_method?: 'cash' | 'retained';
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

/**
 * Local representation of a daily driver reconciliation
 * (Phase 2: public.daily_driver_reconciliations).
 */
export interface LocalReconciliation {
  id: string;
  driver_id: string;
  reconciliation_date: string;
  total_kiosks_visited: number;
  total_gross_revenue: number;
  total_coins_collected: number;
  total_coins_exchanged: number;
  total_cash_from_exchange: number;
  total_dividend_cash: number;
  total_dividend_retained: number;
  total_expense_amount: number;
  opening_coin_balance: number;
  opening_cash_balance: number;
  theoretical_coin_balance: number;
  theoretical_cash_balance: number;
  actual_coin_balance: number;
  actual_cash_balance: number;
  coin_variance: number;
  cash_variance: number;
  notes?: string;
  status: 'submitted' | 'confirmed';
  confirmed_by?: string;
  confirmed_at?: string;
  created_at: string;
}
