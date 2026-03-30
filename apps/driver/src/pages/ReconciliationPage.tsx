import { useState, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db';
import { submitDailyReconciliation } from '../lib/reconciliation';
import { pullReconciliations } from '../lib/sync';
import { supabase } from '../lib/supabase';

// ---- helpers ----

function todayNairobi(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// ---- Main page ----

export function ReconciliationPage() {
  const today = todayNairobi();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cashInHand, setCashInHand] = useState('0');
  const [notes, setNotes] = useState('');

  const tasks = useLiveQuery(
    () => db.tasks.where('task_date').equals(today).toArray(),
    [today, refreshKey],
  );

  const todayReconciliation = useLiveQuery(
    () =>
      db.reconciliations
        .where('reconciliation_date')
        .equals(today)
        .first(),
    [today, refreshKey],
  );

  const allTasks = tasks ?? [];
  const settledTasks = allTasks.filter(t => t.settlement_status === 'settled');
  const pendingTasks = allTasks.filter(t => t.settlement_status !== 'settled');

  const totalGrossRevenue = settledTasks.reduce(
    (sum, t) =>
      sum +
      (t.gross_revenue ??
        (t.score_before !== undefined
          ? (t.current_score - t.score_before) * 200
          : 0)),
    0,
  );
  const totalDividend = settledTasks.reduce(
    (sum, t) => sum + (t.dividend_amount ?? 0),
    0,
  );
  const totalExchange = settledTasks.reduce(
    (sum, t) => sum + (t.exchange_amount ?? 0),
    0,
  );
  const totalExpense = settledTasks.reduce(
    (sum, t) => sum + (t.expense_amount ?? 0),
    0,
  );

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

    const cashAmt = parseFloat(cashInHand) || 0;
    if (cashAmt < 0) {
      setError('手持现金不能为负数');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('用户未登录，请重新登录');
      return;
    }

    setSubmitting(true);
    try {
      await submitDailyReconciliation({
        p_driver_id: user.id,
        p_reconciliation_date: today,
        p_total_gross_revenue: totalGrossRevenue,
        p_total_dividend: totalDividend,
        p_total_exchange: totalExchange,
        p_total_expense: totalExpense,
        p_cash_in_hand: cashAmt,
        p_notes: notes.trim() || undefined,
      });
      setSuccess(true);
      setRefreshKey(k => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '日结提交失败，请重试';
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

  // ---- Already reconciled today ----
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
            <span style={{ fontWeight: 700, fontSize: 16 }}>日结详情</span>
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
            <div>总营业额: ¥{r.total_gross_revenue.toLocaleString()}</div>
            <div>总分红: ¥{r.total_dividend.toLocaleString()}</div>
            <div>总换币: ¥{r.total_exchange.toLocaleString()}</div>
            <div>总支出: ¥{r.total_expense.toLocaleString()}</div>
            <div>手持现金: ¥{r.cash_in_hand.toLocaleString()}</div>
            {r.notes && <div>备注: {r.notes}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ---- Reconciliation form ----
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

      {/* Today's task summary */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#555', fontWeight: 600 }}>
          今日任务汇总
        </h3>
        <div style={{ fontSize: 14, color: '#444', lineHeight: 2 }}>
          <div>
            任务完成: {settledTasks.length} / {allTasks.length}
          </div>
          <div>总营业额: ¥{totalGrossRevenue.toLocaleString()}</div>
          <div>总分红: ¥{totalDividend.toLocaleString()}</div>
          <div>总换币: ¥{totalExchange.toLocaleString()}</div>
          <div>总支出: ¥{totalExpense.toLocaleString()}</div>
        </div>
      </div>

      {/* Pending tasks warning */}
      {pendingTasks.length > 0 && (
        <div
          style={{
            background: '#fff9c4',
            border: '1px solid #ffe082',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 14,
            color: '#f57f17',
          }}
        >
          ⚠️ 还有 {pendingTasks.length} 个未结算的任务，请先完成所有任务结算
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => navigate('/settlement')}
              style={{
                background: 'none',
                border: '1px solid #f57f17',
                color: '#f57f17',
                borderRadius: 6,
                padding: '4px 12px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              前往结算
            </button>
          </div>
        </div>
      )}

      {/* Success message */}
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
          ✅ 日结已成功提交！
        </div>
      )}

      {/* Error message */}
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
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              float: 'right',
              background: 'none',
              border: 'none',
              color: '#c62828',
              cursor: 'pointer',
              padding: 0,
              fontSize: 13,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Reconciliation form */}
      <form onSubmit={handleSubmit}>
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

          {/* Read-only calculated fields */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>总营业额</label>
            <input
              readOnly
              value={`¥${totalGrossRevenue.toLocaleString()}`}
              style={readonlyStyle}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>总分红</label>
            <input
              readOnly
              value={`¥${totalDividend.toLocaleString()}`}
              style={readonlyStyle}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>总换币</label>
            <input
              readOnly
              value={`¥${totalExchange.toLocaleString()}`}
              style={readonlyStyle}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>总支出</label>
            <input
              readOnly
              value={`¥${totalExpense.toLocaleString()}`}
              style={readonlyStyle}
            />
          </div>

          {/* Cash in hand */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>手持现金</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cashInHand}
              onChange={e => setCashInHand(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>
              备注{' '}
              <span style={{ fontWeight: 400, color: '#888' }}>(可选)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="请输入备注..."
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || pendingTasks.length > 0}
            style={{
              width: '100%',
              padding: 14,
              background:
                submitting || pendingTasks.length > 0 ? '#ccc' : '#0066CC',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor:
                submitting || pendingTasks.length > 0
                  ? 'not-allowed'
                  : 'pointer',
              opacity: submitting || pendingTasks.length > 0 ? 0.7 : 1,
            }}
          >
            {submitting ? '提交中...' : '提交日结'}
          </button>
        </div>
      </form>
    </div>
  );
}
