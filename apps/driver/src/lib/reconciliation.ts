// ============================================================
// Phase 2 — Daily reconciliation via Supabase RPC
// ============================================================

import { supabase } from './supabase';
import { db } from './db';

export interface ReconciliationParams {
  /** The date to reconcile (YYYY-MM-DD) */
  p_date: string;
  /** Actual coin balance counted by the driver */
  p_actual_coin_balance: number;
  /** Actual cash balance counted by the driver */
  p_actual_cash_balance: number;
  /** Optional notes */
  p_notes?: string;
  /**
   * Target driver UUID. Omit for the currently-authenticated driver.
   * Only a Boss user may specify a different driver.
   */
  p_driver_id?: string;
}

/**
 * Call the `submit_daily_reconciliation` RPC and, on success, store the
 * reconciliation record locally in Dexie so the UI reflects submitted state.
 *
 * The RPC computes all totals internally from task_settlements and
 * driver_fund_ledger. The driver only supplies the two actual balance counts.
 *
 * Throws a user-friendly error string on failure so callers can display it.
 */
export async function submitDailyReconciliation(
  params: ReconciliationParams,
): Promise<void> {
  const {
    p_date,
    p_actual_coin_balance,
    p_actual_cash_balance,
    p_notes,
    p_driver_id,
  } = params;

  if (p_actual_coin_balance < 0) throw new Error('硬币余额不能为负数');
  if (p_actual_cash_balance < 0) throw new Error('现金余额不能为负数');

  const rpcArgs: Record<string, unknown> = {
    p_date,
    p_actual_coin_balance,
    p_actual_cash_balance,
    p_notes: p_notes ?? null,
  };
  if (p_driver_id) {
    rpcArgs['p_driver_id'] = p_driver_id;
  }

  const { data, error } = await supabase.rpc(
    'submit_daily_reconciliation',
    rpcArgs,
  );

  if (error) {
    throw new Error(error.message || '日结提交失败，请重试');
  }

  // The RPC returns a UUID directly (not an object).
  const reconciliationId = data as string;

  // Determine the driver id to persist locally
  const { data: userData } = await supabase.auth.getUser();
  const driverId = p_driver_id ?? userData.user?.id;
  if (!driverId) {
    // RPC already succeeded; the server record is safe. We just can't cache locally.
    return;
  }

  // Store a minimal local record so the UI can show submitted state offline.
  // The zero values for server-computed fields (theoretical balances, totals, etc.)
  // are intentional placeholders — they will be replaced with authoritative values
  // on the next pullReconciliations() sync call.
  await db.reconciliations.put({
    id: reconciliationId,
    driver_id: driverId,
    reconciliation_date: p_date,
    opening_coin_balance: 0,
    opening_cash_balance: 0,
    theoretical_coin_balance: 0,
    theoretical_cash_balance: 0,
    actual_coin_balance: p_actual_coin_balance,
    actual_cash_balance: p_actual_cash_balance,
    coin_variance: 0,
    cash_variance: 0,
    total_kiosks_visited: 0,
    total_gross_revenue: 0,
    total_coins_collected: 0,
    total_coins_exchanged: 0,
    total_cash_from_exchange: 0,
    total_dividend_cash: 0,
    total_dividend_retained: 0,
    total_expense_amount: 0,
    notes: p_notes,
    status: 'submitted',
    created_at: new Date().toISOString(),
  });
}
