import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';

interface Reconciliation {
  id: string;
  driver_id: string;
  reconciliation_date: string;
  total_kiosks_visited: number;
  total_gross_revenue: number;
  notes: string | null;
  status: string;
  confirmed_at: string | null;
  drivers: { full_name: string | null } | null;
}

export function SettlementsPage() {
  const { user } = useAuth();
  const [reconciliations, setReconciliations] = useState<Reconciliation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReconciliations = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('daily_driver_reconciliations')
      .select('*, drivers(full_name)')
      .order('reconciliation_date', { ascending: false });

    if (err) setError(err.message);
    else setReconciliations(data as Reconciliation[]);
    setLoading(false);
  };

  useEffect(() => { void fetchReconciliations(); }, []);

  const handleConfirm = async (id: string) => {
    if (!user) return;
    const { error: err } = await supabase
      .from('daily_driver_reconciliations')
      .update({ status: 'confirmed', confirmed_by: user.id, confirmed_at: new Date().toISOString() })
      .eq('id', id);
    if (err) setError(err.message);
    else void fetchReconciliations();
  };

  const columns: Column<Record<string, unknown>>[] = [
    { key: 'reconciliation_date', header: 'Date', width: '110px' },
    {
      key: 'driver',
      header: 'Driver',
      render: row => {
        const s = row as unknown as Reconciliation;
        return s.drivers?.full_name ?? '—';
      },
    },
    { key: 'total_kiosks_visited', header: 'Kiosks', width: '80px' },
    {
      key: 'total_gross_revenue',
      header: 'Revenue',
      render: row => `IDR ${Number(row.total_gross_revenue).toLocaleString()}`,
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

  const rows = reconciliations as unknown as Record<string, unknown>[] | null;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>Daily Reconciliations</h2>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          keyField="id"
          emptyMessage="No reconciliations found."
        />
      </div>
    </div>
  );
}
