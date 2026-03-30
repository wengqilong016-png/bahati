import Dexie, { type Table } from 'dexie';

export interface LocalMachine {
  id: string;
  serial_number: string;
  location_name: string;
  merchant_name: string;
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
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  created_at: string;
}

export interface LocalScoreResetRequest {
  id: string;
  machine_id: string;
  current_score: number;
  requested_new_score: number;
  reason: string;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  created_at: string;
}

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

export interface LocalMachineOnboarding {
  id: string;
  machine_id: string;
  photo_urls: string[];
  notes: string;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  created_at: string;
}

export interface SyncQueue {
  id?: number;
  table_name: string;
  record_id: string;
  operation: 'insert' | 'update' | 'delete';
  payload: string;
  retry_count: number;
  last_error: string | null;
  created_at: string;
}

export class SmartKioskDB extends Dexie {
  machines!: Table<LocalMachine>;
  daily_tasks!: Table<LocalDailyTask>;
  score_reset_requests!: Table<LocalScoreResetRequest>;
  settlements!: Table<LocalSettlement>;
  machine_onboardings!: Table<LocalMachineOnboarding>;
  sync_queue!: Table<SyncQueue>;

  constructor() {
    super('SmartKioskDB');
    this.version(1).stores({
      machines: 'id, serial_number, status',
      daily_tasks: 'id, machine_id, task_date, sync_status',
      score_reset_requests: 'id, machine_id, sync_status',
      settlements: 'id, settlement_date, sync_status',
      machine_onboardings: 'id, machine_id, sync_status',
      sync_queue: '++id, table_name, record_id, operation',
    });
  }
}

export const db = new SmartKioskDB();
