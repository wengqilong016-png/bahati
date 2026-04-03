// ============================================================
// Phase 2 — Daily reconciliation via Supabase RPC
// ============================================================

import { supabase } from './supabase';
import { db } from './db';

export interface ReconciliationParams {
  p_driver_id?: string;
  p_date: string;
  p_actual_coin_balance: number;
  p_actual_cash_balance: number;
  p_notes?: string;
}

/**
 * Call the `submit_daily_reconciliation` RPC and, on success, store the
 * reconciliation record locally in Dexie so the UI reflects submitted state.
 *
 * Throws a user-friendly error string on failure so callers can display it.
 */
export async function submitDailyReconciliation(
  params: ReconciliationParams,
): Promise<void> {
  const {
    p_driver_id,
    p_date,
    p_actual_coin_balance,
    p_actual_cash_balance,
    p_notes,
  } = params;

  if (p_actual_coin_balance < 0) throw new Error('硬币余额不能为负数');
  if (p_actual_cash_balance < 0) throw new Error('现金余额不能为负数');

  const { data, error } = await supabase.rpc('submit_daily_reconciliation', {
    p_driver_id: p_driver_id ?? null,
    p_date,
    p_actual_coin_balance,
    p_actual_cash_balance,
    p_notes: p_notes ?? null,
  });

  if (error) {
    throw new Error(error.message || '日结提交失败，请重试。');
  }

  // Store locally so the UI can show submitted state offline
  const reconciliationId = (data as string | null) ?? crypto.randomUUID();

  if (!p_driver_id) {
    throw new Error('缺少司机ID，无法保存本地记录');
  }

  await db.reconciliations.put({
    id: reconciliationId,
    driver_id: p_driver_id,
    reconciliation_date: p_date,
    total_kiosks_visited: 0,
    total_gross_revenue: 0,
    total_coins_collected: 0,
    total_coins_exchanged: 0,
    total_cash_from_exchange: 0,
    total_dividend_cash: 0,
    total_dividend_retained: 0,
    total_expense_amount: 0,
    opening_coin_balance: 0,
    opening_cash_balance: 0,
    theoretical_coin_balance: 0,
    theoretical_cash_balance: 0,
    actual_coin_balance: p_actual_coin_balance,
    actual_cash_balance: p_actual_cash_balance,
    coin_variance: 0,
    cash_variance: 0,
    notes: p_notes,
    status: 'submitted',
    created_at: new Date().toISOString(),
  });
}
