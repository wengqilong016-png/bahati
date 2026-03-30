// ============================================================
// Phase 1 — Local-first save actions
//
// Every public function here:
//   1. Validates input
//   2. Writes to the Dexie domain table
//   3. Enqueues a sync_queue item
//   4. Updates related local state (e.g. kiosk score)
//
// All writes are local — sync happens later via processQueue().
//
// Authoritative tables: kiosks, tasks, score_reset_requests,
//   kiosk_onboarding_records  (Phase 1 schema)
// ============================================================

import { db } from './db';
import type { OnboardingType } from './types';
import { validateDailyTaskScore, validateScoreResetRequest } from './validation';

// ---- Daily Task (Phase 1: public.tasks) ----

export interface SaveDailyTaskInput {
  id?: string;           // Pre-generated ID (keeps storage path consistent with record)
  kioskId: string;
  currentScore: number;
  lastRecordedScore: number;
  photoUrls: string[];
  notes: string;
}

export async function saveDailyTask(input: SaveDailyTaskInput): Promise<void> {
  const err = validateDailyTaskScore(input.currentScore, input.lastRecordedScore);
  if (err) throw new Error(err);

  // Settlement guard: prevent overwriting a settled task for the same kiosk+date.
  const taskDate = new Date().toISOString().slice(0, 10);
  const existingTask = await db.tasks
    .filter(t => t.kiosk_id === input.kioskId && t.task_date === taskDate)
    .first();

  if (existingTask?.settlement_status === 'settled') {
    throw new Error('该机台今日任务已结算，不可修改');
  }

  const id = input.id ?? existingTask?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.transaction('rw', [db.tasks, db.sync_queue, db.kiosks], async () => {
    await db.tasks.put({
      id,
      kiosk_id: input.kioskId,
      task_date: taskDate,
      current_score: input.currentScore,
      photo_urls: input.photoUrls,
      notes: input.notes,
      sync_status: 'pending',
      created_at: existingTask?.created_at ?? now,
    });

    await db.sync_queue.add({
      table_name: 'tasks',
      record_id: id,
      operation: existingTask ? 'update' : 'insert',
      payload: JSON.stringify({
        id,
        kiosk_id: input.kioskId,
        task_date: taskDate,
        current_score: input.currentScore,
        photo_urls: input.photoUrls,
        notes: input.notes,
      }),
      retry_count: 0,
      last_error: null,
      created_at: now,
    });

    // Update local kiosk score so subsequent tasks see the new baseline
    await db.kiosks.update(input.kioskId, {
      last_recorded_score: input.currentScore,
    });
  });
}

// ---- Score Reset Request ----

export interface SaveScoreResetInput {
  kioskId: string;
  currentScore: number;
  requestedNewScore: number;
  reason: string;
}

export async function saveScoreResetRequest(input: SaveScoreResetInput): Promise<void> {
  const err = validateScoreResetRequest(input.requestedNewScore, input.currentScore);
  if (err) throw new Error(err);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.transaction('rw', [db.score_reset_requests, db.sync_queue], async () => {
    await db.score_reset_requests.add({
      id,
      kiosk_id: input.kioskId,
      current_score: input.currentScore,
      requested_new_score: input.requestedNewScore,
      reason: input.reason,
      sync_status: 'pending',
      created_at: now,
    });

    await db.sync_queue.add({
      table_name: 'score_reset_requests',
      record_id: id,
      operation: 'insert',
      payload: JSON.stringify({
        id,
        kiosk_id: input.kioskId,
        current_score: input.currentScore,
        requested_new_score: input.requestedNewScore,
        reason: input.reason,
      }),
      retry_count: 0,
      last_error: null,
      created_at: now,
    });
  });
}

// ---- Kiosk Onboarding (Phase 1: public.kiosk_onboarding_records) ----

// Phase 1 schema enforces kiosk_id as UUID FK to kiosks(id).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SaveOnboardingInput {
  id?: string;           // Pre-generated ID (keeps storage path consistent with record)
  kioskId: string;
  onboardingType: OnboardingType;
  photoUrls: string[];
  notes: string;
}

export async function saveOnboarding(input: SaveOnboardingInput): Promise<void> {
  if (!UUID_RE.test(input.kioskId)) {
    throw new Error('Invalid kiosk ID. Please select a kiosk from the list.');
  }
  if (input.onboardingType === 'onboarding' && input.photoUrls.length === 0) {
    throw new Error('At least one photo is required for onboarding.');
  }

  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.transaction('rw', [db.kiosk_onboarding_records, db.sync_queue], async () => {
    await db.kiosk_onboarding_records.add({
      id,
      kiosk_id: input.kioskId,
      onboarding_type: input.onboardingType,
      photo_urls: input.photoUrls,
      notes: input.notes,
      sync_status: 'pending',
      created_at: now,
    });

    await db.sync_queue.add({
      table_name: 'kiosk_onboarding_records',
      record_id: id,
      operation: 'insert',
      payload: JSON.stringify({
        id,
        kiosk_id: input.kioskId,
        onboarding_type: input.onboardingType,
        photo_urls: input.photoUrls,
        notes: input.notes,
      }),
      retry_count: 0,
      last_error: null,
      created_at: now,
    });
  });
}
