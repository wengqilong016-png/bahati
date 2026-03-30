import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { fmtCurrency } from '../lib/format';

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

function KpiCard({ title, value, icon, color, href }: {
  title: string;
  value: string;
  icon: string;
  color: string;
  href?: string;
}) {
  const content = (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '16px 18px',
      border: '1px solid #e0e0e0',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      cursor: href ? 'pointer' : 'default',
      transition: 'box-shadow 0.15s',
    }}>
      <div style={{ fontSize: 28, flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</p>
        <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{value}</p>
      </div>
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

  useEffect(() => {
    let cancelled = false;

    const fetchSummary = async () => {
      const today = new Date().toISOString().slice(0, 10);

      const [
        settlementsRes,
        merchantsRes,
        driversRes,
        reconcRes,
        discrepRes,
        approvalsRes,
      ] = await Promise.all([
        // Today's settlements aggregates
        supabase
          .from('task_settlements')
          .select('gross_revenue, exchange_amount, expense_amount, dividend_method, dividend_amount')
          .eq('task_date', today),
        // Merchant totals
        // TODO [未指定 / unspecified]: merchants.retained_balance & debt_balance are
        // column-level REVOKED for authenticated role (Phase 2). A Boss-only
        // SECURITY DEFINER read RPC is needed. Using merchant_balance_snapshots
        // as fallback for now.
        // We fetch only the most recent snapshot date to keep the query bounded.
        supabase
          .from('merchant_balance_snapshots')
          .select('merchant_id, retained_balance, debt_balance, snapshot_date')
          .order('snapshot_date', { ascending: false })
          .limit(500),
        // All active drivers
        supabase
          .from('drivers')
          .select('id')
          .eq('is_active', true),
        // Today's reconciliations (submitted or confirmed)
        supabase
          .from('daily_driver_reconciliations')
          .select('driver_id')
          .eq('reconciliation_date', today)
          .in('status', ['submitted', 'confirmed']),
        // Today's reconciliations with discrepancy
        supabase
          .from('daily_driver_reconciliations')
          .select('driver_id, coin_variance, cash_variance')
          .eq('reconciliation_date', today),
        // Pending approvals count
        supabase
          .from('score_reset_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);

      if (cancelled) return;

      // Aggregate today's settlements
      const settlements = settlementsRes.data ?? [];
      let todayRevenue = 0;
      let todayExchange = 0;
      let todayExpense = 0;
      let todayRetainedDividend = 0;
      for (const s of settlements) {
        todayRevenue += Number(s.gross_revenue) || 0;
        todayExchange += Number(s.exchange_amount) || 0;
        todayExpense += Number(s.expense_amount) || 0;
        if (s.dividend_method === 'retained') {
          todayRetainedDividend += Number(s.dividend_amount) || 0;
        }
      }

      // Merchant aggregates (from snapshots — deduplicate to latest per merchant)
      let merchantTotalDebt = 0;
      let merchantTotalRetained = 0;
      if (merchantsRes.error) {
        console.error('[dashboard] merchant_balance_snapshots error:', merchantsRes.error.message);
      } else {
        const snapshots = merchantsRes.data ?? [];
        const latestByMerchant = new Map<string, { retained_balance: number; debt_balance: number }>();
        for (const s of snapshots as { merchant_id: string; retained_balance: number; debt_balance: number }[]) {
          if (!latestByMerchant.has(s.merchant_id)) {
            latestByMerchant.set(s.merchant_id, s);
          }
        }
        for (const m of latestByMerchant.values()) {
          merchantTotalDebt += Number(m.debt_balance) || 0;
          merchantTotalRetained += Number(m.retained_balance) || 0;
        }
      }

      // Unsettled drivers = active drivers without a submitted/confirmed reconciliation today
      const activeDriverIds = new Set((driversRes.data ?? []).map(d => d.id));
      const reconciledIds = new Set((reconcRes.data ?? []).map(r => r.driver_id));
      const unsettledDrivers = [...activeDriverIds].filter(id => !reconciledIds.has(id)).length;

      // Discrepancy drivers = drivers with non-zero coin or cash variance today
      const discrepancyDrivers = (discrepRes.data ?? []).filter(
        r => (Number(r.coin_variance) !== 0 || Number(r.cash_variance) !== 0)
      ).length;

      setSummary({
        todayRevenue,
        todayExchange,
        todayExpense,
        todayRetainedDividend,
        merchantTotalDebt,
        merchantTotalRetained,
        unsettledDrivers,
        discrepancyDrivers,
        pendingApprovals: approvalsRes.count ?? 0,
      });
      setLoading(false);
    };

    void fetchSummary();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC', fontSize: 20 }}>Dashboard</h2>

      {loading ? (
        <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : (
        <>
          {/* Revenue KPIs */}
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#888', fontWeight: 600 }}>今日概况</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiCard title="今日总营业额" value={fmtCurrency(summary.todayRevenue)} icon="💰" color="#0066CC" />
            <KpiCard title="今日总换币金额" value={fmtCurrency(summary.todayExchange)} icon="🔄" color="#1565c0" />
            <KpiCard title="今日总支出" value={fmtCurrency(summary.todayExpense)} icon="📤" color={summary.todayExpense > 0 ? '#e65100' : '#666'} />
            <KpiCard title="今日新增留存分红" value={fmtCurrency(summary.todayRetainedDividend)} icon="📥" color="#1e7e34" />
          </div>

          {/* Merchant KPIs */}
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#888', fontWeight: 600 }}>商家概况</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiCard title="当前商家总债务" value={fmtCurrency(summary.merchantTotalDebt)} icon="🏷️" color="#c62828" href="/merchants" />
            <KpiCard title="当前商家总留存" value={fmtCurrency(summary.merchantTotalRetained)} icon="🏦" color="#1e7e34" href="/merchants" />
          </div>

          {/* Operational KPIs */}
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#888', fontWeight: 600 }}>运营状态</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiCard
              title="未日结司机数"
              value={String(summary.unsettledDrivers)}
              icon="⏳"
              color={summary.unsettledDrivers > 0 ? '#e65100' : '#1e7e34'}
              href="/drivers"
            />
            <KpiCard
              title="异常差额司机数"
              value={String(summary.discrepancyDrivers)}
              icon="⚠️"
              color={summary.discrepancyDrivers > 0 ? '#c62828' : '#1e7e34'}
              href="/drivers"
            />
            <KpiCard
              title="待审批重置申请数"
              value={String(summary.pendingApprovals)}
              icon="📋"
              color={summary.pendingApprovals > 0 ? '#e65100' : '#1e7e34'}
              href="/approvals"
            />
          </div>

          {/* Quick Links */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', border: '1px solid #e0e0e0' }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#333' }}>快捷入口</p>
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
                    background: '#e8f0fe',
                    color: '#0066CC',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
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
