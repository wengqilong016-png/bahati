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
import { supabase } from './supabase';
import type { OnboardingType } from './types';
import { validateDailyTaskScore, validateScoreResetRequest } from './validation';
import { getTodayNairobi } from './utils';

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
  const taskDate = getTodayNairobi();
  const existingTask = await db.tasks
    .filter(t => t.kiosk_id === input.kioskId && t.task_date === taskDate)
    .first();

  if (existingTask?.settlement_status === 'settled') {
    throw new Error('This kiosk has already been settled today and cannot be modified.');
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

export interface CreateKioskOnboardingInput {
  onboardingId?: string;
  merchantName: string;
  merchantContactName?: string;
  merchantPhone?: string;
  merchantAddress?: string;
  kioskSerialNumber: string;
  kioskLocationName: string;
  initialScore: number;
  initialCoinLoan: number;
  photoUrls: string[];
  notes: string;
}

/**
 * New-machine onboarding flow:
 * - Create merchant
 * - Create kiosk (assigned to current driver)
 * - Create kiosk_onboarding_record (onboarding type)
 * - Optionally create initial coin loan (merchant_ledger initial_coins)
 *
 * This must happen on server via RPC because drivers don't have direct INSERT
 * permissions on merchants / kiosks tables.
 */
export async function createKioskOnboarding(input: CreateKioskOnboardingInput): Promise<{ kioskId: string; merchantId: string }> {
  if (input.merchantName.trim() === '') {
    throw new Error('Merchant name is required.');
  }
  if (input.kioskSerialNumber.trim() === '') {
    throw new Error('Machine serial number is required.');
  }
  if (input.kioskLocationName.trim() === '') {
    throw new Error('Kiosk location is required.');
  }
  if (!Number.isFinite(input.initialScore) || input.initialScore < 0) {
    throw new Error('Initial score must be a non-negative number.');
  }
  if (!Number.isFinite(input.initialCoinLoan) || input.initialCoinLoan < 0) {
    throw new Error('Initial coin loan must be a non-negative number.');
  }
  if (input.photoUrls.length === 0) {
    throw new Error('At least one photo is required for onboarding.');
  }

  const onboardingId = input.onboardingId ?? crypto.randomUUID();
  const { data, error } = await supabase.rpc('driver_create_onboarding_bundle', {
    p_onboarding_id: onboardingId,
    p_merchant_name: input.merchantName.trim(),
    p_merchant_contact_name: input.merchantContactName?.trim() || null,
    p_merchant_phone: input.merchantPhone?.trim() || null,
    p_merchant_address: input.merchantAddress?.trim() || null,
    p_kiosk_serial_number: input.kioskSerialNumber.trim(),
    p_kiosk_location_name: input.kioskLocationName.trim(),
    p_kiosk_initial_score: input.initialScore,
    p_initial_coin_loan: input.initialCoinLoan,
    p_photo_urls: input.photoUrls,
    p_notes: input.notes.trim() || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = (Array.isArray(data) ? data[0] : data) as { kiosk_id?: string; merchant_id?: string } | null;
  const kioskId = row?.kiosk_id;
  const merchantId = row?.merchant_id;
  if (!kioskId || !UUID_RE.test(kioskId) || !merchantId || !UUID_RE.test(merchantId)) {
    throw new Error('Onboarding created, but kiosk id was not returned by server.');
  }

  // Ensure local app can immediately see the new kiosk & onboarding record before next full sync.
  const now = new Date().toISOString();
  await db.transaction('rw', [db.kiosks, db.kiosk_onboarding_records], async () => {
    await db.kiosks.put({
      id: kioskId,
      serial_number: input.kioskSerialNumber.trim(),
      merchant_id: merchantId,
      merchant_name: input.merchantName.trim(),
      merchant_contact: input.merchantPhone?.trim() || undefined,
      location_name: input.kioskLocationName.trim(),
      status: 'active',
      last_recorded_score: input.initialScore,
    });

    await db.kiosk_onboarding_records.put({
      id: onboardingId,
      kiosk_id: kioskId,
      onboarding_type: 'onboarding',
      photo_urls: input.photoUrls,
      notes: input.notes.trim(),
      status: 'pending',
      sync_status: 'synced',
      created_at: now,
    });
  });

  return { kioskId, merchantId };
}

// ---- Kiosk Details Update (serial number + initial score) ----

export interface UpdateKioskDetailsInput {
  kioskId: string;
  /** Updated serial number (if the driver corrected it on-site). */
  serialNumber?: string;
  /** Initial score reading at time of installation / onboarding. */
  initialScore?: number;
}

/**
 * Update local kiosk serial_number and/or last_recorded_score and queue the
 * change for server sync.  Used during new-machine onboarding when the driver
 * corrects the serial number or records the initial score from the machine
 * display.
 */
export async function updateKioskDetails(input: UpdateKioskDetailsInput): Promise<void> {
  if (!UUID_RE.test(input.kioskId)) {
    throw new Error('Invalid kiosk ID.');
  }
  if (input.serialNumber !== undefined && input.serialNumber.trim() === '') {
    throw new Error('Serial number cannot be blank.');
  }
  if (input.initialScore !== undefined && (input.initialScore < 0 || !Number.isFinite(input.initialScore))) {
    throw new Error('Initial score must be a non-negative number.');
  }

  const updates: Record<string, unknown> = {};
  if (input.serialNumber !== undefined) updates.serial_number = input.serialNumber.trim();
  if (input.initialScore !== undefined) updates.last_recorded_score = input.initialScore;

  if (Object.keys(updates).length === 0) return;

  const now = new Date().toISOString();

  await db.transaction('rw', [db.kiosks, db.sync_queue], async () => {
    const modified = await db.kiosks.update(input.kioskId, updates);

    // Only enqueue a server sync when the local row actually existed and was updated.
    // If modified === 0 the kiosk isn't in the local DB yet; queueing an UPDATE
    // would create an orphan sync item that would fail repeatedly on the server.
    if (modified === 0) {
      throw new Error('Kiosk not found in local database. Please sync first before updating kiosk details.');
    }

    await db.sync_queue.add({
      table_name: 'kiosks',
      record_id: input.kioskId,
      operation: 'update',
      payload: JSON.stringify({ id: input.kioskId, ...updates }),
      retry_count: 0,
      last_error: null,
      created_at: now,
    });
  });
}
