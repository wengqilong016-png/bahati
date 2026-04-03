import { supabase } from './supabase';
import { db } from './db';
import { retryPendingUploads } from './storage';
import type { OnboardingType } from './types';

const MAX_RETRIES = 3;

// ---- Module-level lock to prevent concurrent queue processing ----
let processingQueue = false;

// ---- Internal pull implementations that accept a pre-fetched user ID ----
// The exported functions call getUser() internally for standalone use.
// startSync() calls getUser() once and passes it to avoid repeated round-trips.

async function _pullKiosks(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('kiosks')
    .select(
      'id, serial_number, merchant_id, location_name, status, last_recorded_score, merchants(name, phone)',
    )
    .eq('assigned_driver_id', userId);

  if (error) {
    console.error('[sync] pullKiosks error:', error.message);
    return;
  }

  const remoteIds = new Set((data ?? []).map((k: Record<string, unknown>) => k.id as string));
  const localKiosks = await db.kiosks.toArray();
  const staleIds = localKiosks.map(k => k.id).filter(id => !remoteIds.has(id));
  if (staleIds.length > 0) {
    await db.kiosks.bulkDelete(staleIds);
  }

  if (data && data.length > 0) {
    const rows = data.map((k: Record<string, unknown>) => {
      const merchantRaw = k.merchants;
      const merchant = Array.isArray(merchantRaw)
        ? (merchantRaw[0] as { name: string; phone: string | null } | undefined) ?? null
        : (merchantRaw as { name: string; phone: string | null } | null);
      return {
        id: k.id as string,
        serial_number: k.serial_number as string,
        merchant_id: k.merchant_id as string,
        location_name: k.location_name as string,
        status: k.status as string,
        last_recorded_score: k.last_recorded_score as number,
        merchant_name: merchant?.name ?? '',
        merchant_contact: merchant?.phone ?? undefined,
      };
    });
    await db.kiosks.bulkPut(rows);
  }
}

async function _pullTasks(userId: string): Promise<void> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, kiosk_id, task_date, score_before, current_score, gross_revenue, dividend_rate_snapshot, dividend_amount, dividend_method, exchange_amount, expense_amount, expense_note, settlement_status, photo_urls, notes, created_at',
    )
    .eq('driver_id', userId)
    .eq('task_date', today);

  if (error) {
    console.error('[sync] pullTasks error:', error.message);
    return;
  }

  if (data && data.length > 0) {
    // Preserve local photo_urls/notes as fallback if server data is empty (upload still pending)
    const ids = data.map(t => (t as Record<string, unknown>).id as string);
    const existingRows = await db.tasks.bulkGet(ids);
    const existingMap = new Map(existingRows.filter(Boolean).map(t => [t!.id, t!]));

    const rows = data.map((t: Record<string, unknown>) => {
      const local = existingMap.get(t.id as string);
      const serverPhotos = Array.isArray(t.photo_urls) ? t.photo_urls as string[] : [];
      const serverNotes = typeof t.notes === 'string' ? t.notes : '';
      return {
        id: t.id as string,
        kiosk_id: t.kiosk_id as string,
        task_date: t.task_date as string,
        current_score: t.current_score as number,
        score_before: t.score_before as number | undefined,
        gross_revenue: t.gross_revenue as number | undefined,
        dividend_rate_snapshot: t.dividend_rate_snapshot as number | undefined,
        dividend_amount: t.dividend_amount as number | undefined,
        dividend_method: t.dividend_method as 'cash' | 'retained' | undefined,
        exchange_amount: t.exchange_amount as number | undefined,
        expense_amount: t.expense_amount as number | undefined,
        expense_note: t.expense_note as string | undefined,
        settlement_status: t.settlement_status as 'pending' | 'settled' | undefined,
        // Prefer server photo_urls/notes; fall back to local if server is empty (upload may still be pending)
        photo_urls: serverPhotos.length > 0 ? serverPhotos : (local?.photo_urls ?? []),
        notes: serverNotes || (local?.notes ?? ''),
        sync_status: 'synced' as const,
        created_at: t.created_at as string,
      };
    });
    await db.tasks.bulkPut(rows);
  }
}

