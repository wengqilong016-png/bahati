import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';
import { fmtCurrency } from '../lib/format';

interface DriverLedgerEntry {
  id: string;
  driver_id: string;
  txn_type: string;
  coin_amount: number;
  cash_amount: number;
  coin_balance_after: number;
  cash_balance_after: number;
  description: string | null;
  created_at: string;
  drivers: { full_name: string | null } | null;
}

interface DriverOption {
  id: string;
  full_name: string | null;
}

export function DriverLedgerPage() {
  const [entries, setEntries] = useState<DriverLedgerEntry[] | null>(null);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDriver, setFilterDriver] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    supabase.from('drivers').select('id, full_name').then(({ data }) => {
      if (data) setDrivers(data as DriverOption[]);
    });
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    let query = supabase
      .from('driver_fund_ledger')
      .select('*, drivers(full_name)')
      .order('created_at', { ascending: false });

    if (filterDriver) query = query.eq('driver_id', filterDriver);
    if (filterFrom) query = query.gte('created_at', filterFrom);
    if (filterTo) query = query.lte('created_at', filterTo + 'T23:59:59+03:00');

    const { data, error: err } = await query;
    if (err) setError(err.message);
    else setEntries(data as DriverLedgerEntry[]);
    setLoading(false);
  };

  useEffect(() => { void fetchEntries(); }, [filterDriver, filterFrom, filterTo]);

  const columns: Column<DriverLedgerEntry>[] = [
    {
      key: 'created_at',
      header: '日期',
      render: row => new Date(String(row.created_at)).toLocaleDateString(),
      width: '100px',
    },
    {
      key: 'driver',
      header: '司机',
      render: row => row.drivers?.full_name ?? '—',
    },
    { key: 'txn_type', header: '类型', width: '130px' },
    {
      key: 'coin_amount',
      header: '硬币',
      render: row => {
        const amount = Number(row.coin_amount);
        if (amount === 0) return '—';
        return (
          <span style={{ color: amount < 0 ? '#c62828' : '#1e7e34', fontWeight: 600 }}>
            {amount < 0 ? '' : '+'}{fmtCurrency(amount)}
          </span>
        );
      },
    },
    {
      key: 'cash_amount',
      header: '现金',
      render: row => {
        const amount = Number(row.cash_amount);
        if (amount === 0) return '—';
        return (
          <span style={{ color: amount < 0 ? '#c62828' : '#1e7e34', fontWeight: 600 }}>
            {amount < 0 ? '' : '+'}{fmtCurrency(amount)}
          </span>
        );
      },
    },
    {
      key: 'coin_balance_after',
      header: '硬币余额',
      render: row => fmtCurrency(Number(row.coin_balance_after)),
    },
    { key: 'description', header: '描述' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>司机台账</h2>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e0e0e0' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>司机</label>
          <select
            value={filterDriver}
            onChange={e => setFilterDriver(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
          >
            <option value="">全部司机</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0, 8)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>起始日期</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>截止日期</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }} />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button
            onClick={() => { setFilterDriver(''); setFilterFrom(''); setFilterTo(''); }}
            style={{ padding: '7px 14px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            清除
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          rows={entries}
          loading={loading}
          keyField="id"
          emptyMessage="暂无台账记录"
        />
      </div>
    </div>
  );
}
