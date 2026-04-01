import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { fmtCurrency } from '../lib/format';
import { getTodayDarEsSalaam } from '../lib/utils';
import { colors, radius, shadow, font } from '../lib/theme';
import { DashboardSkeleton } from '../components/Skeleton';

interface DashboardSummary {
  todayRevenue: number;
  todayExchange: number;
  todayExpense: number;
  todayRetainedDividend: number;
  merchantTotalDebt: number;
  merchantTotalRetained: number;
  unsettledDrivers: number;
  discrepancyDrivers: number;
  pendingApprovals: number;
}

const defaultSummary: DashboardSummary = {
  todayRevenue: 0,
  todayExchange: 0,
  todayExpense: 0,
  todayRetainedDividend: 0,
  merchantTotalDebt: 0,
  merchantTotalRetained: 0,
  unsettledDrivers: 0,
  discrepancyDrivers: 0,
  pendingApprovals: 0,
};

// Count-up hook: animates a number from 0 to target over ~600ms
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) { setValue(0); return; }
    const start = performance.now();
    const duration = 600;
    const animate = (now: number) => {
      const elapsed = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (elapsed < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, enabled]);

  return value;
}

// Sparkline: 7-day mini line chart (pure SVG)
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const W = 80, H = 28;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - (v / max) * (H - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={W} height={H} style={{ display: 'block', marginTop: 4 }} aria-hidden="true">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
    </svg>
  );
}

