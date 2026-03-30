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
  kioskId: string;
  currentScore: number;
  lastRecordedScore: number;
  photoUrls: string[];
  notes: string;
}

export async function saveDailyTask(input: SaveDailyTaskInput): Promise<void> {
  const err = validateDailyTaskScore(input.currentScore, input.lastRecordedScore);
  if (err) throw new Error(err);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const taskDate = now.slice(0, 10);

  await db.transaction('rw', [db.tasks, db.sync_queue, db.kiosks], async () => {
    await db.tasks.add({
      id,
      kiosk_id: input.kioskId,
      task_date: taskDate,
      current_score: input.currentScore,
      photo_urls: input.photoUrls,
      notes: input.notes,
      sync_status: 'pending',
      created_at: now,
    });

    await db.sync_queue.add({
      table_name: 'tasks',
      record_id: id,
      operation: 'insert',
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

export interface SaveOnboardingInput {
  kioskId: string;
  onboardingType: OnboardingType;
  photoUrls: string[];
  notes: string;
}

export async function saveOnboarding(input: SaveOnboardingInput): Promise<void> {
  if (input.onboardingType === 'onboarding' && input.photoUrls.length === 0) {
    throw new Error('At least one photo is required for onboarding.');
  }

  const id = crypto.randomUUID();
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
