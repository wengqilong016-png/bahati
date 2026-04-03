import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { fmtCurrency } from '../lib/format';
import { useToast } from '../components/Toast';

interface Reconciliation {
  id: string;
  driver_id: string;
  reconciliation_date: string;
  total_kiosks_visited: number;
  total_gross_revenue: number;
  total_expense_amount: number;
  actual_coin_balance: number;
  actual_cash_balance: number;
  notes: string | null;
  status: string;
  confirmed_at: string | null;
  drivers: { full_name: string | null } | null;
}

export function SettlementsPage() {
  const [reconciliations, setReconciliations] = useState<Reconciliation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchReconciliations = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('daily_driver_reconciliations')
      .select('id, driver_id, reconciliation_date, total_kiosks_visited, total_gross_revenue, total_expense_amount, actual_coin_balance, actual_cash_balance, notes, status, confirmed_at, drivers(full_name)')
      .order('reconciliation_date', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setReconciliations(data as unknown as Reconciliation[]);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchReconciliations();
  }, []);

  const handleConfirm = async (id: string) => {
    setConfirmingId(id);
    const { error: err } = await supabase.rpc('confirm_daily_reconciliation', {
      p_reconciliation_id: id,
    });

    if (err) {
      setError(err.message);
      showToast(`确认失败: ${err.message}`, 'error');
    } else {
      setError(null);
      showToast('日结已确认', 'success');
      void fetchReconciliations();
    }
    setConfirmingId(null);
  };

  const columns: Column<Reconciliation>[] = [
    { key: 'reconciliation_date', header: '日期', width: '110px' },
    {
      key: 'driver',
      header: '司机',
      render: row => row.drivers?.full_name ?? '—',
    },
    { key: 'total_kiosks_visited', header: '机器数', width: '80px' },
    {
      key: 'total_gross_revenue',
      header: '收入',
      render: row => fmtCurrency(Number(row.total_gross_revenue)),
    },
    {
      key: 'total_expense_amount',
      header: '支出',
      render: row => fmtCurrency(Number(row.total_expense_amount)),
    },
    {
      key: 'status',
      header: '状态',
      render: row => <StatusBadge status={String(row.status)} />,
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      render: row => {
        if (row.status !== 'submitted') return null;
        const id = String(row.id);
        const disabled = confirmingId !== null;

        return (
          <button
            onClick={() => void handleConfirm(id)}
            disabled={disabled}
            style={{
              padding: '5px 12px',
              background: disabled ? '#9bbfa5' : '#1e7e34',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {confirmingId === id ? '确认中...' : '确认'}
          </button>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>日结管理</h2>

      {error && (
        <div
          style={{
            background: '#fce8e6',
            color: '#c62828',
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e0e0e0',
          overflow: 'hidden',
        }}
      >
        <DataTable
          columns={columns}
          rows={reconciliations}
          loading={loading}
          keyField="id"
          emptyMessage="暂无对账记录"
        />
      </div>
    </div>
  );
}
