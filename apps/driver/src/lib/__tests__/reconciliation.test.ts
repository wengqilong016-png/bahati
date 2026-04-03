import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mock functions so vi.mock factories can reference them ──────────
const { mockRpc, mockReconciliationsPut } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockReconciliationsPut: vi.fn(),
}));

// ── Mock supabase BEFORE importing submitDailyReconciliation ───────────────
vi.mock('../supabase', () => ({
  supabase: { rpc: mockRpc },
}));

// ── Mock Dexie db ──────────────────────────────────────────────────────────
vi.mock('../db', () => ({
  db: {
    reconciliations: { put: mockReconciliationsPut },
  },
}));

import { submitDailyReconciliation } from '../reconciliation';

const DRIVER_ID = 'driver-001';
const DATE = '2026-04-03';

describe('submitDailyReconciliation', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockReconciliationsPut.mockReset();
  });

  // ── Input validation ─────────────────────────────────────────────────────

  it('throws when p_actual_coin_balance is negative', async () => {
    await expect(
      submitDailyReconciliation({
        p_driver_id: DRIVER_ID,
        p_date: DATE,
        p_actual_coin_balance: -1,
        p_actual_cash_balance: 0,
      }),
    ).rejects.toThrow('硬币余额不能为负数');
  });

  it('throws when p_actual_cash_balance is negative', async () => {
    await expect(
      submitDailyReconciliation({
        p_driver_id: DRIVER_ID,
        p_date: DATE,
        p_actual_coin_balance: 0,
        p_actual_cash_balance: -100,
      }),
    ).rejects.toThrow('现金余额不能为负数');
  });

  it('does not call RPC when validation fails', async () => {
    await expect(
      submitDailyReconciliation({
        p_driver_id: DRIVER_ID,
        p_date: DATE,
        p_actual_coin_balance: -1,
        p_actual_cash_balance: 0,
      }),
    ).rejects.toThrow();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // ── RPC call ─────────────────────────────────────────────────────────────

  it('calls submit_daily_reconciliation RPC with correct params', async () => {
    mockRpc.mockResolvedValue({ data: 'rec-id-123', error: null });
    mockReconciliationsPut.mockResolvedValue(undefined);

    await submitDailyReconciliation({
      p_driver_id: DRIVER_ID,
      p_date: DATE,
      p_actual_coin_balance: 5000,
      p_actual_cash_balance: 3000,
      p_notes: '正常',
    });

    expect(mockRpc).toHaveBeenCalledWith('submit_daily_reconciliation', {
      p_driver_id: DRIVER_ID,
      p_date: DATE,
      p_actual_coin_balance: 5000,
      p_actual_cash_balance: 3000,
      p_notes: '正常',
    });
  });

  it('passes null for optional fields when omitted', async () => {
    mockRpc.mockResolvedValue({ data: 'rec-id-456', error: null });
    mockReconciliationsPut.mockResolvedValue(undefined);

    await submitDailyReconciliation({
      p_driver_id: DRIVER_ID,
      p_date: DATE,
      p_actual_coin_balance: 0,
      p_actual_cash_balance: 0,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'submit_daily_reconciliation',
      expect.objectContaining({
        p_driver_id: DRIVER_ID,
        p_notes: null,
      }),
    );
  });

  it('passes null for p_driver_id when not provided in params', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockReconciliationsPut.mockResolvedValue(undefined);

    // When p_driver_id is omitted, the RPC call uses null AND later throws missing driver_id
    await expect(
      submitDailyReconciliation({
        p_date: DATE,
        p_actual_coin_balance: 0,
        p_actual_cash_balance: 0,
      }),
    ).rejects.toThrow('缺少司机ID');

    expect(mockRpc).toHaveBeenCalledWith(
      'submit_daily_reconciliation',
      expect.objectContaining({ p_driver_id: null }),
    );
  });

  // ── RPC error handling ───────────────────────────────────────────────────

  it('throws with server error message when RPC returns error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: '日结已提交' } });

    await expect(
      submitDailyReconciliation({
        p_driver_id: DRIVER_ID,
        p_date: DATE,
        p_actual_coin_balance: 0,
        p_actual_cash_balance: 0,
      }),
    ).rejects.toThrow('日结已提交');
  });

  it('throws fallback message when RPC error has no message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: {} });

    await expect(
      submitDailyReconciliation({
        p_driver_id: DRIVER_ID,
        p_date: DATE,
        p_actual_coin_balance: 0,
        p_actual_cash_balance: 0,
      }),
    ).rejects.toThrow('日结提交失败，请重试。');
  });

  // ── Local persistence ─────────────────────────────────────────────────────

  it('stores reconciliation locally using RPC-returned ID on success', async () => {
    mockRpc.mockResolvedValue({ data: 'server-rec-id', error: null });
    mockReconciliationsPut.mockResolvedValue(undefined);

    await submitDailyReconciliation({
      p_driver_id: DRIVER_ID,
      p_date: DATE,
      p_actual_coin_balance: 1000,
      p_actual_cash_balance: 2000,
    });

    expect(mockReconciliationsPut).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'server-rec-id',
        driver_id: DRIVER_ID,
        reconciliation_date: DATE,
        actual_coin_balance: 1000,
        actual_cash_balance: 2000,
        status: 'submitted',
      }),
    );
  });

  it('stores reconciliation locally using a UUID when RPC returns null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockReconciliationsPut.mockResolvedValue(undefined);

    await submitDailyReconciliation({
      p_driver_id: DRIVER_ID,
      p_date: DATE,
      p_actual_coin_balance: 0,
      p_actual_cash_balance: 0,
    });

    expect(mockReconciliationsPut).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        ),
        driver_id: DRIVER_ID,
        status: 'submitted',
      }),
    );
  });

  it('persists notes field in local record', async () => {
    mockRpc.mockResolvedValue({ data: 'rec-id', error: null });
    mockReconciliationsPut.mockResolvedValue(undefined);

    await submitDailyReconciliation({
      p_driver_id: DRIVER_ID,
      p_date: DATE,
      p_actual_coin_balance: 0,
      p_actual_cash_balance: 0,
      p_notes: '备注内容',
    });

    expect(mockReconciliationsPut).toHaveBeenCalledWith(
      expect.objectContaining({ notes: '备注内容' }),
    );
  });

  // ── Zero balances ─────────────────────────────────────────────────────────

  it('accepts zero coin and cash balances', async () => {
    mockRpc.mockResolvedValue({ data: 'rec-id', error: null });
    mockReconciliationsPut.mockResolvedValue(undefined);

    await expect(
      submitDailyReconciliation({
        p_driver_id: DRIVER_ID,
        p_date: DATE,
        p_actual_coin_balance: 0,
        p_actual_cash_balance: 0,
      }),
    ).resolves.toBeUndefined();
  });
});
