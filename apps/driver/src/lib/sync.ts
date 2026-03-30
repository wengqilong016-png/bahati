import { db } from './db';
import { supabase } from './supabase';
import type { SyncQueueItem } from './types';

const MAX_ATTEMPTS = 5;

/**
 * Process the sync queue: try to push each pending item to Supabase.
 *
 * Order: oldest first (FIFO).
 * On success → mark local record as 'synced', remove from queue.
 * On failure → increment attempts, record error, leave in queue for retry.
 * Items exceeding MAX_ATTEMPTS are marked 'failed' and removed from queue.
 */
export async function processQueue(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const items = await db.sync_queue.orderBy('created_at').toArray();

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await pushToSupabase(item);

      // Mark local record as synced
      await markSynced(item);

      // Remove from queue
      await db.sync_queue.delete(item.id!);
      synced++;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const newAttempts = item.attempts + 1;

      if (newAttempts >= MAX_ATTEMPTS) {
        // Mark as permanently failed
        await markFailed(item);
        await db.sync_queue.delete(item.id!);
        failed++;
      } else {
        // Increment attempt counter
        await db.sync_queue.update(item.id!, {
          attempts: newAttempts,
          last_error: errorMsg,
        });
      }
    }
  }

  const remaining = await db.sync_queue.count();
  return { synced, failed, remaining };
}

/** Push a single queue item to the matching Supabase table. */
async function pushToSupabase(item: SyncQueueItem): Promise<void> {
  const payload = JSON.parse(item.payload);

  // Strip the local-only sync_status field before sending to Supabase
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sync_status: _, ...rest } = payload;

  const { error } = await supabase.from(item.table).upsert(rest);

  if (error) {
    throw new Error(error.message);
  }
}

/** Mark a local record as synced after successful upload. */
async function markSynced(item: SyncQueueItem): Promise<void> {
  switch (item.table) {
    case 'kiosk_onboarding_records':
      await db.onboarding_records.update(item.record_id, { sync_status: 'synced' });
      break;
    case 'tasks':
      await db.tasks.update(item.record_id, { sync_status: 'synced' });
      break;
    case 'score_reset_requests':
      await db.reset_requests.update(item.record_id, { sync_status: 'synced' });
      break;
  }
}

/** Mark a local record as failed after exhausting retries. */
async function markFailed(item: SyncQueueItem): Promise<void> {
  switch (item.table) {
    case 'kiosk_onboarding_records':
      await db.onboarding_records.update(item.record_id, { sync_status: 'failed' });
      break;
    case 'tasks':
      await db.tasks.update(item.record_id, { sync_status: 'failed' });
      break;
    case 'score_reset_requests':
      await db.reset_requests.update(item.record_id, { sync_status: 'failed' });
      break;
  }
}

/**
 * Start a background interval that processes the sync queue every N seconds.
 * Returns a cleanup function to stop the interval.
 */
export function startSyncInterval(intervalMs = 30_000): () => void {
  const id = setInterval(() => {
    processQueue().catch(console.error);
  }, intervalMs);

  // Run once immediately
  processQueue().catch(console.error);

  return () => clearInterval(id);
}
