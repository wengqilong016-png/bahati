import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mock functions so vi.mock factories can reference them ──────────
const { mockRpc, mockTasksUpdate } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockTasksUpdate: vi.fn(),
}));

// ── Mock supabase BEFORE importing settleTask ──────────────────────────────
vi.mock('../supabase', () => ({
  supabase: { rpc: mockRpc },
}));

// ── Mock Dexie db ──────────────────────────────────────────────────────────
vi.mock('../db', () => ({
  db: {
    tasks: { update: mockTasksUpdate },
  },
}));

import { settleTask } from '../settlement';

describe('settleTask', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockTasksUpdate.mockReset();
  });

  // ── Input validation ─────────────────────────────────────────────────────

  it('throws when exchangeAmount is negative', async () => {
    await expect(
      settleTask({
        taskId: 'task-1',
        dividendMethod: 'cash',
        exchangeAmount: -1,
        expenseAmount: 0,
      }),
    ).rejects.toThrow('换币金额不能为负数');
  });

  it('throws when expenseAmount is negative', async () => {
    await expect(
      settleTask({
        taskId: 'task-1',
        dividendMethod: 'cash',
        exchangeAmount: 0,
        expenseAmount: -500,
      }),
    ).rejects.toThrow('支出金额不能为负数');
  });

  it('does not call RPC when validation fails', async () => {
    await expect(
      settleTask({
        taskId: 'task-1',
        dividendMethod: 'cash',
        exchangeAmount: -1,
        expenseAmount: 0,
      }),
    ).rejects.toThrow();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // ── RPC call ─────────────────────────────────────────────────────────────

  it('calls record_task_settlement RPC with correct params', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockTasksUpdate.mockResolvedValue(undefined);

    await settleTask({
      taskId: 'task-abc',
      dividendMethod: 'retained',
      exchangeAmount: 5000,
      expenseAmount: 1000,
      expenseNote: '交通费',
    });

    expect(mockRpc).toHaveBeenCalledWith('record_task_settlement', {
      p_task_id: 'task-abc',
      p_dividend_method: 'retained',
      p_exchange_amount: 5000,
      p_expense_amount: 1000,
      p_expense_note: '交通费',
    });
  });

  it('uses null for expenseNote when not provided', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockTasksUpdate.mockResolvedValue(undefined);

    await settleTask({
      taskId: 'task-abc',
      dividendMethod: 'cash',
      exchangeAmount: 0,
      expenseAmount: 0,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'record_task_settlement',
      expect.objectContaining({ p_expense_note: null }),
    );
  });

  // ── RPC error handling ───────────────────────────────────────────────────

  it('throws with server error message when RPC returns error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: '任务不存在' } });

    await expect(
      settleTask({
        taskId: 'task-abc',
        dividendMethod: 'cash',
        exchangeAmount: 0,
        expenseAmount: 0,
      }),
    ).rejects.toThrow('任务不存在');
  });

  it('throws fallback message when RPC returns error without message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: {} });

    await expect(
      settleTask({
        taskId: 'task-abc',
        dividendMethod: 'cash',
        exchangeAmount: 0,
        expenseAmount: 0,
      }),
    ).rejects.toThrow('结算失败，请重试。');
  });

  // ── Optimistic local update ───────────────────────────────────────────────

  it('updates local Dexie record with settled status on success', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockTasksUpdate.mockResolvedValue(undefined);

    await settleTask({
      taskId: 'task-xyz',
      dividendMethod: 'cash',
      exchangeAmount: 3000,
      expenseAmount: 200,
      expenseNote: '备注',
    });

    expect(mockTasksUpdate).toHaveBeenCalledWith('task-xyz', {
      settlement_status: 'settled',
      dividend_method: 'cash',
      exchange_amount: 3000,
      expense_amount: 200,
      expense_note: '备注',
    });
  });

  it('does not throw when Dexie update fails after successful RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockTasksUpdate.mockRejectedValue(new Error('Dexie write error'));

    // Should NOT throw — server settlement succeeded, local update is best-effort
    await expect(
      settleTask({
        taskId: 'task-abc',
        dividendMethod: 'retained',
        exchangeAmount: 0,
        expenseAmount: 0,
      }),
    ).resolves.toBeUndefined();
  });

  // ── Zero-amount edge cases ───────────────────────────────────────────────

  it('accepts zero exchangeAmount and zero expenseAmount', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockTasksUpdate.mockResolvedValue(undefined);

    await expect(
      settleTask({
        taskId: 'task-zero',
        dividendMethod: 'cash',
        exchangeAmount: 0,
        expenseAmount: 0,
      }),
    ).resolves.toBeUndefined();
  });
});
