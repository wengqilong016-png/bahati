import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';

interface DriverLedgerEntry {
  id: string;
  driver_id: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

interface Profile {
  id: string;
  full_name: string | null;
}

export function DriverLedgerPage() {
  const [entries, setEntries] = useState<DriverLedgerEntry[] | null>(null);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDriver, setFilterDriver] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('role', 'driver').then(({ data }) => {
      if (data) setDrivers(data as Profile[]);
    });
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    let query = supabase
      .from('driver_ledger_entries')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false });

    if (filterDriver) query = query.eq('driver_id', filterDriver);
    if (filterFrom) query = query.gte('created_at', filterFrom);
    if (filterTo) query = query.lte('created_at', filterTo + 'T23:59:59');

    const { data, error: err } = await query;
    if (err) setError(err.message);
    else setEntries(data as DriverLedgerEntry[]);
    setLoading(false);
  };

  useEffect(() => { void fetchEntries(); }, [filterDriver, filterFrom, filterTo]);

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'created_at',
      header: 'Date',
      render: row => new Date(String(row.created_at)).toLocaleDateString(),
      width: '100px',
    },
    {
      key: 'driver',
      header: 'Driver',
      render: row => {
        const e = row as unknown as DriverLedgerEntry;
        return e.profiles?.full_name ?? '—';
      },
    },
    { key: 'entry_type', header: 'Type', width: '110px' },
    {
      key: 'amount',
      header: 'Amount',
      render: row => {
        const amount = Number(row.amount);
        return (
          <span style={{ color: amount < 0 ? '#c62828' : '#1e7e34', fontWeight: 600 }}>
            {amount < 0 ? '' : '+'}IDR {amount.toLocaleString()}
          </span>
        );
      },
    },
    {
      key: 'balance_after',
      header: 'Balance After',
      render: row => `IDR ${Number(row.balance_after).toLocaleString()}`,
    },
    { key: 'description', header: 'Description' },
  ];

  const rows = entries as unknown as Record<string, unknown>[] | null;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>Driver Ledger</h2>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e0e0e0' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>Driver</label>
          <select
            value={filterDriver}
            onChange={e => setFilterDriver(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
          >
            <option value="">All Drivers</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0, 8)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>From</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>To</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }} />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button
            onClick={() => { setFilterDriver(''); setFilterFrom(''); setFilterTo(''); }}
            style={{ padding: '7px 14px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          keyField="id"
          emptyMessage="No ledger entries found."
        />
      </div>
    </div>
  );
}
