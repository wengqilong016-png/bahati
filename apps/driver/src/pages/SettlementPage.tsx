import { useState, useMemo, FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db';
import { settleTask } from '../lib/settlement';
import { pullTasks } from '../lib/sync';
import type { LocalTask, LocalKiosk } from '../lib/types';

type DividendMethod = 'cash' | 'retained';

// ---- helpers ----

function todayDarEsSalaam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// ---- Sub-components ----

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
        <span style={{ background: '#1e7e34', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 12 }} aria-label="Settled">✅ Settled</span>
      </div>
      <div style={{ fontSize: 13, color: '#444', lineHeight: 1.8 }}>
        <div>Score: {task.score_before ?? '—'} → {task.current_score}</div>
        {grossRevenue !== undefined && <div>Revenue: TZS {grossRevenue.toLocaleString()}</div>}
        {dividendAmount !== undefined && (
          <div>
            Dividend ({task.dividend_rate_snapshot !== undefined ? `${(task.dividend_rate_snapshot * 100).toFixed(0)}%` : '—'}):
            TZS {dividendAmount.toLocaleString()}
          </div>
        )}
        <div>Dividend method: {task.dividend_method === 'cash' ? 'Cash withdrawal' : task.dividend_method === 'retained' ? 'Retained' : '—'}</div>
        {task.exchange_amount !== undefined && <div>Exchange amount: TZS {task.exchange_amount.toLocaleString()}</div>}
        {task.expense_amount !== undefined && task.expense_amount > 0 && (
          <div>Expense: TZS {task.expense_amount.toLocaleString()}{task.expense_note ? ` (${task.expense_note})` : ''}</div>
        )}
      </div>
    </div>
  );
}

interface SettlementFormProps {
  task: LocalTask;
  kiosk: LocalKiosk | undefined;
  onSettled: () => void;
}

