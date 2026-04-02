import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { fmtCurrency } from '../lib/format';
import { colors, radius, shadow, font } from '../lib/theme';

interface DailyReport {
  date: string;
  totalRevenue: number;
  totalExchange: number;
  totalExpense: number;
  totalDividendCash: number;
  totalDividendRetained: number;
  tasksCount: number;
}

// Pure-SVG bar chart
function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const [tooltip, setTooltip] = useState<{ label: string; value: number; x: number } | null>(null);
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 100, H = 60, barGap = 4;
  const barW = data.length > 0 ? Math.max(4, (W - (data.length - 1) * barGap) / data.length) : 0;

  if (data.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H + 14}`}
        style={{ width: '100%', height: 80, display: 'block' }}
        role="img"
        aria-label="收入柱状图"
      >
        {data.map((d, i) => {
          const barH = Math.max(2, (d.value / max) * H);
          const x = i * (barW + barGap);
          const y = H - barH;
          return (
            <g key={d.label}>
              <rect
                x={x} y={y}
                width={barW} height={barH}
                fill={color}
                rx={2}
                opacity={0.85}
                onMouseEnter={() => setTooltip({ label: d.label, value: d.value, x: x + barW / 2 })}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'default' }}
              />
              {/* X-axis label (date shortened to MM-DD) */}
              <text
                x={x + barW / 2} y={H + 11}
                textAnchor="middle"
                fontSize={4.5}
                fill={colors.textMuted}
              >
                {d.label.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: `clamp(0%, ${(tooltip.x / 100) * 100}%, 100%)`,
          transform: 'translate(-50%, -100%)',
          background: 'rgba(30,30,30,0.88)',
          color: '#fff',
          padding: '5px 9px',
          borderRadius: radius.sm,
          fontSize: font.sizes.xs,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {tooltip.label}: {fmtCurrency(tooltip.value)}
        </div>
      )}
    </div>
  );
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

      if (err) { setError(err.message); setLoading(false); return; }

      const byDate: Record<string, DailyReport> = {};
      for (const row of data ?? []) {
        const d = row.task_date;
        if (!byDate[d]) {
          byDate[d] = { date: d, totalRevenue: 0, totalExchange: 0, totalExpense: 0, totalDividendCash: 0, totalDividendRetained: 0, tasksCount: 0 };
        }
        byDate[d].totalRevenue += Number(row.gross_revenue) || 0;
        byDate[d].totalExchange += Number(row.exchange_amount) || 0;
        byDate[d].totalExpense += Number(row.expense_amount) || 0;
        if (row.dividend_method === 'cash') byDate[d].totalDividendCash += Number(row.dividend_amount) || 0;
        else byDate[d].totalDividendRetained += Number(row.dividend_amount) || 0;
        byDate[d].tasksCount += 1;
      }

      setReports(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    };

    void fetchReport();
    return () => { cancelled = true; };
  }, [days]);

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

  // Bar chart data (ascending by date)
  const chartData = [...reports].sort((a, b) => a.date.localeCompare(b.date)).map(r => ({ label: r.date, value: r.totalRevenue }));

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 16px', color: colors.primary, fontSize: font.sizes.xxl }}>报表中心</h2>

      {error && (
        <div style={{ background: colors.dangerLight, color: colors.danger, padding: 12, borderRadius: radius.md, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[7, 14, 30].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: '6px 14px',
              borderRadius: radius.pill,
              border: days === d ? 'none' : `1px solid ${colors.divider}`,
              background: days === d ? colors.primary : colors.surface,
              color: days === d ? '#fff' : colors.textSecondary,
              cursor: 'pointer',
              fontSize: font.sizes.sm,
              fontWeight: font.weights.semibold,
              transition: 'all 0.15s ease',
            }}
          >
            近{d}天
          </button>
        ))}
      </div>

      {/* Summary card */}
      {!loading && (
        <div style={{ background: colors.surface, borderRadius: radius.lg, padding: '16px 18px', border: `1px solid ${colors.border}`, marginBottom: 20, boxShadow: shadow.card }}>
          <p style={{ margin: '0 0 12px', fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>汇总（近{days}天）</p>

          {/* Revenue bar chart */}
          {chartData.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ margin: '0 0 4px', fontSize: font.sizes.xs, color: colors.textMuted }}>每日营业额趋势</p>
              <BarChart data={chartData} color={colors.primary} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
            {[
              { label: '总营业额', value: totals.revenue, color: colors.primary },
              { label: '总换币金额', value: totals.exchange, color: colors.successDark },
              { label: '总支出', value: totals.expense, color: colors.warning },
              { label: '现金分红', value: totals.dividendCash, color: colors.success },
              { label: '留存分红', value: totals.dividendRetained, color: colors.success },
            ].map(item => (
              <div key={item.label}>
                <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>{item.label}</p>
                <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: item.color }}>{fmtCurrency(item.value)}</p>
              </div>
            ))}
            <div>
              <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>结算笔数</p>
              <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text }}>{totals.tasks}</p>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="skeleton-shimmer" style={{ height: 120, borderRadius: radius.lg, marginBottom: 12 }} />
          {[1, 2, 3].map(i => <div key={i} className="skeleton-shimmer" style={{ height: 80, borderRadius: radius.lg, marginBottom: 10 }} />)}
        </div>
      )}

      {/* Daily breakdown cards */}
      {!loading && reports.length === 0 && (
        <p style={{ color: colors.textDisabled, textAlign: 'center', padding: 40 }}>暂无报表数据</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reports.map(r => (
          <div
            key={r.date}
            className="card-hover"
            style={{
              background: colors.surface,
              borderRadius: radius.lg,
              padding: '14px 18px',
              border: `1px solid ${colors.border}`,
              boxShadow: shadow.card,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ margin: 0, fontWeight: font.weights.bold, fontSize: font.sizes.base, color: colors.text }}>{r.date}</p>
              <span style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.infoLight, color: colors.info }}>
                {r.tasksCount} 笔
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>营业额</p>
                <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.semibold, color: colors.primary }}>{fmtCurrency(r.totalRevenue)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>换币</p>
                <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.semibold, color: colors.successDark }}>{fmtCurrency(r.totalExchange)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>支出</p>
                <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.semibold, color: colors.warning }}>{fmtCurrency(r.totalExpense)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>现金分红</p>
                <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.semibold, color: colors.success }}>{fmtCurrency(r.totalDividendCash)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>留存分红</p>
                <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.semibold, color: colors.success }}>{fmtCurrency(r.totalDividendRetained)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

