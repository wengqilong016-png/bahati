import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useAuth } from '../hooks/useAuth';

export function SettlementPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const [settlementDate, setSettlementDate] = useState(today);
  const [machinesVisited, setMachinesVisited] = useState('');
  const [totalCollections, setTotalCollections] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settlements = useLiveQuery(() =>
    db.settlements.orderBy('settlement_date').reverse().toArray()
  , []);

  const save = async (status: 'draft' | 'submitted') => {
    if (!user) return;
    setError(null);
    setSaving(true);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      await db.settlements.add({
        id,
        settlement_date: settlementDate,
        total_machines_visited: parseInt(machinesVisited, 10) || 0,
        total_collections: parseFloat(totalCollections) || 0,
        notes,
        status,
        sync_status: 'pending',
        created_at: now,
      });

      await db.sync_queue.add({
        table_name: 'daily_settlements',
        record_id: id,
        operation: 'insert',
        payload: JSON.stringify({
          id,
          settlement_date: settlementDate,
          total_machines_visited: parseInt(machinesVisited, 10) || 0,
          total_collections: parseFloat(totalCollections) || 0,
          notes,
          status,
        }),
        retry_count: 0,
        last_error: null,
        created_at: now,
      });

      setSaved(true);
      setMachinesVisited('');
      setTotalCollections('');
      setNotes('');
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save('submitted');
  };

  const handleSaveDraft = () => {
    void save('draft');
  };

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>Daily Settlement</h2>

      {saved && <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 12, borderRadius: 8, marginBottom: 16 }}>✅ Saved!</div>}
      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Settlement Date</label>
          <input
            type="date"
            value={settlementDate}
            onChange={e => setSettlementDate(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Machines Visited</label>
          <input
            type="number"
            value={machinesVisited}
            onChange={e => setMachinesVisited(e.target.value)}
            required
            min={0}
            placeholder="0"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 16, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Total Collections (IDR)</label>
          <input
            type="number"
            value={totalCollections}
            onChange={e => setTotalCollections(e.target.value)}
            required
            min={0}
            step="0.01"
            placeholder="0.00"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 16, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 15, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            style={{ flex: 1, padding: 14, background: '#fff', color: '#0066CC', border: '1px solid #0066CC', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            Save Draft
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{ flex: 1, padding: 14, background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            Submit
          </button>
        </div>
      </form>

      {/* Recent Settlements */}
      {settlements && settlements.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#333' }}>Recent Settlements</h3>
          {settlements.map(s => (
            <div key={s.id} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>{s.settlement_date}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: s.status === 'submitted' ? '#e3f2fd' : '#f5f5f5',
                  color: s.status === 'submitted' ? '#1565c0' : '#666',
                }}>
                  {s.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 13, color: '#555' }}>
                <span>Machines: {s.total_machines_visited}</span>
                <span>IDR {s.total_collections.toLocaleString()}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>
                Sync: {s.sync_status}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button onClick={() => navigate('/sync')} style={{ background: 'none', border: 'none', color: '#0066CC', fontSize: 13, cursor: 'pointer' }}>
          View Sync Status →
        </button>
      </div>
    </div>
  );
}
