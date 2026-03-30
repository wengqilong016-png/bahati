import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { validateScoreIncrease } from './validation';
import type {
  KioskOnboardingRecord,
  Task,
  ScoreResetRequest,
  SyncStatus,
} from './types';

/**
 * Save a kiosk onboarding record locally and enqueue it for sync.
 * Photo is required — caller must ensure photo_uri is a non-empty string.
 */
export async function saveOnboarding(
  data: Omit<KioskOnboardingRecord, 'id' | 'created_at' | 'sync_status'>,
): Promise<KioskOnboardingRecord> {
  if (!data.photo_uri) {
    throw new Error('入网认证照片为必填项');
  }

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
 *
 * Score validation: if current_score and last_recorded_score are provided,
 * current_score must be strictly greater than last_recorded_score.
 * Otherwise the driver must use the score-reset-request flow.
 */
export async function saveTask(
  data: Omit<Task, 'id' | 'created_at' | 'sync_status'>,
): Promise<Task> {
  validateScoreIncrease(data.current_score, data.last_recorded_score);

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