function SettlementForm({ task, kiosk, onSettled }: SettlementFormProps) {
  const [dividendMethod, setDividendMethod] = useState<DividendMethod>('cash');
  const [exchangeAmount, setExchangeAmount] = useState('0');
  const [expenseAmount, setExpenseAmount] = useState('0');
  const [expenseNote, setExpenseNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grossRevenue = task.gross_revenue ?? (task.score_before !== undefined
    ? (task.current_score - task.score_before) * 200
    : undefined);
  const dividendAmount = grossRevenue !== undefined && task.dividend_rate_snapshot !== undefined
    ? grossRevenue * task.dividend_rate_snapshot
    : undefined;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const exAmt = parseFloat(exchangeAmount) || 0;
    const expAmt = parseFloat(expenseAmount) || 0;
    if (exAmt < 0 || expAmt < 0) {
      setError('Amounts cannot be negative');
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
      const msg = err instanceof Error ? err.message : 'Settlement failed. Please try again.';
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
  const readonlyStyle: React.CSSProperties = { ...inputStyle, background: '#f5f5f5', color: '#555' };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: '#333' };

  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 16, marginBottom: 16, border: '1px solid #e0e0e0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>
          {kiosk?.serial_number ?? '—'} · {kiosk?.merchant_name ?? '—'}
        </span>
        <span style={{ background: '#fff9c4', color: '#f57f17', borderRadius: 12, padding: '2px 10px', fontSize: 12, border: '1px solid #ffe082' }} aria-label="Pending settlement">🟡 Pending</span>
      </div>

      {error && (
        <div style={{ background: '#fce8e6', color: '#c62828', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            style={{ float: 'right', background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', padding: 0, fontSize: 13 }}
          >✕</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Read-only info */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Score Change</label>
          <input readOnly value={`${task.score_before ?? '—'} → ${task.current_score}`} style={readonlyStyle} />
        </div>
        {grossRevenue !== undefined && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Gross Revenue (TZS)</label>
            <input readOnly value={`TZS ${grossRevenue.toLocaleString()}`} style={readonlyStyle} />
          </div>
        )}
        {task.dividend_rate_snapshot !== undefined && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Dividend Rate</label>
            <input readOnly value={`${(task.dividend_rate_snapshot * 100).toFixed(0)}%`} style={readonlyStyle} />
          </div>
        )}
        {dividendAmount !== undefined && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Dividend Amount (TZS)</label>
            <input readOnly value={`TZS ${dividendAmount.toLocaleString()}`} style={readonlyStyle} />
          </div>
        )}

        {/* Dividend method */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Dividend Method</label>
          <div style={{ display: 'flex', gap: 16 }}>
            {(['cash', 'retained'] as const).map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name={`dividend-${task.id}`}
                  value={m}
                  checked={dividendMethod === m}
                  onChange={() => setDividendMethod(m)}
                />
                {m === 'cash' ? 'Cash Withdrawal' : 'Retained'}
              </label>
            ))}
          </div>
        </div>

        {/* Exchange amount */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Token Exchange Amount (TZS)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={exchangeAmount}
            onChange={e => setExchangeAmount(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Expense amount */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Expense Amount (TZS)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={expenseAmount}
            onChange={e => setExpenseAmount(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Expense note */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Expense Note <span style={{ fontWeight: 400, color: '#888' }}>(optional)</span></label>
          <input
            type="text"
            value={expenseNote}
            onChange={e => setExpenseNote(e.target.value)}
            placeholder="Enter expense note..."
            style={inputStyle}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{ width: '100%', padding: 14, background: submitting ? '#ccc' : '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'Submitting...' : 'Confirm Settlement'}
        </button>
      </form>
    </div>
  );
}

// ---- Main page ----

export function SettlementPage() {
  const today = todayDarEsSalaam();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const tasks = useLiveQuery(
    () => db.tasks.where('task_date').equals(today).toArray(),
    [today, refreshKey],
  );

  const kiosks = useLiveQuery(() => db.kiosks.toArray(), []);

  const kioskMap = useMemo(
    () => new Map<string, LocalKiosk>((kiosks ?? []).map(k => [k.id, k])),
    [kiosks],
  );

  const pendingTasks = (tasks ?? []).filter(t => t.settlement_status !== 'settled');
  const settledTasks = (tasks ?? []).filter(t => t.settlement_status === 'settled');
  const allTasks = tasks ?? [];

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#0066CC' }}>Today's Settlements</h2>
        <button
          onClick={handleRefresh}
          disabled={syncing}
          style={{ background: 'none', border: '1px solid #0066CC', color: '#0066CC', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}
        >
          {syncing ? 'Syncing...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Pending tasks */}
      {pendingTasks.length > 0 ? (
        <>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#555', fontWeight: 600 }}>Pending Tasks</h3>
          {pendingTasks.map(task => (
            <SettlementForm
              key={task.id}
              task={task}
              kiosk={kioskMap.get(task.kiosk_id)}
              onSettled={() => setRefreshKey(k => k + 1)}
            />
          ))}
        </>
      ) : (
        <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16, textAlign: 'center', color: '#888', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14 }}>No pending tasks today.</p>
        </div>
      )}

      {/* All tasks settled — prompt to go to daily reconciliation */}
      {tasks !== undefined && allTasks.length > 0 && pendingTasks.length === 0 && (
        <div style={{ background: '#e6f4ea', border: '1px solid #a5d6a7', borderRadius: 8, padding: 16, marginBottom: 16, textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', fontSize: 14, color: '#1e7e34', fontWeight: 600 }}>✅ All tasks settled!</p>
          <button
            type="button"
            onClick={() => navigate('/reconciliation')}
            style={{ background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            📋 Go to Daily Close
          </button>
        </div>
      )}

      {/* Settled tasks */}
      {settledTasks.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 12px', fontSize: 14, color: '#555', fontWeight: 600 }}>Settled Tasks</h3>
          {settledTasks.map(task => (
            <SettledCard
              key={task.id}
              task={task}
              kiosk={kioskMap.get(task.kiosk_id)}
            />
          ))}
        </>
      )}
    </div>
  );
}