async function _pullReconciliations(userId: string): Promise<void> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const { data, error } = await supabase
    .from('daily_driver_reconciliations')
    .select(
      'id, driver_id, reconciliation_date, total_kiosks_visited, total_gross_revenue, total_coins_collected, total_coins_exchanged, total_cash_from_exchange, total_dividend_cash, total_dividend_retained, total_expense_amount, opening_coin_balance, opening_cash_balance, theoretical_coin_balance, theoretical_cash_balance, actual_coin_balance, actual_cash_balance, coin_variance, cash_variance, notes, status, confirmed_by, confirmed_at, created_at',
    )
    .eq('driver_id', userId)
    .eq('reconciliation_date', today);

  if (error) {
    console.error('[sync] pullReconciliations error:', error.message);
    return;
  }

  if (data && data.length > 0) {
    const rows = data.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      driver_id: r.driver_id as string,
      reconciliation_date: r.reconciliation_date as string,
      total_kiosks_visited: r.total_kiosks_visited as number,
      total_gross_revenue: r.total_gross_revenue as number,
      total_coins_collected: r.total_coins_collected as number,
      total_coins_exchanged: r.total_coins_exchanged as number,
      total_cash_from_exchange: r.total_cash_from_exchange as number,
      total_dividend_cash: r.total_dividend_cash as number,
      total_dividend_retained: r.total_dividend_retained as number,
      total_expense_amount: r.total_expense_amount as number,
      opening_coin_balance: r.opening_coin_balance as number,
      opening_cash_balance: r.opening_cash_balance as number,
      theoretical_coin_balance: r.theoretical_coin_balance as number,
      theoretical_cash_balance: r.theoretical_cash_balance as number,
      actual_coin_balance: r.actual_coin_balance as number,
      actual_cash_balance: r.actual_cash_balance as number,
      coin_variance: r.coin_variance as number,
      cash_variance: r.cash_variance as number,
      notes: (r.notes as string | null) ?? undefined,
      status: r.status as 'submitted' | 'confirmed',
      confirmed_by: (r.confirmed_by as string | null) ?? undefined,
      confirmed_at: (r.confirmed_at as string | null) ?? undefined,
      created_at: r.created_at as string,
    }));
    await db.reconciliations.bulkPut(rows);
  }
}

async function _pullScoreResetRequests(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('score_reset_requests')
    .select('id, kiosk_id, current_score, requested_new_score, reason, status, rejection_reason, reviewed_at, created_at')
    .eq('driver_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[sync] pullScoreResetRequests error:', error.message);
    return;
  }

  if (!data) return;

  if (data.length === 0) {
    await db.score_reset_requests.where('sync_status').equals('synced').delete();
    return;
  }

  const rows = data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    kiosk_id: r.kiosk_id as string,
    current_score: r.current_score as number,
    requested_new_score: r.requested_new_score as number,
    reason: r.reason as string,
    status: r.status as 'pending' | 'approved' | 'rejected',
    rejection_reason: (r.rejection_reason as string | null) ?? undefined,
    reviewed_at: (r.reviewed_at as string | null) ?? undefined,
    sync_status: 'synced' as const,
    created_at: r.created_at as string,
  }));

  await db.score_reset_requests.bulkPut(rows);

  const remoteIdSet = new Set(rows.map(r => r.id));
  const localSyncedIds: string[] = (await db.score_reset_requests
    .where('sync_status').equals('synced').primaryKeys()) as string[];
  const staleIds = localSyncedIds.filter(id => !remoteIdSet.has(id));
  if (staleIds.length > 0) {
    await db.score_reset_requests.bulkDelete(staleIds);
  }
}

async function _pullOnboardingRecords(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('kiosk_onboarding_records')
    .select('id, kiosk_id, onboarding_type, photo_urls, notes, status, reviewed_at, created_at')
    .eq('driver_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[sync] pullOnboardingRecords error:', error.message);
    return;
  }

  if (!data) return;

  if (data.length === 0) {
    await db.kiosk_onboarding_records.where('sync_status').equals('synced').delete();
    return;
  }

  const rows = data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    kiosk_id: r.kiosk_id as string,
    onboarding_type: r.onboarding_type as OnboardingType,
    photo_urls: (r.photo_urls as string[]) ?? [],
    notes: (r.notes as string) ?? '',
    status: r.status as 'pending' | 'approved' | 'rejected',
    reviewed_at: (r.reviewed_at as string | null) ?? undefined,
    sync_status: 'synced' as const,
    created_at: r.created_at as string,
  }));

  await db.kiosk_onboarding_records.bulkPut(rows);

  const remoteIdSet = new Set(rows.map(r => r.id));
  const localSyncedIds: string[] = (await db.kiosk_onboarding_records
    .where('sync_status').equals('synced').primaryKeys()) as string[];
  const staleIds = localSyncedIds.filter(id => !remoteIdSet.has(id));
  if (staleIds.length > 0) {
    await db.kiosk_onboarding_records.bulkDelete(staleIds);
  }
}

async function _pullDriverProfile(): Promise<void> {
  const { data, error } = await supabase.rpc('read_driver_balances');

  if (error) {
    console.error('[sync] pullDriverProfile error:', error.message);
    return;
  }

  if (!data) return;

  const raw = Array.isArray(data) ? data[0] : data;
  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof (raw as Record<string, unknown>).coin_balance !== 'number' ||
    typeof (raw as Record<string, unknown>).cash_balance !== 'number'
  ) {
    console.error('[sync] pullDriverProfile: unexpected response shape', raw);
    return;
  }

  const row = raw as { coin_balance: number; cash_balance: number };
  await db.driver_profile.put({
    id: 'me',
    coin_balance: row.coin_balance,
    cash_balance: row.cash_balance,
    fetched_at: new Date().toISOString(),
  });
}

