import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';

interface Settlement {
  id: string;
  driver_id: string;
  settlement_date: string;
  total_machines_visited: number;
  total_collections: number;
  notes: string | null;
  status: string;
  confirmed_at: string | null;
  profiles: { full_name: string | null } | null;
}

export function SettlementsPage() {
  const { user } = useAuth();
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettlements = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('daily_settlements')
      .select('*, profiles(full_name)')
      .order('settlement_date', { ascending: false });

    if (err) setError(err.message);
    else setSettlements(data as Settlement[]);
    setLoading(false);
  };

  useEffect(() => { void fetchSettlements(); }, []);

  const handleConfirm = async (id: string) => {
    if (!user) return;
    const { error: err } = await supabase
      .from('daily_settlements')
      .update({ status: 'confirmed', confirmed_by: user.id, confirmed_at: new Date().toISOString() })
      .eq('id', id);
    if (err) setError(err.message);
    else void fetchSettlements();
  };

  const columns: Column<Record<string, unknown>>[] = [
    { key: 'settlement_date', header: 'Date', width: '110px' },
    {
      key: 'driver',
      header: 'Driver',
      render: row => {
        const s = row as unknown as Settlement;
        return s.profiles?.full_name ?? '—';
      },
    },
    { key: 'total_machines_visited', header: 'Machines', width: '80px' },
    {
      key: 'total_collections',
      header: 'Collections',
      render: row => `IDR ${Number(row.total_collections).toLocaleString()}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: row => <StatusBadge status={String(row.status)} />,
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      render: row => {
        if (row.status !== 'submitted') return null;
        return (
          <button
            onClick={() => void handleConfirm(String(row.id))}
            style={{ padding: '5px 12px', background: '#1e7e34', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Confirm
          </button>
        );
      },
    },
  ];

  const rows = settlements as unknown as Record<string, unknown>[] | null;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>Daily Settlements</h2>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          keyField="id"
          emptyMessage="No settlements found."
        />
      </div>
    </div>
  );
}
