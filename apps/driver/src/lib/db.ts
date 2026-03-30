import Dexie, { type Table } from 'dexie';
import type {
  LocalKiosk,
  LocalTask,
  LocalScoreResetRequest,
  LocalKioskOnboarding,
  SyncQueueItem,
} from './types';

export type {
  LocalKiosk,
  LocalTask,
  LocalScoreResetRequest,
  LocalKioskOnboarding,
  SyncQueueItem,
};

export class SmartKioskDB extends Dexie {
  kiosks!: Table<LocalKiosk>;
  tasks!: Table<LocalTask>;
  score_reset_requests!: Table<LocalScoreResetRequest>;
  kiosk_onboarding_records!: Table<LocalKioskOnboarding>;
  sync_queue!: Table<SyncQueueItem>;

  constructor() {
    super('SmartKioskDB');

    // Version 3 — Phase 1 rename: machines→kiosks, daily_tasks→tasks,
    // machine_onboardings→kiosk_onboarding_records.
    // Drops the legacy Dexie stores (settlements, machines, daily_tasks, machine_onboardings).
    this.version(3).stores({
      // Phase 1 authoritative table names
      kiosks: 'id, serial_number, status',
      tasks: 'id, kiosk_id, task_date, sync_status',
      score_reset_requests: 'id, kiosk_id, sync_status',
      kiosk_onboarding_records: 'id, kiosk_id, onboarding_type, sync_status',
      sync_queue: '++id, table_name, record_id, operation',
      // Explicitly delete legacy stores
      machines: null,
      daily_tasks: null,
      machine_onboardings: null,
      settlements: null,
    });

    // Version 4 — Phase 2 settlement fields: adds settlement_status index on tasks.
    this.version(4).stores({
      kiosks: 'id, serial_number, status',
      tasks: 'id, kiosk_id, task_date, sync_status, settlement_status',
      score_reset_requests: 'id, kiosk_id, sync_status',
      kiosk_onboarding_records: 'id, kiosk_id, onboarding_type, sync_status',
      sync_queue: '++id, table_name, record_id, operation',
    });
  }
}

export const db = new SmartKioskDB();
