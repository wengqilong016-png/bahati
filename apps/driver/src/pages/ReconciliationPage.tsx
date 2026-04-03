import { useState, useMemo, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { submitDailyReconciliation } from '../lib/reconciliation';
import { pullReconciliations } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { LocalTask, LocalKiosk } from '../lib/types';

function todayDarEsSalaam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function ReconciliationPage() {
  const today = todayDarEsSalaam();
  const isOnline = useOnlineStatus();
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [actualCoinBalance, setActualCoinBalance] = useState('0');
  const [actualCashBalance, setActualCashBalance] = useState('0');
  const [notes, setNotes] = useState('');

  const todayReconciliation = useLiveQuery(
    () =>
      db.reconciliations
        .where('reconciliation_date')
        .equals(today)
        .first(),
    [today, refreshKey],
  );

  // Today's settled tasks to display context for reconciliation
  const todayTasks = useLiveQuery(
    () => db.tasks.where('task_date').equals(today).toArray(),
    [today, refreshKey],
  );
  const kiosks = useLiveQuery(() => db.kiosks.toArray(), []);
  const kioskMap = useMemo(
    () => new Map<string, LocalKiosk>((kiosks ?? []).map(k => [k.id, k])),
    [kiosks],
  );
  const settledTasks = (todayTasks ?? []).filter((t: LocalTask) => t.settlement_status === 'settled');
  const pendingTasks = (todayTasks ?? []).filter((t: LocalTask) => t.settlement_status !== 'settled');

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      await pullReconciliations();
    } finally {
      setSyncing(false);
      setRefreshKey(k => k + 1);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const coinAmt = parseFloat(actualCoinBalance) || 0;
    const cashAmt = parseFloat(actualCashBalance) || 0;

    if (coinAmt < 0) {
      setError('硬币余额不能为负数');
      return;
    }

    if (cashAmt < 0) {
      setError('现金余额不能为负数');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('未登录，请重新登录。');
      return;
    }

    setSubmitting(true);
    try {
      await submitDailyReconciliation({
        p_driver_id: user.id,
        p_date: today,
        p_actual_coin_balance: coinAmt,
        p_actual_cash_balance: cashAmt,
        p_notes: notes.trim() || undefined,
      });
      await pullReconciliations();
      setSuccess(true);
      setRefreshKey(k => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '日结提交失败，请重试。';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 15,
    boxSizing: 'border-box',
  };

  const readonlyStyle: React.CSSProperties = {
    ...inputStyle,
    background: '#f5f5f5',
    color: '#555',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontWeight: 600,
    fontSize: 13,
    color: '#333',
  };

  if (todayReconciliation) {
    const r = todayReconciliation;
    const isConfirmed = r.status === 'confirmed';

    return (
      <div style={{ padding: '16px 16px 80px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, color: '#0066CC' }}>今日日结</h2>
          <button
            onClick={handleRefresh}
            disabled={syncing}
            style={{
              background: 'none',
              border: '1px solid #0066CC',
              color: '#0066CC',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 13,
              cursor: syncing ? 'not-allowed' : 'pointer',
              opacity: syncing ? 0.6 : 1,
            }}
          >
            {syncing ? '同步中...' : '🔄 刷新'}
          </button>
        </div>

        <div
          style={{
            background: isConfirmed ? '#e6f4ea' : '#e3f2fd',
            border: `1px solid ${isConfirmed ? '#a5d6a7' : '#90caf9'}`,
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 16 }}>日结汇总</span>
            <span
              style={{
                background: isConfirmed ? '#1e7e34' : '#1565c0',
                color: '#fff',
                borderRadius: 12,
                padding: '3px 12px',
                fontSize: 13,
              }}
            >
              {isConfirmed ? '✅ 已确认' : '✅ 已提交'}
            </span>
          </div>

          <div style={{ fontSize: 14, color: '#444', lineHeight: 2 }}>
            <div>日期: {r.reconciliation_date}</div>
            <div>实际硬币余额: TZS {r.actual_coin_balance.toLocaleString()}</div>
            <div>实际现金余额: TZS {r.actual_cash_balance.toLocaleString()}</div>
            <div>预期硬币余额: TZS {r.theoretical_coin_balance.toLocaleString()}</div>
            <div>预期现金余额: TZS {r.theoretical_cash_balance.toLocaleString()}</div>
            <div>硬币差异: TZS {r.coin_variance.toLocaleString()}</div>
            <div>现金差异: TZS {r.cash_variance.toLocaleString()}</div>
            <div>今日总支出: TZS {r.total_expense_amount.toLocaleString()}</div>
            {r.notes && <div>备注: {r.notes}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, color: '#0066CC' }}>今日日结</h2>
        <button
          onClick={handleRefresh}
          disabled={syncing}
          style={{
            background: 'none',
            border: '1px solid #0066CC',
            color: '#0066CC',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 13,
            cursor: syncing ? 'not-allowed' : 'pointer',
            opacity: syncing ? 0.6 : 1,
          }}
        >
          {syncing ? '同步中...' : '🔄 刷新'}
        </button>
      </div>

      {/* Today's settlement summary — shows context before reconciliation */}
      {settledTasks.length > 0 && (
        <div
          style={{
            background: '#f0f7ff',
            border: '1px solid #bbdefb',
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#0066CC', fontWeight: 600 }}>
            今日已结算任务 ({settledTasks.length})
          </h3>
          {settledTasks.map((t: LocalTask) => {
            const k = kioskMap.get(t.kiosk_id);
            const grossRevenue = t.gross_revenue ?? (t.score_before !== undefined
              ? (t.current_score - t.score_before) * 200
              : undefined);
            return (
              <div key={t.id} style={{ background: '#fff', borderRadius: 6, padding: 10, marginBottom: 6, border: '1px solid #e0e0e0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    {k?.serial_number ?? '—'} · {k?.merchant_name ?? '—'}
                  </span>
                  <span style={{ fontSize: 12, color: '#1e7e34', fontWeight: 600 }}>✅</span>
                </div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                  Score: {t.score_before ?? '—'} → {t.current_score}
                  {grossRevenue !== undefined && ` · Revenue: TZS ${grossRevenue.toLocaleString()}`}
                  {t.exchange_amount !== undefined && t.exchange_amount > 0 && ` · Exchange: TZS ${t.exchange_amount.toLocaleString()}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Warning if there are unsettled tasks */}
      {pendingTasks.length > 0 && (
        <div
          style={{
            background: '#fff3e0',
            border: '1px solid #ffe082',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
            color: '#e65100',
          }}
        >
          ⚠️ 今日还有 {pendingTasks.length} 个未结算任务，建议先完成所有结算再提交日结。
        </div>
      )}

      {!isOnline && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'center' }}>
          <span style={{ fontSize: 14, color: '#e65100' }}>⚠️ 当前离线，日结需要网络连接</span>
        </div>
      )}

      <div
        style={{
          background: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#555', fontWeight: 600 }}>
          日结表单
        </h3>

        {success && (
          <div
            style={{
              background: '#e6f4ea',
              border: '1px solid #a5d6a7',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              fontSize: 14,
              color: '#1e7e34',
            }}
          >
            ✅ 日结提交成功！
          </div>
        )}

        {error && (
          <div
            style={{
              background: '#fce8e6',
              color: '#c62828',
              padding: 10,
              borderRadius: 6,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>提交日期</label>
            <input readOnly value={today} style={readonlyStyle} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>实际硬币余额 (TZS)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={actualCoinBalance}
              onChange={e => setActualCoinBalance(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>实际现金余额 (TZS)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={actualCashBalance}
              onChange={e => setActualCashBalance(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              备注 <span style={{ fontWeight: 400, color: '#888' }}>(可选)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="输入备注..."
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || pendingTasks.length > 0 || !isOnline}
            style={{
              width: '100%',
              padding: 14,
              background: (submitting || pendingTasks.length > 0 || !isOnline) ? '#ccc' : '#0066CC',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: (submitting || pendingTasks.length > 0 || !isOnline) ? 'not-allowed' : 'pointer',
              opacity: (submitting || pendingTasks.length > 0 || !isOnline) ? 0.7 : 1,
            }}
          >
            {submitting ? '提交中...' : !isOnline ? '离线无法提交' : pendingTasks.length > 0 ? `请先结算所有任务（还剩 ${pendingTasks.length} 个）` : '提交日结'}
          </button>
        </form>
      </div>
    </div>
  );
}
