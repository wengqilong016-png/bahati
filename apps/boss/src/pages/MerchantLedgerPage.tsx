import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';

interface MerchantLedgerEntry {
  id: string;
  machine_id: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  snapshot_machine_serial: string;
  snapshot_merchant_name: string;
  created_at: string;
}

interface Machine {
  id: string;
  serial_number: string;
  merchant_name: string;
}

export function MerchantLedgerPage() {
  const [entries, setEntries] = useState<MerchantLedgerEntry[] | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMachine, setFilterMachine] = useState('');

  useEffect(() => {
    supabase.from('machines').select('id, serial_number, merchant_name').then(({ data }) => {
      if (data) setMachines(data as Machine[]);
    });
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    let query = supabase
      .from('merchant_ledger_entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (filterMachine) query = query.eq('machine_id', filterMachine);

    const { data, error: err } = await query;
    if (err) setError(err.message);
    else setEntries(data as MerchantLedgerEntry[]);
    setLoading(false);
  };

  useEffect(() => { void fetchEntries(); }, [filterMachine]);

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'created_at',
      header: 'Date',
      render: row => new Date(String(row.created_at)).toLocaleDateString(),
      width: '100px',
    },
    { key: 'snapshot_merchant_name', header: 'Merchant' },
    { key: 'snapshot_machine_serial', header: 'Serial', width: '90px' },
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
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>Merchant Ledger</h2>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {/* Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e0e0e0', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>Machine</label>
          <select
            value={filterMachine}
            onChange={e => setFilterMachine(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
          >
            <option value="">All Machines</option>
            {machines.map(m => (
              <option key={m.id} value={m.id}>{m.serial_number} – {m.merchant_name}</option>
            ))}
          </select>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button
            onClick={() => setFilterMachine('')}
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
          emptyMessage="No merchant ledger entries found."
        />
      </div>
    </div>
  );
}
