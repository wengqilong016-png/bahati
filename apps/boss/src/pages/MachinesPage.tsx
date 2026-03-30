import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';

interface Machine {
  id: string;
  serial_number: string;
  location_name: string;
  merchant_name: string;
  merchant_contact: string | null;
  status: string;
  last_recorded_score: number;
  assigned_driver_id: string | null;
}

const columns: Column<Record<string, unknown>>[] = [
  { key: 'serial_number', header: 'Serial #', width: '100px' },
  { key: 'merchant_name', header: 'Merchant' },
  { key: 'location_name', header: 'Location' },
  { key: 'last_recorded_score', header: 'Score', width: '80px' },
  {
    key: 'status',
    header: 'Status',
    render: row => <StatusBadge status={String(row.status)} />,
  },
  { key: 'merchant_contact', header: 'Contact' },
];

export function MachinesPage() {
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // New machine form state
  const [serial, setSerial] = useState('');
  const [location, setLocation] = useState('');
  const [merchant, setMerchant] = useState('');
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMachines = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('machines')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setMachines(data);
    setLoading(false);
  };

  useEffect(() => { void fetchMachines(); }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error: err } = await supabase.from('machines').insert({
      serial_number: serial,
      location_name: location,
      merchant_name: merchant,
      merchant_contact: contact || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setShowForm(false);
      setSerial(''); setLocation(''); setMerchant(''); setContact('');
      void fetchMachines();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error: err } = await supabase.from('machines').update({ status }).eq('id', id);
    if (err) setError(err.message);
    else void fetchMachines();
  };

  const rows = machines?.map(m => ({
    ...m,
    status: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusBadge status={m.status} />
        <select
          value={m.status}
          onChange={e => void updateStatus(m.id, e.target.value)}
          style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid #ddd' }}
        >
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="maintenance">maintenance</option>
        </select>
      </div>
    ),
  })) as unknown as Record<string, unknown>[] | null;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#0066CC' }}>Machines</h2>
        <button
          onClick={() => setShowForm(s => !s)}
          style={{ padding: '8px 18px', background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
        >
          {showForm ? 'Cancel' : '+ Add Machine'}
        </button>
      </div>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <form onSubmit={handleAdd} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px' }}>New Machine</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Serial Number *', value: serial, setter: setSerial, required: true },
              { label: 'Location *', value: location, setter: setLocation, required: true },
              { label: 'Merchant Name *', value: merchant, setter: setMerchant, required: true },
              { label: 'Contact', value: contact, setter: setContact, required: false },
            ].map(field => (
              <div key={field.label}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>{field.label}</label>
                <input
                  value={field.value}
                  onChange={e => field.setter(e.target.value)}
                  required={field.required}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: 16, padding: '9px 20px', background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            {saving ? 'Saving...' : 'Add Machine'}
          </button>
        </form>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          keyField="id"
          emptyMessage="No machines found."
        />
      </div>
    </div>
  );
}
