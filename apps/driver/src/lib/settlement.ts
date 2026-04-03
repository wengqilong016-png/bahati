// ============================================================
// Phase 3 — Task settlement via Supabase RPC
// ============================================================

import { supabase } from './supabase';
import { db } from './db';

export type DividendMethod = 'cash' | 'retained';

export interface SettleTaskParams {
  taskId: string;
  dividendMethod: DividendMethod;
  exchangeAmount: number;
  expenseAmount: number;
  expenseNote?: string;
}

/**
 * Call the `record_task_settlement` RPC and, on success, update the local
 * Dexie task record so the UI reflects the settled state immediately.
 *
 * Throws a user-friendly error string on failure so callers can display it.
 */
export async function settleTask(params: SettleTaskParams): Promise<void> {
  const { taskId, dividendMethod, exchangeAmount, expenseAmount, expenseNote } = params;

  if (exchangeAmount < 0) throw new Error('换币金额不能为负数');
  if (expenseAmount < 0) throw new Error('支出金额不能为负数');

  const { error } = await supabase.rpc('record_task_settlement', {
    p_task_id: taskId,
    p_dividend_method: dividendMethod,
    p_exchange_amount: exchangeAmount,
    p_expense_amount: expenseAmount,
    p_expense_note: expenseNote ?? null,
  });

  if (error) {
    // Surface the server-side error message to the UI
    throw new Error(error.message || '结算失败，请重试。');
  }

  // Optimistically update local Dexie record so the UI refreshes instantly
  try {
    await db.tasks.update(taskId, {
      settlement_status: 'settled',
      dividend_method: dividendMethod,
      exchange_amount: exchangeAmount,
      expense_amount: expenseAmount,
      expense_note: expenseNote,
    });
  } catch (dexieErr) {
    console.error('[settlement] Server settlement succeeded but local DB update failed:', dexieErr);
    // Don't throw — the settlement IS recorded server-side; next sync will fix local state
  }
}
