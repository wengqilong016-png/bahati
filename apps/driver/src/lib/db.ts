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
 */
class SmartKioskDB extends Dexie {
  onboarding_records!: EntityTable<KioskOnboardingRecord, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  reset_requests!: EntityTable<ScoreResetRequest, 'id'>;
  sync_queue!: EntityTable<SyncQueueItem, 'id'>;

  constructor() {
    super('SmartKioskDriverDB');

    this.version(1).stores({
      onboarding_records: 'id, kiosk_id, driver_id, sync_status, created_at',
      tasks: 'id, kiosk_id, driver_id, sync_status, created_at',
      reset_requests: 'id, kiosk_id, driver_id, sync_status, created_at',
      sync_queue: '++id, table, record_id, created_at',
    });
  }
}

export const db = new SmartKioskDB();
