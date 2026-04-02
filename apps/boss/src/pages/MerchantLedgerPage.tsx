import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';
import { fmtCurrency } from '../lib/format';

interface MerchantLedgerEntry {
  id: string;
  merchant_id: string;
  kiosk_id: string | null;
  txn_type: string;
  amount: number;
  retained_balance_after: number;
  debt_balance_after: number;
  description: string | null;
  created_at: string;
}

interface KioskOption {
  id: string;
  serial_number: string;
  merchants: { name: string } | { name: string }[] | null;
}

export function MerchantLedgerPage() {
  const [entries, setEntries] = useState<MerchantLedgerEntry[] | null>(null);
  const [kiosks, setKiosks] = useState<KioskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterKiosk, setFilterKiosk] = useState('');

  useEffect(() => {
    supabase.from('kiosks').select('id, serial_number, merchants(name)').then(({ data }) => {
      if (data) setKiosks(data as KioskOption[]);
    });
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    let query = supabase
      .from('merchant_ledger')
      .select('*')
      .order('created_at', { ascending: false });

    if (filterKiosk) query = query.eq('kiosk_id', filterKiosk);

    const { data, error: err } = await query;
    if (err) setError(err.message);
    else setEntries(data as MerchantLedgerEntry[]);
    setLoading(false);
  };

  useEffect(() => { void fetchEntries(); }, [filterKiosk]);

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'created_at',
      header: 'Date',
      render: row => new Date(String(row.created_at)).toLocaleDateString(),
      width: '100px',
    },
    { key: 'txn_type', header: 'Type', width: '140px' },
    {
      key: 'amount',
      header: 'Amount',
      render: row => {
        const amount = Number(row.amount);
        return (
          <span style={{ color: amount < 0 ? '#c62828' : '#1e7e34', fontWeight: 600 }}>
            {amount < 0 ? '' : '+'}{fmtCurrency(amount)}
          </span>
        );
      },
    },
    {
      key: 'retained_balance_after',
      header: 'Retained After',
      render: row => fmtCurrency(Number(row.retained_balance_after)),
    },
    {
      key: 'debt_balance_after',
      header: 'Debt After',
      render: row => fmtCurrency(Number(row.debt_balance_after)),
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
          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>Kiosk</label>
          <select
            value={filterKiosk}
            onChange={e => setFilterKiosk(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
          >
            <option value="">All Kiosks</option>
            {kiosks.map(k => {
              const merchantArr = Array.isArray(k.merchants) ? k.merchants : (k.merchants ? [k.merchants] : []);
              const merchantName = merchantArr.length > 0 ? merchantArr[0].name : '—';
              return (
                <option key={k.id} value={k.id}>{k.serial_number} – {merchantName}</option>
              );
            })}
          </select>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button
            onClick={() => setFilterKiosk('')}
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