function KpiCard({ title, value, icon, color, href, alert, sparklineValues }: {
  title: string;
  value: string;
  icon: string;
  color: string;
  href?: string;
  alert?: boolean;
  sparklineValues?: number[];
}) {
  const [hovered, setHovered] = useState(false);
  const alertClass = alert ? (color === colors.danger ? 'pulse-red' : 'pulse-orange') : '';

  const content = (
    <div
      className={`card-hover ${alertClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: alert ? (color === colors.danger ? '#fff5f5' : '#fff8f0') : colors.surface,
        borderRadius: radius.lg,
        padding: '16px 18px',
        border: `1px solid ${alert ? color + '44' : colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        cursor: href ? 'pointer' : 'default',
        boxShadow: hovered ? shadow.cardHover : shadow.card,
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          fontSize: 22,
          width: 36,
          height: 36,
          borderRadius: radius.md,
          background: color + '18',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted, lineHeight: 1.3 }}>{title}</p>
      </div>
      <p className="tabular-nums" style={{ margin: 0, fontSize: font.sizes.metric, fontWeight: font.weights.bold, color }}>{value}</p>
      {sparklineValues && <Sparkline values={sparklineValues} color={color} />}
    </div>
  );

  if (href) {
    return <Link to={href} style={{ textDecoration: 'none' }}>{content}</Link>;
  }
  return content;
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>(defaultSummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekRevenue, setWeekRevenue] = useState<number[]>([]);

  // Count-up for key numeric KPIs (only numeric ones)
  const animRevenue = useCountUp(summary.todayRevenue, !loading);
  const animExchange = useCountUp(summary.todayExchange, !loading);
  const animExpense = useCountUp(summary.todayExpense, !loading);
  const animRetained = useCountUp(summary.todayRetainedDividend, !loading);

  useEffect(() => {
    let cancelled = false;

    const fetchSummary = async () => {
      const today = getTodayDarEsSalaam();

      // Also fetch last 7 days revenue for sparkline
      const since = new Date();
      since.setDate(since.getDate() - 6);
      const sinceStr = since.toISOString().slice(0, 10);

      const [
        settlementsRes,
        merchantsRes,
        driversRes,
        reconcRes,
        discrepRes,
        approvalsRes,
        weekRes,
      ] = await Promise.all([
        supabase
          .from('task_settlements')
          .select('gross_revenue, exchange_amount, expense_amount, dividend_method, dividend_amount')
          .eq('task_date', today),
        supabase.rpc('read_merchant_balances'),
        supabase.from('drivers').select('id').eq('is_active', true),
        supabase.from('daily_driver_reconciliations').select('driver_id').eq('reconciliation_date', today).in('status', ['submitted', 'confirmed']),
        supabase.from('daily_driver_reconciliations').select('driver_id, coin_variance, cash_variance').eq('reconciliation_date', today),
        supabase.from('score_reset_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('task_settlements').select('task_date, gross_revenue').gte('task_date', sinceStr).order('task_date', { ascending: true }),
      ]);

      if (cancelled) return;

      const settlements = settlementsRes.data ?? [];
      let todayRevenue = 0, todayExchange = 0, todayExpense = 0, todayRetainedDividend = 0;
      for (const s of settlements) {
        todayRevenue += Number(s.gross_revenue) || 0;
        todayExchange += Number(s.exchange_amount) || 0;
        todayExpense += Number(s.expense_amount) || 0;
        if (s.dividend_method === 'retained') todayRetainedDividend += Number(s.dividend_amount) || 0;
      }

      let merchantTotalDebt = 0, merchantTotalRetained = 0;
      if (merchantsRes.error) {
        setError('数据加载失败');
      } else {
        for (const m of (merchantsRes.data ?? []) as { merchant_id: string; retained_balance: number; debt_balance: number }[]) {
          merchantTotalDebt += Number(m.debt_balance) || 0;
          merchantTotalRetained += Number(m.retained_balance) || 0;
        }
      }

      const activeDriverIds = new Set((driversRes.data ?? []).map(d => d.id));
      const reconciledIds = new Set((reconcRes.data ?? []).map(r => r.driver_id));
      const unsettledDrivers = [...activeDriverIds].filter(id => !reconciledIds.has(id)).length;
      const discrepancyDrivers = (discrepRes.data ?? []).filter(
        r => (Number(r.coin_variance) !== 0 || Number(r.cash_variance) !== 0)
      ).length;

      // Build 7-day sparkline
      const byDate: Record<string, number> = {};
      for (const row of weekRes.data ?? []) {
        byDate[row.task_date] = (byDate[row.task_date] ?? 0) + Number(row.gross_revenue);
      }
      const sparkDays: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        sparkDays.push(byDate[d.toISOString().slice(0, 10)] ?? 0);
      }
      setWeekRevenue(sparkDays);

      setSummary({ todayRevenue, todayExchange, todayExpense, todayRetainedDividend, merchantTotalDebt, merchantTotalRetained, unsettledDrivers, discrepancyDrivers, pendingApprovals: approvalsRes.count ?? 0 });
      setLoading(false);
    };

    void fetchSummary();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 20px', color: colors.primary, fontSize: font.sizes.xxl, fontFamily: font.family }}>Dashboard</h2>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error && (
            <div style={{ background: colors.dangerLight, color: colors.danger, padding: 12, borderRadius: radius.md, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Today's Revenue KPIs */}
          <p style={{ margin: '0 0 10px', fontSize: font.sizes.sm, color: colors.textMuted, fontWeight: font.weights.semibold }}>今日概况</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiCard title="今日总营业额" value={fmtCurrency(animRevenue)} icon="💰" color={colors.primary} sparklineValues={weekRevenue} />
            <KpiCard title="今日总换币金额" value={fmtCurrency(animExchange)} icon="🔄" color={colors.successDark} />
            <KpiCard title="今日总支出" value={fmtCurrency(animExpense)} icon="📤" color={summary.todayExpense > 0 ? colors.warning : colors.textSecondary} />
            <KpiCard title="今日新增留存分红" value={fmtCurrency(animRetained)} icon="📥" color={colors.success} />
          </div>

          {/* Merchant KPIs */}
          <p style={{ margin: '0 0 10px', fontSize: font.sizes.sm, color: colors.textMuted, fontWeight: font.weights.semibold }}>商家概况</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiCard title="当前商家总债务" value={fmtCurrency(summary.merchantTotalDebt)} icon="🏷️" color={colors.danger} href="/merchants" />
            <KpiCard title="当前商家总留存" value={fmtCurrency(summary.merchantTotalRetained)} icon="🏦" color={colors.success} href="/merchants" />
          </div>

          {/* Operational KPIs */}
          <p style={{ margin: '0 0 10px', fontSize: font.sizes.sm, color: colors.textMuted, fontWeight: font.weights.semibold }}>运营状态</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiCard
              title="未日结司机数"
              value={String(summary.unsettledDrivers)}
              icon="⏳"
              color={summary.unsettledDrivers > 0 ? colors.warning : colors.success}
              href="/drivers"
              alert={summary.unsettledDrivers > 0}
            />
            <KpiCard
              title="异常差额司机数"
              value={String(summary.discrepancyDrivers)}
              icon="⚠️"
              color={summary.discrepancyDrivers > 0 ? colors.danger : colors.success}
              href="/drivers"
              alert={summary.discrepancyDrivers > 0}
            />
            <KpiCard
              title="待审批重置申请数"
              value={String(summary.pendingApprovals)}
              icon="📋"
              color={summary.pendingApprovals > 0 ? colors.warning : colors.success}
              href="/approvals"
              alert={summary.pendingApprovals > 0}
            />
          </div>

          {/* Quick Links */}
          <div style={{ background: colors.surface, borderRadius: radius.lg, padding: '16px 18px', border: `1px solid ${colors.border}`, boxShadow: shadow.card }}>
            <p style={{ margin: '0 0 12px', fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>快捷入口</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {[
                { label: '司机管理', to: '/drivers' },
                { label: '商家管理', to: '/merchants' },
                { label: '机器管理', to: '/kiosks' },
                { label: '审批中心', to: '/approvals' },
                { label: '报表中心', to: '/reports' },
                { label: '地图概览', to: '/map' },
              ].map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{
                    padding: '8px 14px',
                    background: colors.primaryLight,
                    color: colors.primary,
                    borderRadius: radius.md,
                    textDecoration: 'none',
                    fontSize: font.sizes.sm,
                    fontWeight: font.weights.semibold,
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#d2e3fc')}
                  onMouseLeave={e => (e.currentTarget.style.background = colors.primaryLight)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

