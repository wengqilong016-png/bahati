import Dexie, { type Table } from 'dexie';
import type {
  LocalMachine,
  LocalDailyTask,
  LocalScoreResetRequest,
  LocalMachineOnboarding,
  SyncQueueItem,
} from './types';

export type {
  LocalMachine,
  LocalDailyTask,
  LocalScoreResetRequest,
  LocalMachineOnboarding,
  SyncQueueItem,
};

/** @deprecated Kept for backward compatibility — not used in Phase 1 */
export interface LocalSettlement {
  id: string;
  settlement_date: string;
  total_machines_visited: number;
  total_collections: number;
  notes: string;
  status: 'draft' | 'submitted';
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  created_at: string;
}

export class SmartKioskDB extends Dexie {
  machines!: Table<LocalMachine>;
  daily_tasks!: Table<LocalDailyTask>;
  score_reset_requests!: Table<LocalScoreResetRequest>;
  machine_onboardings!: Table<LocalMachineOnboarding>;
  settlements!: Table<LocalSettlement>;
  sync_queue!: Table<SyncQueueItem>;

  constructor() {
    super('SmartKioskDB');

    // Version 2 adds onboarding_type index
    this.version(2).stores({
      machines: 'id, serial_number, status',
      daily_tasks: 'id, machine_id, task_date, sync_status',
      score_reset_requests: 'id, machine_id, sync_status',
      machine_onboardings: 'id, machine_id, onboarding_type, sync_status',
      settlements: 'id, settlement_date, sync_status',
      sync_queue: '++id, table_name, record_id, operation',
    });
  }
}

export const db = new SmartKioskDB();
