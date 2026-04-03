import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db';
import { settleTask } from '../lib/settlement';
import { pullTasks } from '../lib/sync';
import { supabase } from '../lib/supabase';
import type { LocalTask, LocalKiosk } from '../lib/types';

type DividendMethod = 'cash' | 'retained';

function todayDarEsSalaam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function fmtTZS(n: number): string {
  return `TZS ${n.toLocaleString()}`;
}

// ---- Balance fetcher ----

interface DriverBalances {
  coin_balance: number;
  cash_balance: number;
}

interface BalanceState {
  balances: DriverBalances | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

function useDriverBalances(): BalanceState {
  const [balances, setBalances] = useState<DriverBalances | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState(0);

  const refresh = useCallback(() => setTrigger(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc('read_driver_balances');
        if (cancelled) return;
        if (rpcErr) {
          setError(rpcErr.message);
          return;
        }
        if (!data) {
          setError('未返回余额数据');
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setBalances({
            coin_balance: Number(row.coin_balance) || 0,
            cash_balance: Number(row.cash_balance) || 0,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载余额失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [trigger]);

  return { balances, error, loading, refresh };
}

// ---- Sub-components ----

function BalanceCard({ state }: { state: BalanceState }) {
  if (state.loading && !state.balances) {
    return (
      <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 14, marginBottom: 16, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#888' }}>加载余额中…</p>
      </div>
    );
  }
  if (state.error && !state.balances) {
    return (
      <div style={{ background: '#fce8e6', borderRadius: 8, padding: 14, marginBottom: 16, textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#c62828' }}>⚠️ {state.error}</p>
        <button
          type="button"
          onClick={state.refresh}
          style={{ background: '#c62828', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer' }}
        >
          重试
        </button>
      </div>
    );
  }
  if (!state.balances) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
      <div style={{ background: '#e3f2fd', borderRadius: 8, padding: 12, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 11, color: '#1565c0', fontWeight: 600 }}>🪙 硬币余额</p>
        <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#0d47a1' }}>{fmtTZS(state.balances.coin_balance)}</p>
      </div>
      <div style={{ background: '#e8f5e9', borderRadius: 8, padding: 12, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 11, color: '#2e7d32', fontWeight: 600 }}>💵 现金余额</p>
        <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#1b5e20' }}>{fmtTZS(state.balances.cash_balance)}</p>
      </div>
    </div>
  );
}

interface SettledCardProps {
  task: LocalTask;
  kiosk: LocalKiosk | undefined;
}

function SettledCard({ task, kiosk }: SettledCardProps) {
  const grossRevenue = task.gross_revenue ?? (task.score_before !== undefined
    ? (task.current_score - task.score_before) * 200
    : undefined);
  const dividendAmount = task.dividend_amount ?? (grossRevenue !== undefined && task.dividend_rate_snapshot !== undefined
    ? grossRevenue * task.dividend_rate_snapshot
    : undefined);

  return (
    <div style={{ background: '#e6f4ea', borderRadius: 8, padding: 14, marginBottom: 12, border: '1px solid #a5d6a7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {kiosk?.serial_number ?? '—'} · {kiosk?.merchant_name ?? '—'}
        </span>
        <span style={{ background: '#1e7e34', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 12 }} aria-label="Settled">✅ 已结算</span>
      </div>
      <div style={{ fontSize: 13, color: '#444', lineHeight: 1.8 }}>
        <div>分数: {task.score_before ?? '—'} → {task.current_score}</div>
        {grossRevenue !== undefined && <div>营收: {fmtTZS(grossRevenue)}</div>}
        {dividendAmount !== undefined && (
          <div>
            分红 ({task.dividend_rate_snapshot !== undefined ? `${(task.dividend_rate_snapshot * 100).toFixed(0)}%` : '—'}):
            {' '}{fmtTZS(dividendAmount)}
          </div>
        )}
        <div>分红方式: {task.dividend_method === 'cash' ? '现金提取' : task.dividend_method === 'retained' ? '留存' : '—'}</div>
        {task.exchange_amount !== undefined && <div>兑换: {fmtTZS(task.exchange_amount)}</div>}
        {task.expense_amount !== undefined && task.expense_amount > 0 && (
          <div>支出: {fmtTZS(task.expense_amount)}{task.expense_note ? ` (${task.expense_note})` : ''}</div>
        )}
      </div>
    </div>
  );
}

// ---- Step-by-step calculation row ----

function CalcRow({ label, detail, coin, cash, highlight }: {
  label: string;
  detail?: string;
  coin?: number;
  cash?: number;
  highlight?: boolean;
}) {
  const bg = highlight ? '#f0f7ff' : '#fff';
  return (
    <div style={{ background: bg, borderRadius: 6, padding: '8px 10px', marginBottom: 4, border: '1px solid #eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: highlight ? 700 : 600, color: '#333' }}>{label}</span>
        {detail && <span style={{ fontSize: 12, color: '#666' }}>{detail}</span>}
      </div>
      {(coin !== undefined || cash !== undefined) && (
        <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 12 }}>
          {coin !== undefined && <span style={{ color: '#1565c0' }}>🪙 {fmtTZS(coin)}</span>}
          {cash !== undefined && <span style={{ color: '#2e7d32' }}>💵 {fmtTZS(cash)}</span>}
        </div>
      )}
    </div>
  );
}

// ---- Settlement form with step-by-step calculation ----

interface SettlementFormProps {
  task: LocalTask;
  kiosk: LocalKiosk | undefined;
  driverBalances: DriverBalances | null;
  onSettled: () => void;
  singleMode?: boolean;
}

function SettlementForm({ task, kiosk, driverBalances, onSettled }: SettlementFormProps) {
  const [dividendMethod, setDividendMethod] = useState<DividendMethod>('cash');
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grossRevenue = task.gross_revenue ?? (task.score_before !== undefined
    ? (task.current_score - task.score_before) * 200
    : undefined);
  const dividendRate = task.dividend_rate_snapshot;
  const dividendAmount = grossRevenue !== undefined && dividendRate !== undefined
    ? Math.round(grossRevenue * dividendRate)
    : undefined;

  const exAmt = parseFloat(exchangeAmount) || 0;
  const expAmt = parseFloat(expenseAmount) || 0;

  // Step-by-step balance projection
  const startCoin = driverBalances?.coin_balance ?? 0;
  const startCash = driverBalances?.cash_balance ?? 0;
  const afterCollect_coin = startCoin + (grossRevenue ?? 0);
  const afterCollect_cash = startCash;
  const afterDividend_coin = afterCollect_coin;
  const afterDividend_cash = dividendMethod === 'cash' && dividendAmount !== undefined
    ? afterCollect_cash - dividendAmount
    : afterCollect_cash;
  const afterExchange_coin = afterDividend_coin - exAmt;
  const afterExchange_cash = afterDividend_cash + exAmt;
  const final_coin = afterExchange_coin;
  const final_cash = afterExchange_cash - expAmt;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (exAmt < 0 || expAmt < 0) {
      setError('金额不能为负数');
      return;
    }
    setSubmitting(true);
    try {
      await settleTask({
        taskId: task.id,
        dividendMethod,
        exchangeAmount: exAmt,
        expenseAmount: expAmt,
        expenseNote: expenseNote.trim() || undefined,
      });
      onSettled();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '结算失败，请重试。';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: '1px solid #ddd', borderRadius: 6,
    fontSize: 15, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: '#333' };

  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid #e0e0e0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {kiosk?.serial_number ?? '—'}
          </span>
          <span style={{ fontSize: 13, color: '#666', marginLeft: 8 }}>{kiosk?.merchant_name ?? ''}</span>
        </div>
        <span style={{ background: '#fff9c4', color: '#f57f17', borderRadius: 12, padding: '2px 10px', fontSize: 12, border: '1px solid #ffe082' }}>🟡 待结算</span>
      </div>

      {error && (
        <div style={{ background: '#fce8e6', color: '#c62828', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {error}
          <button type="button" onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Step-by-step calculation */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#555' }}>📊 结算明细</p>

        {driverBalances && (
          <CalcRow label="期初余额" coin={startCoin} cash={startCash} />
        )}

        <CalcRow
          label={`① 分数: ${task.score_before ?? '—'} → ${task.current_score}`}
          detail={grossRevenue !== undefined ? `+${fmtTZS(grossRevenue)} 硬币` : undefined}
          coin={afterCollect_coin}
          cash={afterCollect_cash}
        />

        {dividendAmount !== undefined && dividendRate !== undefined && (
          <CalcRow
            label={`② 分红 (${(dividendRate * 100).toFixed(0)}%): ${fmtTZS(dividendAmount)}`}
            detail={dividendMethod === 'cash' ? '→ 现金支付' : '→ 留存'}
            coin={afterDividend_coin}
            cash={afterDividend_cash}
          />
        )}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Dividend method */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>分红方式</label>
          <div style={{ display: 'flex', gap: 12 }}>
            {(['cash', 'retained'] as const).map(m => (
              <label key={m} style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer',
                padding: '8px 14px', borderRadius: 8,
                border: `2px solid ${dividendMethod === m ? '#0066CC' : '#ddd'}`,
                background: dividendMethod === m ? '#e3f2fd' : '#fff',
              }}>
                <input type="radio" name={`dividend-${task.id}`} value={m} checked={dividendMethod === m} onChange={() => setDividendMethod(m)} style={{ display: 'none' }} />
                {m === 'cash' ? '💵 现金' : '🏦 留存'}
              </label>
            ))}
          </div>
        </div>

        {/* Exchange amount */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>③ 代币兑换 (TZS)</label>
          <input
            type="number"
            min={0}
            step="1"
            value={exchangeAmount}
            onChange={e => setExchangeAmount(e.target.value)}
            placeholder="兑换现金的硬币数"
            style={inputStyle}
          />
          {exAmt > 0 && driverBalances && (
            <CalcRow label="兑换后" coin={afterExchange_coin} cash={afterExchange_cash} />
          )}
        </div>

        {/* Expense amount */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>④ 支出 (TZS)</label>
          <input
            type="number"
            min={0}
            step="1"
            value={expenseAmount}
            onChange={e => setExpenseAmount(e.target.value)}
            placeholder="支出金额"
            style={inputStyle}
          />
        </div>

        {/* Expense note */}
        {(expAmt > 0 || expenseNote) && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>支出备注 <span style={{ fontWeight: 400, color: '#888' }}>(可选)</span></label>
            <input
              type="text"
              value={expenseNote}
              onChange={e => setExpenseNote(e.target.value)}
              placeholder="例如：交通、油费、维修..."
              style={inputStyle}
            />
          </div>
        )}

        {/* Final balance preview */}
        {driverBalances && (
          <CalcRow label="⑤ 预计最终余额" coin={final_coin} cash={final_cash} highlight />
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', padding: 14, marginTop: 12,
            background: submitting ? '#ccc' : '#0066CC', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? '提交中...' : '确认结算'}
        </button>
      </form>
    </div>
  );
}

// ---- Main page ----

export function SettlementPage() {
  const { taskId: routeTaskId } = useParams<{ taskId: string }>();
  const today = todayDarEsSalaam();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const balanceState = useDriverBalances();

  const tasks = useLiveQuery(
    () => db.tasks.where('task_date').equals(today).toArray(),
    [today, refreshKey],
  );

  const kiosks = useLiveQuery(() => db.kiosks.toArray(), []);

  const kioskMap = useMemo(
    () => new Map<string, LocalKiosk>((kiosks ?? []).map(k => [k.id, k])),
    [kiosks],
  );

  // Single-task mode: filter to just this task
  const singleMode = !!routeTaskId;
  const visibleTasks = singleMode
    ? (tasks ?? []).filter(t => t.id === routeTaskId)
    : (tasks ?? []);

  const pendingTasks = visibleTasks.filter(t => t.settlement_status !== 'settled');
  const settledTasks = visibleTasks.filter(t => t.settlement_status === 'settled');
  const allTasks = visibleTasks;

  // In single mode, after settlement go to kiosks page
  const handleSettled = () => {
    setRefreshKey(k => k + 1);
    balanceState.refresh();
  };

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      await pullTasks();
    } finally {
      setSyncing(false);
      setRefreshKey(k => k + 1);
    }
  };

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        {singleMode ? (
          <button onClick={() => navigate('/kiosks')} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 14, cursor: 'pointer', padding: 0 }}>
            ← 返回机器列表
          </button>
        ) : (
          <h2 style={{ margin: 0, color: '#0066CC' }}>今日结算</h2>
        )}
        <button
          onClick={handleRefresh}
          disabled={syncing}
          style={{ background: 'none', border: '1px solid #0066CC', color: '#0066CC', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}
        >
          {syncing ? '同步中...' : '🔄 刷新'}
        </button>
      </div>

      {singleMode && <h2 style={{ margin: '0 0 12px', color: '#0066CC', fontSize: 18 }}>任务结算</h2>}

      {/* Current balances */}
      <BalanceCard state={balanceState} />

      {/* Pending tasks */}
      {pendingTasks.length > 0 ? (
        <>
          {!singleMode && <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#555', fontWeight: 600 }}>待结算任务</h3>}
          {pendingTasks.map(task => (
            <SettlementForm
              key={task.id}
              task={task}
              kiosk={kioskMap.get(task.kiosk_id)}
              driverBalances={balanceState.balances}
              onSettled={handleSettled}
              singleMode={singleMode}
            />
          ))}
        </>
      ) : allTasks.length === 0 ? (
        <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16, textAlign: 'center', color: '#888', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14 }}>{singleMode ? '未找到任务。' : '今日暂无待结算任务。'}</p>
        </div>
      ) : null}

      {/* Settled tasks */}
      {settledTasks.length > 0 && (
        <>
          {!singleMode && <h3 style={{ margin: '16px 0 12px', fontSize: 14, color: '#555', fontWeight: 600 }}>已结算任务</h3>}
          {settledTasks.map(task => (
            <SettledCard key={task.id} task={task} kiosk={kioskMap.get(task.kiosk_id)} />
          ))}
        </>
      )}

      {/* After settlement in single mode: back to kiosks */}
      {singleMode && settledTasks.length > 0 && pendingTasks.length === 0 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => navigate('/kiosks')}
            style={{ flex: 1, padding: 14, background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            🏪 下一台机器
          </button>
          <button
            type="button"
            onClick={() => navigate('/reconciliation')}
            style={{ flex: 1, padding: 14, background: '#fff', color: '#0066CC', border: '1px solid #0066CC', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            📋 日结
          </button>
        </div>
      )}

      {/* All-tasks mode: all settled prompt */}
      {!singleMode && tasks !== undefined && allTasks.length > 0 && pendingTasks.length === 0 && (
        <div style={{ background: '#e6f4ea', border: '1px solid #a5d6a7', borderRadius: 8, padding: 16, marginBottom: 16, textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', fontSize: 14, color: '#1e7e34', fontWeight: 600 }}>✅ 所有任务已结算！</p>
          <button
            type="button"
            onClick={() => navigate('/reconciliation')}
            style={{ background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            📋 前往日结
          </button>
        </div>
      )}
    </div>
  );
}


