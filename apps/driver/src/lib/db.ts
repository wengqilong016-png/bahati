import Dexie, { type EntityTable } from 'dexie';
import type {
  KioskOnboardingRecord,
  Task,
  ScoreResetRequest,
  SyncQueueItem,
} from './types';

/**
 * Local Dexie database for offline-first storage.
 *
 * Tables:
 *  - onboarding_records  → pending / synced kiosk onboarding entries
 *  - tasks               → pending / synced daily task entries
 *  - reset_requests      → pending / synced score reset requests
 *  - sync_queue          → ordered queue of records waiting to sync
 *
 * v2 adds: geo, current_score, last_recorded_score columns
 */
class SmartKioskDB extends Dexie {
  onboarding_records!: EntityTable<KioskOnboardingRecord, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  reset_requests!: EntityTable<ScoreResetRequest, 'id'>;
  sync_queue!: EntityTable<SyncQueueItem, 'id'>;

  constructor() {
    super('SmartKioskDriverDB');

    // v1 → original schema
    this.version(1).stores({
      onboarding_records: 'id, kiosk_id, driver_id, sync_status, created_at',
      tasks: 'id, kiosk_id, driver_id, sync_status, created_at',
      reset_requests: 'id, kiosk_id, driver_id, sync_status, created_at',
      sync_queue: '++id, table, record_id, created_at',
    });

    // v2 → add geo + score fields (index schema unchanged, new fields are non-indexed)
    this.version(2).stores({
      onboarding_records: 'id, kiosk_id, driver_id, sync_status, created_at',
      tasks: 'id, kiosk_id, driver_id, sync_status, created_at',
      reset_requests: 'id, kiosk_id, driver_id, sync_status, created_at',
      sync_queue: '++id, table, record_id, created_at',
    }).upgrade((tx) => {
      // Backfill existing records with default values for new fields
      tx.table('onboarding_records').toCollection().modify((rec: Record<string, unknown>) => {
        if (rec.geo === undefined) rec.geo = null;
      });
      tx.table('tasks').toCollection().modify((rec: Record<string, unknown>) => {
        if (rec.geo === undefined) rec.geo = null;
        if (rec.current_score === undefined) rec.current_score = null;
        if (rec.last_recorded_score === undefined) rec.last_recorded_score = null;
      });
      tx.table('reset_requests').toCollection().modify((rec: Record<string, unknown>) => {
        if (rec.geo === undefined) rec.geo = null;
        if (rec.current_score === undefined) rec.current_score = null;
      });
    });
  }
}

export const db = new SmartKioskDB();
