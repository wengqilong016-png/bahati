import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import type {
  KioskOnboardingRecord,
  Task,
  ScoreResetRequest,
  SyncStatus,
} from './types';

/**
 * Save a kiosk onboarding record locally and enqueue it for sync.
 */
export async function saveOnboarding(
  data: Omit<KioskOnboardingRecord, 'id' | 'created_at' | 'sync_status'>,
): Promise<KioskOnboardingRecord> {
  const record: KioskOnboardingRecord = {
    ...data,
    id: uuidv4(),
    created_at: new Date().toISOString(),
    sync_status: 'pending' as SyncStatus,
  };

  await db.transaction('rw', [db.onboarding_records, db.sync_queue], async () => {
    await db.onboarding_records.add(record);
    await db.sync_queue.add({
      table: 'kiosk_onboarding_records',
      record_id: record.id,
      payload: JSON.stringify(record),
      attempts: 0,
      last_error: '',
      created_at: record.created_at,
    });
  });

  return record;
}

/**
 * Save a daily task locally and enqueue it for sync.
 */
export async function saveTask(
  data: Omit<Task, 'id' | 'created_at' | 'sync_status'>,
): Promise<Task> {
  const record: Task = {
    ...data,
    id: uuidv4(),
    created_at: new Date().toISOString(),
    sync_status: 'pending' as SyncStatus,
  };

  await db.transaction('rw', [db.tasks, db.sync_queue], async () => {
    await db.tasks.add(record);
    await db.sync_queue.add({
      table: 'tasks',
      record_id: record.id,
      payload: JSON.stringify(record),
      attempts: 0,
      last_error: '',
      created_at: record.created_at,
    });
  });

  return record;
}

/**
 * Save a score reset request locally and enqueue it for sync.
 */
export async function saveResetRequest(
  data: Omit<ScoreResetRequest, 'id' | 'created_at' | 'sync_status' | 'status'>,
): Promise<ScoreResetRequest> {
  const record: ScoreResetRequest = {
    ...data,
    id: uuidv4(),
    status: 'pending',
    created_at: new Date().toISOString(),
    sync_status: 'pending' as SyncStatus,
  };

  await db.transaction('rw', [db.reset_requests, db.sync_queue], async () => {
    await db.reset_requests.add(record);
    await db.sync_queue.add({
      table: 'score_reset_requests',
      record_id: record.id,
      payload: JSON.stringify(record),
      attempts: 0,
      last_error: '',
      created_at: record.created_at,
    });
  });

  return record;
}
