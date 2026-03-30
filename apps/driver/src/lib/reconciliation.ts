// ============================================================
// Phase 2 — Daily reconciliation via Supabase RPC
// ============================================================

import { supabase } from './supabase';
import { db } from './db';

export interface ReconciliationParams {
  p_driver_id: string;
  p_reconciliation_date: string;
  p_total_gross_revenue: number;
  p_total_dividend: number;
  p_total_exchange: number;
  p_total_expense: number;
  p_cash_in_hand: number;
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
    p_reconciliation_date,
    p_total_gross_revenue,
    p_total_dividend,
    p_total_exchange,
    p_total_expense,
    p_cash_in_hand,
    p_notes,
  } = params;

  if (p_total_gross_revenue < 0) throw new Error('总营业额不能为负数');
  if (p_total_dividend < 0) throw new Error('总分红不能为负数');
  if (p_total_exchange < 0) throw new Error('总换币金额不能为负数');
  if (p_total_expense < 0) throw new Error('总支出不能为负数');
  if (p_cash_in_hand < 0) throw new Error('手持现金不能为负数');

  const { data, error } = await supabase.rpc('submit_daily_reconciliation', {
    p_driver_id,
    p_reconciliation_date,
    p_total_gross_revenue,
    p_total_dividend,
    p_total_exchange,
    p_total_expense,
    p_cash_in_hand,
    p_notes: p_notes ?? null,
  });

  if (error) {
    throw new Error(error.message || '日结提交失败，请重试');
  }

  // Store locally so the UI can show submitted state offline
  const reconciliationId =
    (data as { id?: string } | null)?.id ?? crypto.randomUUID();

  await db.reconciliations.put({
    id: reconciliationId,
    driver_id: p_driver_id,
    reconciliation_date: p_reconciliation_date,
    total_gross_revenue: p_total_gross_revenue,
    total_dividend: p_total_dividend,
    total_exchange: p_total_exchange,
    total_expense: p_total_expense,
    cash_in_hand: p_cash_in_hand,
    notes: p_notes,
    status: 'submitted',
    created_at: new Date().toISOString(),
  });
}
