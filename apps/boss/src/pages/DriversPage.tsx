import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { fmtCurrency } from '../lib/format';
import { colors, radius, shadow, font } from '../lib/theme';
import { CardListSkeleton } from '../components/Skeleton';

interface Driver {
  id: string;
  full_name: string;
  phone: string | null;
  license_plate: string | null;
  is_active: boolean;
  coin_balance: number;
  cash_balance: number;
  created_at: string;
}

interface ReconciliationStatus {
  driver_id: string;
  status: string;
  coin_variance: number;
  cash_variance: number;
}

type FilterKey = 'all' | 'active' | 'inactive';

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [reconcMap, setReconcMap] = useState<Record<string, ReconciliationStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);

    const fetchData = async () => {
      setLoading(true);
      const [driversRes, reconcRes] = await Promise.all([
        supabase.from('drivers').select('*').order('created_at', { ascending: false }),
        supabase.from('daily_driver_reconciliations').select('driver_id, status, coin_variance, cash_variance').eq('reconciliation_date', today),
      ]);

      if (cancelled) return;
      if (driversRes.error) setError(driversRes.error.message);
      else setDrivers(driversRes.data as Driver[]);

      const map: Record<string, ReconciliationStatus> = {};
      for (const r of (reconcRes.data ?? []) as ReconciliationStatus[]) {
        map[r.driver_id] = r;
      }
      setReconcMap(map);
      setLoading(false);
    };

    void fetchData();
    return () => { cancelled = true; };
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filteredDrivers = drivers?.filter(d => {
    if (filter === 'active') return d.is_active;
    if (filter === 'inactive') return !d.is_active;
    return true;
  });

  // Counts per tab
  const counts: Record<FilterKey, number> = {
    all: drivers?.length ?? 0,
    active: drivers?.filter(d => d.is_active).length ?? 0,
    inactive: drivers?.filter(d => !d.is_active).length ?? 0,
  };

  const tabLabels: Record<FilterKey, string> = { all: '全部', active: '在线', inactive: '离线' };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 16px', color: colors.primary, fontSize: font.sizes.xxl }}>司机管理</h2>

      {error && (
        <div style={{ background: colors.dangerLight, color: colors.danger, padding: 12, borderRadius: radius.md, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }} role="tablist" aria-label="司机筛选">
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              borderRadius: radius.pill,
              border: filter === f ? 'none' : `1px solid ${colors.divider}`,
              background: filter === f ? colors.primary : colors.surface,
              color: filter === f ? '#fff' : colors.textSecondary,
              cursor: 'pointer',
              fontSize: font.sizes.sm,
              fontWeight: font.weights.semibold,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s ease',
            }}
          >
            {tabLabels[f]}
            {!loading && (
              <span style={{
                background: filter === f ? 'rgba(255,255,255,0.25)' : '#f0f0f0',
                color: filter === f ? '#fff' : colors.textMuted,
                borderRadius: radius.pill,
                padding: '1px 7px',
                fontSize: 11,
                fontWeight: font.weights.bold,
              }}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <CardListSkeleton count={4} />}

      {!loading && filteredDrivers && filteredDrivers.length === 0 && (
        <p style={{ color: colors.textDisabled, textAlign: 'center', padding: 40 }}>暂无司机数据</p>
      )}

      {/* Driver Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredDrivers?.map(d => {
          const rec = reconcMap[d.id];
          const hasDiscrepancy = rec && (Number(rec.coin_variance) !== 0 || Number(rec.cash_variance) !== 0);
          const isReconciled = rec && (rec.status === 'submitted' || rec.status === 'confirmed');
          const isExpanded = expandedIds.has(d.id);
          const accentColor = !d.is_active ? colors.textDisabled : hasDiscrepancy ? colors.danger : colors.primary;

          return (
            <div
              key={d.id}
              className="card-hover"
              style={{
                background: colors.surface,
                borderRadius: radius.lg,
                padding: '16px 18px',
                border: `1px solid ${colors.border}`,
                borderLeft: `4px solid ${accentColor}`,
                boxShadow: shadow.card,
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: font.weights.bold, fontSize: font.sizes.lg }}>{d.full_name || '(未命名)'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: font.sizes.sm, color: colors.textMuted }}>
                    {d.phone ?? '—'} · {d.license_plate ?? '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: radius.badge,
                    fontSize: font.sizes.xs,
                    fontWeight: font.weights.semibold,
                    background: d.is_active ? colors.successLight : '#f5f5f5',
                    color: d.is_active ? colors.success : colors.textSecondary,
                  }}>
                    {d.is_active ? '● 在线' : '○ 离线'}
                  </span>
                  {isReconciled && (
                    <span style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.successLight, color: colors.success }}>
                      ✓ 已日结
                    </span>
                  )}
                  {d.is_active && !isReconciled && (
                    <span style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.warningLight, color: colors.warning }}>
                      ⏳ 未日结
                    </span>
                  )}
                  {hasDiscrepancy && (
                    <span style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.dangerLight, color: colors.danger }}>
                      ⚠ 有差额
                    </span>
                  )}
                </div>
              </div>

              {/* Balance row */}
              <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>硬币余额</p>
                    <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.primary }}>{fmtCurrency(Number(d.coin_balance))}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>现金余额</p>
                    <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.success }}>{fmtCurrency(Number(d.cash_balance))}</p>
                  </div>
                </div>

                {/* Expand/collapse button (only if there's detail) */}
                {hasDiscrepancy && rec && (
                  <button
                    onClick={() => toggleExpand(d.id)}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? '收起差额详情' : '展开差额详情'}
                    style={{
                      padding: '4px 10px',
                      background: colors.dangerLight,
                      color: colors.danger,
                      border: 'none',
                      borderRadius: radius.sm,
                      cursor: 'pointer',
                      fontSize: font.sizes.xs,
                      fontWeight: font.weights.semibold,
                    }}
                  >
                    {isExpanded ? '▲ 收起' : '▼ 差额详情'}
                  </button>
                )}
              </div>

              {/* Expandable discrepancy details */}
              {isExpanded && hasDiscrepancy && rec && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: colors.dangerLight,
                  borderRadius: radius.md,
                  display: 'flex',
                  gap: 20,
                  flexWrap: 'wrap',
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>硬币差额</p>
                    <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.semibold, color: colors.danger }}>{fmtCurrency(Number(rec.coin_variance))}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>现金差额</p>
                    <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.semibold, color: colors.danger }}>{fmtCurrency(Number(rec.cash_variance))}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

