import { supabase } from './supabase';
import { db } from './db';

const MAX_RETRIES = 3;

export async function pullMachines(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('machines')
    .select('id, serial_number, location_name, merchant_name, status, last_recorded_score')
    .eq('assigned_driver_id', user.id);

  if (error) {
    console.error('[sync] pullMachines error:', error.message);
    return;
  }

  if (data && data.length > 0) {
    await db.machines.bulkPut(data);
  }
}

export async function processQueue(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
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
      continue;
    }

    try {
      let error: { message: string } | null = null;

      if (item.operation === 'insert') {
        const result = await supabase
          .from(item.table_name)
          .insert({ ...payload, driver_id: user.id });
        error = result.error;
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

      // Mark synced in local table
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
}

async function markSynced(tableName: string, recordId: string): Promise<void> {
  switch (tableName) {
    case 'daily_tasks':
      await db.daily_tasks.update(recordId, { sync_status: 'synced' });
      break;
    case 'score_reset_requests':
      await db.score_reset_requests.update(recordId, { sync_status: 'synced' });
      break;
    case 'daily_settlements':
      await db.settlements.update(recordId, { sync_status: 'synced' });
      break;
    case 'machine_onboardings':
      await db.machine_onboardings.update(recordId, { sync_status: 'synced' });
      break;
  }
}

async function markFailed(tableName: string, recordId: string): Promise<void> {
  switch (tableName) {
    case 'daily_tasks':
      await db.daily_tasks.update(recordId, { sync_status: 'failed' });
      break;
    case 'score_reset_requests':
      await db.score_reset_requests.update(recordId, { sync_status: 'failed' });
      break;
    case 'daily_settlements':
      await db.settlements.update(recordId, { sync_status: 'failed' });
      break;
    case 'machine_onboardings':
      await db.machine_onboardings.update(recordId, { sync_status: 'failed' });
      break;
  }
}

export async function startSync(): Promise<void> {
  try {
    await pullMachines();
    await processQueue();
  } catch (err) {
    console.error('[sync] startSync error:', err);
  }
}
