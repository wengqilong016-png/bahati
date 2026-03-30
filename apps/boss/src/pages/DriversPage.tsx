import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

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

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [reconcMap, setReconcMap] = useState<Record<string, ReconciliationStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);

    const fetchData = async () => {
      setLoading(true);

      const [driversRes, reconcRes] = await Promise.all([
        supabase
          .from('drivers')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('daily_driver_reconciliations')
          .select('driver_id, status, coin_variance, cash_variance')
          .eq('reconciliation_date', today),
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

  const filteredDrivers = drivers?.filter(d => {
    if (filter === 'active') return d.is_active;
    if (filter === 'inactive') return !d.is_active;
    return true;
  });

  function fmtCurrency(n: number): string {
    return `IDR ${n.toLocaleString('id-ID')}`;
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 16px', color: '#0066CC', fontSize: 20 }}>司机管理</h2>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              borderRadius: 16,
              border: filter === f ? 'none' : '1px solid #ddd',
              background: filter === f ? '#0066CC' : '#fff',
              color: filter === f ? '#fff' : '#666',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {f === 'all' ? '全部' : f === 'active' ? '在线' : '离线'}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>Loading...</p>}

      {!loading && filteredDrivers && filteredDrivers.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>暂无司机数据</p>
      )}

      {/* Driver Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredDrivers?.map(d => {
          const rec = reconcMap[d.id];
          const hasDiscrepancy = rec && (Number(rec.coin_variance) !== 0 || Number(rec.cash_variance) !== 0);
          const isReconciled = rec && (rec.status === 'submitted' || rec.status === 'confirmed');

          return (
            <div
              key={d.id}
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '16px 18px',
                border: '1px solid #e0e0e0',
                borderLeft: `4px solid ${!d.is_active ? '#999' : hasDiscrepancy ? '#c62828' : '#0066CC'}`,
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{d.full_name || '(未命名)'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>
                    {d.phone ?? '—'} · {d.license_plate ?? '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    background: d.is_active ? '#e6f4ea' : '#f5f5f5',
                    color: d.is_active ? '#1e7e34' : '#666',
                  }}>
                    {d.is_active ? '在线' : '离线'}
                  </span>
                  {isReconciled && (
                    <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#e6f4ea', color: '#1e7e34' }}>
                      已日结
                    </span>
                  )}
                  {d.is_active && !isReconciled && (
                    <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#fff3e0', color: '#e65100' }}>
                      未日结
                    </span>
                  )}
                  {hasDiscrepancy && (
                    <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#fce8e6', color: '#c62828' }}>
                      有差额
                    </span>
                  )}
                </div>
              </div>

              {/* Balance row */}
              <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: '#888' }}>硬币余额</p>
                  <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: '#0066CC' }}>{fmtCurrency(Number(d.coin_balance))}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: '#888' }}>现金余额</p>
                  <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: '#1e7e34' }}>{fmtCurrency(Number(d.cash_balance))}</p>
                </div>
                {hasDiscrepancy && rec && (
                  <>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: '#888' }}>硬币差额</p>
                      <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color: '#c62828' }}>{fmtCurrency(Number(rec.coin_variance))}</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: '#888' }}>现金差额</p>
                      <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color: '#c62828' }}>{fmtCurrency(Number(rec.cash_variance))}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
