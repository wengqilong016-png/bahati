import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface DailyReport {
  date: string;
  totalRevenue: number;
  totalExchange: number;
  totalExpense: number;
  totalDividendCash: number;
  totalDividendRetained: number;
  tasksCount: number;
}

export function ReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    let cancelled = false;

    const fetchReport = async () => {
      setLoading(true);

      const since = new Date();
      since.setDate(since.getDate() - days + 1);
      const sinceStr = since.toISOString().slice(0, 10);

      const { data, error: err } = await supabase
        .from('task_settlements')
        .select('task_date, gross_revenue, exchange_amount, expense_amount, dividend_method, dividend_amount')
        .gte('task_date', sinceStr)
        .order('task_date', { ascending: false });

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      // Group by date
      const byDate: Record<string, DailyReport> = {};
      for (const row of data ?? []) {
        const d = row.task_date;
        if (!byDate[d]) {
          byDate[d] = {
            date: d,
            totalRevenue: 0,
            totalExchange: 0,
            totalExpense: 0,
            totalDividendCash: 0,
            totalDividendRetained: 0,
            tasksCount: 0,
          };
        }
        byDate[d].totalRevenue += Number(row.gross_revenue) || 0;
        byDate[d].totalExchange += Number(row.exchange_amount) || 0;
        byDate[d].totalExpense += Number(row.expense_amount) || 0;
        if (row.dividend_method === 'cash') {
          byDate[d].totalDividendCash += Number(row.dividend_amount) || 0;
        } else {
          byDate[d].totalDividendRetained += Number(row.dividend_amount) || 0;
        }
        byDate[d].tasksCount += 1;
      }

      const sorted = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
      setReports(sorted);
      setLoading(false);
    };

    void fetchReport();
    return () => { cancelled = true; };
  }, [days]);

  function fmtCurrency(n: number): string {
    return `IDR ${n.toLocaleString('id-ID')}`;
  }

  // Totals
  const totals = reports.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.totalRevenue,
      exchange: acc.exchange + r.totalExchange,
      expense: acc.expense + r.totalExpense,
      dividendCash: acc.dividendCash + r.totalDividendCash,
      dividendRetained: acc.dividendRetained + r.totalDividendRetained,
      tasks: acc.tasks + r.tasksCount,
    }),
    { revenue: 0, exchange: 0, expense: 0, dividendCash: 0, dividendRetained: 0, tasks: 0 },
  );

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 16px', color: '#0066CC', fontSize: 20 }}>报表中心</h2>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[7, 14, 30].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: '6px 14px',
              borderRadius: 16,
              border: days === d ? 'none' : '1px solid #ddd',
              background: days === d ? '#0066CC' : '#fff',
              color: days === d ? '#fff' : '#666',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            近{d}天
          </button>
        ))}
      </div>

      {/* Summary card */}
      {!loading && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', border: '1px solid #e0e0e0', marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#333' }}>汇总（近{days}天）</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: '#888' }}>总营业额</p>
              <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#0066CC' }}>{fmtCurrency(totals.revenue)}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: '#888' }}>总换币金额</p>
              <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#1565c0' }}>{fmtCurrency(totals.exchange)}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: '#888' }}>总支出</p>
              <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#e65100' }}>{fmtCurrency(totals.expense)}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: '#888' }}>现金分红</p>
              <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#1e7e34' }}>{fmtCurrency(totals.dividendCash)}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: '#888' }}>留存分红</p>
              <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#1e7e34' }}>{fmtCurrency(totals.dividendRetained)}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: '#888' }}>结算笔数</p>
              <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#333' }}>{totals.tasks}</p>
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>Loading...</p>}

      {/* Daily breakdown cards */}
      {!loading && reports.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>暂无报表数据</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reports.map(r => (
          <div
            key={r.date}
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '14px 18px',
              border: '1px solid #e0e0e0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#333' }}>{r.date}</p>
              <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#e3f2fd', color: '#1565c0' }}>
                {r.tasksCount} 笔
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: '#888' }}>营业额</p>
                <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 600, color: '#0066CC' }}>{fmtCurrency(r.totalRevenue)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: '#888' }}>换币</p>
                <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 600, color: '#1565c0' }}>{fmtCurrency(r.totalExchange)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: '#888' }}>支出</p>
                <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 600, color: '#e65100' }}>{fmtCurrency(r.totalExpense)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: '#888' }}>现金分红</p>
                <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 600, color: '#1e7e34' }}>{fmtCurrency(r.totalDividendCash)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: '#888' }}>留存分红</p>
                <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 600, color: '#1e7e34' }}>{fmtCurrency(r.totalDividendRetained)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
