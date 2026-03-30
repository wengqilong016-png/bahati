import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { fmtCurrency, fmtPercent } from '../lib/format';

interface Merchant {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  dividend_rate: number;
  // retained_balance and debt_balance are column-level REVOKED for
  // authenticated role (Phase 2). Values come from snapshot aggregation.
  retained_balance: number;
  debt_balance: number;
  created_at: string;
}

interface KioskRow {
  merchant_id: string;
}

export function MerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [kioskCounts, setKioskCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'has_debt'>('all');

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);

      const [merchantsRes, kiosksRes, snapshotsRes] = await Promise.all([
        supabase
          .from('merchants')
          .select('id, name, contact_name, phone, address, is_active, dividend_rate, created_at')
          .order('name', { ascending: true }),
        supabase
          .from('kiosks')
          .select('merchant_id'),
        // TODO [未指定]: merchants.retained_balance & debt_balance are column-level
        // REVOKED for authenticated. Use merchant_balance_snapshots as fallback.
        // A Boss-only SECURITY DEFINER read RPC should be created.
        supabase
          .from('merchant_balance_snapshots')
          .select('merchant_id, retained_balance, debt_balance')
          .order('snapshot_date', { ascending: false }),
      ]);

      if (cancelled) return;

      // Build balance map from latest snapshot per merchant
      const balanceMap = new Map<string, { retained_balance: number; debt_balance: number }>();
      for (const s of (snapshotsRes.data ?? []) as { merchant_id: string; retained_balance: number; debt_balance: number }[]) {
        if (!balanceMap.has(s.merchant_id)) {
          balanceMap.set(s.merchant_id, s);
        }
      }

      if (merchantsRes.error) {
        setError(merchantsRes.error.message);
      } else {
        // Merge balance data into merchant rows
        const enriched = (merchantsRes.data as Omit<Merchant, 'retained_balance' | 'debt_balance'>[]).map(m => ({
          ...m,
          retained_balance: balanceMap.get(m.id)?.retained_balance ?? 0,
          debt_balance: balanceMap.get(m.id)?.debt_balance ?? 0,
        }));
        setMerchants(enriched);
      }

      // Count kiosks per merchant
      const counts: Record<string, number> = {};
      for (const k of (kiosksRes.data ?? []) as KioskRow[]) {
        counts[k.merchant_id] = (counts[k.merchant_id] ?? 0) + 1;
      }
      setKioskCounts(counts);
      setLoading(false);
    };

    void fetchData();
    return () => { cancelled = true; };
  }, []);

  const filteredMerchants = merchants?.filter(m => {
    if (filter === 'active') return m.is_active;
    if (filter === 'has_debt') return Number(m.debt_balance) > 0;
    return true;
  });

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 16px', color: '#0066CC', fontSize: 20 }}>商家管理</h2>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'active', 'has_debt'] as const).map(f => (
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
            {f === 'all' ? '全部' : f === 'active' ? '活跃' : '有债务'}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>Loading...</p>}

      {!loading && filteredMerchants && filteredMerchants.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>暂无商家数据</p>
      )}

      {/* Merchant Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredMerchants?.map(m => {
          const hasDebt = Number(m.debt_balance) > 0;
          return (
            <div
              key={m.id}
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '16px 18px',
                border: '1px solid #e0e0e0',
                borderLeft: `4px solid ${!m.is_active ? '#999' : hasDebt ? '#e65100' : '#1e7e34'}`,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{m.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>
                    {m.contact_name ?? '—'} · {m.phone ?? '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    background: m.is_active ? '#e6f4ea' : '#f5f5f5',
                    color: m.is_active ? '#1e7e34' : '#666',
                  }}>
                    {m.is_active ? '活跃' : '停用'}
                  </span>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    background: '#e3f2fd',
                    color: '#1565c0',
                  }}>
                    {kioskCounts[m.id] ?? 0} 台机器
                  </span>
                </div>
              </div>

              {/* Financial details */}
              <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: '#888' }}>分红比例</p>
                  <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: '#0066CC' }}>{fmtPercent(Number(m.dividend_rate))}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: '#888' }}>留存余额</p>
                  <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: '#1e7e34' }}>{fmtCurrency(Number(m.retained_balance))}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: '#888' }}>债务余额</p>
                  <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: hasDebt ? '#c62828' : '#666' }}>{fmtCurrency(Number(m.debt_balance))}</p>
                </div>
              </div>

              {m.address && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#888' }}>📍 {m.address}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
