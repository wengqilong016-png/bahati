import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db';

export function KioskListPage() {
  const kiosks = useLiveQuery(() => db.kiosks.toArray(), []);
  const navigate = useNavigate();

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <h2 style={{ margin: '0 0 16px', color: '#0066CC' }}>My Kiosks</h2>
      {!kiosks && <p style={{ color: '#666' }}>Loading...</p>}
      {kiosks && kiosks.length === 0 && (
        <p style={{ color: '#666', textAlign: 'center', marginTop: 40 }}>
          No kiosks assigned. Sync to fetch your kiosks.
        </p>
      )}
      {kiosks && kiosks.map(kiosk => (
        <div
          key={kiosk.id}
          onClick={() => navigate(`/kiosks/${kiosk.id}/task`)}
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
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{kiosk.merchant_name}</p>
              <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>{kiosk.location_name}</p>
              <p style={{ margin: '4px 0 0', color: '#999', fontSize: 12 }}>SN: {kiosk.serial_number}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0066CC' }}>
                {kiosk.last_recorded_score}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#999' }}>score</p>
              <span style={{
                display: 'inline-block',
                marginTop: 4,
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                background: kiosk.status === 'active' ? '#e6f4ea' : kiosk.status === 'maintenance' ? '#fff3e0' : '#fce8e6',
                color: kiosk.status === 'active' ? '#1e7e34' : kiosk.status === 'maintenance' ? '#e65100' : '#c62828',
              }}>
                {kiosk.status}
              </span>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); navigate(`/kiosks/${kiosk.id}/task`); }}
              style={{ flex: 1, padding: '8px', background: '#0066CC', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Daily Task
            </button>
            <button
              onClick={e => { e.stopPropagation(); navigate(`/kiosks/${kiosk.id}/score-reset`); }}
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
