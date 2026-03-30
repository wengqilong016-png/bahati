import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db';

export function MachineListPage() {
  const machines = useLiveQuery(() => db.machines.toArray(), []);
  const navigate = useNavigate();

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <h2 style={{ margin: '0 0 16px', color: '#0066CC' }}>My Machines</h2>
      {!machines && <p style={{ color: '#666' }}>Loading...</p>}
      {machines && machines.length === 0 && (
        <p style={{ color: '#666', textAlign: 'center', marginTop: 40 }}>
          No machines assigned. Sync to fetch your machines.
        </p>
      )}
      {machines && machines.map(machine => (
        <div
          key={machine.id}
          onClick={() => navigate(`/machines/${machine.id}/task`)}
          style={{
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 10,
            padding: 16,
            marginBottom: 12,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{machine.merchant_name}</p>
              <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>{machine.location_name}</p>
              <p style={{ margin: '4px 0 0', color: '#999', fontSize: 12 }}>SN: {machine.serial_number}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0066CC' }}>
                {machine.last_recorded_score}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#999' }}>score</p>
              <span style={{
                display: 'inline-block',
                marginTop: 4,
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                background: machine.status === 'active' ? '#e6f4ea' : machine.status === 'maintenance' ? '#fff3e0' : '#fce8e6',
                color: machine.status === 'active' ? '#1e7e34' : machine.status === 'maintenance' ? '#e65100' : '#c62828',
              }}>
                {machine.status}
              </span>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); navigate(`/machines/${machine.id}/task`); }}
              style={{ flex: 1, padding: '8px', background: '#0066CC', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Daily Task
            </button>
            <button
              onClick={e => { e.stopPropagation(); navigate(`/machines/${machine.id}/score-reset`); }}
              style={{ flex: 1, padding: '8px', background: '#fff', color: '#0066CC', border: '1px solid #0066CC', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Score Reset
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
