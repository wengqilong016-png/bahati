import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface Summary {
  totalMachines: number;
  pendingApprovals: number;
  todaySettlements: number;
}

function SummaryCard({ title, value, icon, color }: { title: string; value: number | string; icon: string; color: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '20px 24px',
      border: '1px solid #e0e0e0',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div>
        <p style={{ margin: 0, fontSize: 13, color: '#888' }}>{title}</p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color }}>{value}</p>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary>({ totalMachines: 0, pendingApprovals: 0, todaySettlements: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      const today = new Date().toISOString().slice(0, 10);

      const [machines, approvals, settlements] = await Promise.all([
        supabase.from('machines').select('id', { count: 'exact', head: true }),
        supabase.from('score_reset_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('daily_settlements').select('id', { count: 'exact', head: true }).eq('settlement_date', today),
      ]);

      setSummary({
        totalMachines: machines.count ?? 0,
        pendingApprovals: approvals.count ?? 0,
        todaySettlements: settlements.count ?? 0,
      });
      setLoading(false);
    };

    void fetchSummary();
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <h2 style={{ margin: '0 0 24px', color: '#0066CC' }}>Dashboard</h2>

      {loading ? (
        <p style={{ color: '#666' }}>Loading summary...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <SummaryCard title="Total Machines" value={summary.totalMachines} icon="🏪" color="#0066CC" />
          <SummaryCard title="Pending Approvals" value={summary.pendingApprovals} icon="⏳" color={summary.pendingApprovals > 0 ? '#e65100' : '#1e7e34'} />
          <SummaryCard title="Today's Settlements" value={summary.todaySettlements} icon="💰" color="#0066CC" />
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #e0e0e0' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#333' }}>Quick Links</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {[
            { label: 'Review Score Requests', href: '/approvals' },
            { label: 'View Settlements', href: '/settlements' },
            { label: 'Manage Machines', href: '/machines' },
            { label: 'Driver Ledger', href: '/ledger/drivers' },
            { label: 'Merchant Ledger', href: '/ledger/merchants' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              style={{
                padding: '8px 16px',
                background: '#e8f0fe',
                color: '#0066CC',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
