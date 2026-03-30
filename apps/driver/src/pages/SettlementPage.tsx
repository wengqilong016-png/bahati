import { useNavigate } from 'react-router-dom';

/**
 * SettlementPage — Placeholder.
 *
 * TODO [Phase 3]: Replace with daily reconciliation submission via Phase 2 RPC
 * `submit_daily_reconciliation(p_driver_id, p_reconciliation_date, ...)`.
 * The old "daily_settlements" table no longer exists; reconciliation is now
 * handled by `daily_driver_reconciliations` (Phase 2 authority).
 */
export function SettlementPage() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>Daily Reconciliation</h2>

      <div style={{ background: '#fff3e0', borderRadius: 8, padding: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 48, margin: 0 }}>🚧</p>
        <p style={{ margin: '12px 0 0', fontSize: 15, color: '#e65100', fontWeight: 600 }}>
          Coming Soon
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#888' }}>
          Daily reconciliation will be available in a future update (Phase 3).
        </p>
      </div>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button onClick={() => navigate('/sync')} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 13, cursor: 'pointer' }}>
          View Sync Status →
        </button>
      </div>
    </div>
  );
}