// ---- Public API (each fetches its own user for standalone use) ----

/**
 * Pull kiosks assigned to the current driver from Supabase into local DB.
 * Joins merchants to denormalise merchant_name / merchant_contact for
 * offline display.
 */
export async function pullKiosks(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await _pullKiosks(user.id);
}

/**
 * Pull today's tasks for the current driver from Supabase into local DB.
 * Uses Africa/Dar_es_Salaam timezone to determine "today".
 * Fetches photo_urls and notes from server; falls back to local if server is empty.
 */
export async function pullTasks(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await _pullTasks(user.id);
}

/**
 * Pull today's reconciliation for the current driver from Supabase into local DB.
 * Uses Africa/Dar_es_Salaam timezone to determine "today".
 */
export async function pullReconciliations(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await _pullReconciliations(user.id);
}

/**
 * Pull score reset requests for the current driver from Supabase into local DB.
 */
export async function pullScoreResetRequests(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await _pullScoreResetRequests(user.id);
}

/**
 * Pull kiosk onboarding records for the current driver from Supabase into local DB.
 */
export async function pullOnboardingRecords(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await _pullOnboardingRecords(user.id);
}

/**
 * Process the local sync queue — push pending inserts / updates / deletes
 * to Supabase.
 *
 * Uses a module-level boolean lock to avoid running concurrently.
 */
export async function processQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const items = await db.sync_queue
      .where('retry_count')
      .below(MAX_RETRIES)
      .toArray();

    for (const item of items) {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(item.payload) as Record<string, unknown>;
      } catch {
        // Corrupt payload — skip
        continue;
      }

      try {
        let error: { message: string } | null = null;

        if (item.operation === 'insert') {
          const result = await supabase
            .from(item.table_name)
            .insert({ ...payload, driver_id: user.id });
          if (result.error) {
            // Duplicate key means a previous attempt already succeeded — treat as success
            error = result.error.code === '23505' ? null : result.error;
          }
        } else if (item.operation === 'update') {
          const result = await supabase
            .from(item.table_name)
            .update(payload)
            .eq('id', item.record_id);
          error = result.error;
        } else if (item.operation === 'delete') {
          const result = await supabase
            .from(item.table_name)
            .delete()
            .eq('id', item.record_id);
          error = result.error;
        }

        if (error) {
          throw new Error(error.message);
        }

        // Mark synced in the local domain table
        await markSynced(item.table_name, item.record_id);

        // Remove from queue
        if (item.id !== undefined) {
          await db.sync_queue.delete(item.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const newRetry = item.retry_count + 1;
        if (item.id !== undefined) {
          await db.sync_queue.update(item.id, {
            retry_count: newRetry,
            last_error: msg,
          });
        }

        if (newRetry >= MAX_RETRIES) {
          await markFailed(item.table_name, item.record_id);
        }
      }
    }
  } finally {
    processingQueue = false;
  }
}

// ---- helpers ----

async function markSynced(
  tableName: string,
  recordId: string,
): Promise<void> {
  switch (tableName) {
    case 'tasks':
      await db.tasks.update(recordId, { sync_status: 'synced' });
      break;
    case 'score_reset_requests':
      await db.score_reset_requests.update(recordId, {
        sync_status: 'synced',
      });
      break;
    case 'kiosk_onboarding_records':
      await db.kiosk_onboarding_records.update(recordId, {
        sync_status: 'synced',
      });
      break;
  }
}

async function markFailed(
  tableName: string,
  recordId: string,
): Promise<void> {
  switch (tableName) {
    case 'tasks':
      await db.tasks.update(recordId, { sync_status: 'failed' });
      break;
    case 'score_reset_requests':
      await db.score_reset_requests.update(recordId, {
        sync_status: 'failed',
      });
      break;
    case 'kiosk_onboarding_records':
      await db.kiosk_onboarding_records.update(recordId, {
        sync_status: 'failed',
      });
      break;
  }
}

/**
 * Full sync cycle: pull remote data (using a single auth check), then push local queue.
 * Calling getUser() once here avoids 5 separate auth round-trips.
 */
export async function startSync(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await _pullKiosks(user.id);
    await _pullTasks(user.id);
    await _pullReconciliations(user.id);
    await _pullScoreResetRequests(user.id);
    await _pullOnboardingRecords(user.id);
    await _pullDriverProfile();
    await retryPendingUploads();
    await processQueue();
  } catch (err) {
    console.error('[sync] startSync error:', err);
  }
}
