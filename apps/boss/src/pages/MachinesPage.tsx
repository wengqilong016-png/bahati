import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';

interface Kiosk {
  id: string;
  serial_number: string;
  location_name: string;
  merchant_id: string;
  status: string;
  last_recorded_score: number;
  assigned_driver_id: string | null;
  merchants: { name: string; phone: string | null } | null;
}

interface MerchantOption {
  id: string;
  name: string;
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

export function KiosksPage() {
  const [kiosks, setKiosks] = useState<Kiosk[] | null>(null);
  const [merchantOptions, setMerchantOptions] = useState<MerchantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // New kiosk form state
  const [serial, setSerial] = useState('');
  const [location, setLocation] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchKiosks = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('kiosks')
      .select('*, merchants(name, phone)')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setKiosks(data as Kiosk[]);
    setLoading(false);
  };

  useEffect(() => {
    void fetchKiosks();
    // Load merchant options for the add form
    supabase.from('merchants').select('id, name').order('name').then(({ data }) => {
      if (data) setMerchantOptions(data as MerchantOption[]);
    });
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error: err } = await supabase.from('kiosks').insert({
      serial_number: serial,
      location_name: location,
      merchant_id: merchantId,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setShowForm(false);
      setSerial(''); setLocation(''); setMerchantId('');
      void fetchKiosks();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error: err } = await supabase.from('kiosks').update({ status }).eq('id', id);
    if (err) setError(err.message);
    else void fetchKiosks();
  };

  const rows = kiosks?.map(k => ({
    ...k,
    merchant_name: k.merchants?.name ?? '—',
    merchant_contact: k.merchants?.phone ?? '—',
    status: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusBadge status={k.status} />
        <select
          value={k.status}
          onChange={e => void updateStatus(k.id, e.target.value)}
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
        <h2 style={{ margin: 0, color: '#0066CC' }}>Kiosks</h2>
        <button
          onClick={() => setShowForm(s => !s)}
          style={{ padding: '8px 18px', background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
        >
          {showForm ? 'Cancel' : '+ Add Kiosk'}
        </button>
      </div>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <form onSubmit={handleAdd} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px' }}>New Kiosk</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Serial Number *</label>
              <input
                value={serial}
                onChange={e => setSerial(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Location *</label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Merchant *</label>
              <select
                value={merchantId}
                onChange={e => setMerchantId(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              >
                <option value="">Select merchant…</option>
                {merchantOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: 16, padding: '9px 20px', background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            {saving ? 'Saving...' : 'Add Kiosk'}
          </button>
        </form>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          keyField="id"
          emptyMessage="No kiosks found."
        />
      </div>
    </div>
  );
}
