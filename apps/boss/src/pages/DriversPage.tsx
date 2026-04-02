import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '../supabase';
import { fmtCurrency } from '../lib/format';

interface Driver {
  id: string;
  full_name: string;
  phone: string | null;
  license_plate: string | null;
  is_active: boolean;
  coin_balance: number;
  cash_balance: number;
  created_at: string;
}

interface ReconciliationStatus {
  driver_id: string;
  status: string;
  coin_variance: number;
  cash_variance: number;
}

type FilterType = 'all' | 'active' | 'inactive';

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [reconcMap, setReconcMap] = useState<Record<string, ReconciliationStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  // Edit modal state
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [saving, setSaving] = useState(false);

  // Toggle-active loading state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    const [driversRes, reconcRes] = await Promise.all([
      supabase
        .from('drivers')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('daily_driver_reconciliations')
        .select('driver_id, status, coin_variance, cash_variance')
        .eq('reconciliation_date', today),
    ]);

    if (driversRes.error) setError(driversRes.error.message);
    else setDrivers(driversRes.data as Driver[]);

    const map: Record<string, ReconciliationStatus> = {};
    for (const r of (reconcRes.data ?? []) as ReconciliationStatus[]) {
      map[r.driver_id] = r;
    }
    setReconcMap(map);
    setLoading(false);
  };

  useEffect(() => { void fetchData(); }, []);

  const filteredDrivers = drivers?.filter(d => {
    if (filter === 'active') return d.is_active;
    if (filter === 'inactive') return !d.is_active;
    return true;
  });

  const openEdit = (d: Driver) => {
    setEditingDriver(d);
    setEditName(d.full_name);
    setEditPhone(d.phone ?? '');
    setEditPlate(d.license_plate ?? '');
    setError(null);
  };

  const closeEdit = () => {
    setEditingDriver(null);
    setEditName('');
    setEditPhone('');
    setEditPlate('');
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    setSaving(true);
    setError(null);

    const { error: err } = await supabase.rpc('update_driver_info', {
      p_driver_id: editingDriver.id,
      p_full_name: editName || null,
      p_phone: editPhone || null,
      p_license_plate: editPlate || null,
    });

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      closeEdit();
      void fetchData();
    }
  };

  const handleToggleActive = async (d: Driver) => {
    setTogglingId(d.id);
    setError(null);

    const { error: err } = await supabase.rpc('toggle_driver_active', {
      p_driver_id: d.id,
      p_is_active: !d.is_active,
    });

    setTogglingId(null);
    if (err) {
      setError(err.message);
    } else {
      void fetchData();
    }
  };

  const counts = {
    all: drivers?.length ?? 0,
    active: drivers?.filter(d => d.is_active).length ?? 0,
    inactive: drivers?.filter(d => !d.is_active).length ?? 0,
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 16px', color: '#0066CC', fontSize: 20 }}>司机管理</h2>

      {error && (
        <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Status summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {([
          { key: 'all' as FilterType, label: '全部', color: '#0066CC' },
          { key: 'active' as FilterType, label: '在线', color: '#1e7e34' },
          { key: 'inactive' as FilterType, label: '离线', color: '#666' },
        ]).map(s => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            style={{
              background: filter === s.key ? s.color : '#fff',
              color: filter === s.key ? '#fff' : s.color,
              border: filter === s.key ? 'none' : `1px solid ${s.color}`,
              borderRadius: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{counts[s.key]}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600 }}>{s.label}</p>
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>Loading...</p>}

      {!loading && filteredDrivers && filteredDrivers.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>暂无司机数据</p>
      )}

      {/* Driver Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredDrivers?.map(d => {
          const rec = reconcMap[d.id];
          const hasDiscrepancy = rec && (Number(rec.coin_variance) !== 0 || Number(rec.cash_variance) !== 0);
          const isReconciled = rec && (rec.status === 'submitted' || rec.status === 'confirmed');

          return (
            <div
              key={d.id}
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: '16px 18px',
                border: '1px solid #e0e0e0',
                borderLeft: `4px solid ${!d.is_active ? '#999' : hasDiscrepancy ? '#c62828' : '#0066CC'}`,
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{d.full_name || '(未命名)'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>
                    {d.phone ?? '—'} · {d.license_plate ?? '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    background: d.is_active ? '#e6f4ea' : '#f5f5f5',
                    color: d.is_active ? '#1e7e34' : '#666',
                  }}>
                    {d.is_active ? '在线' : '离线'}
                  </span>
                  {isReconciled && (
                    <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#e6f4ea', color: '#1e7e34' }}>
                      已日结
                    </span>
                  )}
                  {d.is_active && !isReconciled && (
                    <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#fff3e0', color: '#e65100' }}>
                      未日结
                    </span>
                  )}
                  {hasDiscrepancy && (
                    <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#fce8e6', color: '#c62828' }}>
                      有差额
                    </span>
                  )}
                </div>
              </div>

              {/* Balance row */}
              <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: '#888' }}>硬币余额</p>
                  <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: '#0066CC' }}>{fmtCurrency(Number(d.coin_balance))}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: '#888' }}>现金余额</p>
                  <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: '#1e7e34' }}>{fmtCurrency(Number(d.cash_balance))}</p>
                </div>
                {hasDiscrepancy && rec && (
                  <>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: '#888' }}>硬币差额</p>
                      <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color: '#c62828' }}>{fmtCurrency(Number(rec.coin_variance))}</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: '#888' }}>现金差额</p>
                      <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color: '#c62828' }}>{fmtCurrency(Number(rec.cash_variance))}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => openEdit(d)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid #0066CC',
                    background: '#fff',
                    color: '#0066CC',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ✏️ 编辑
                </button>
                <button
                  onClick={() => void handleToggleActive(d)}
                  disabled={togglingId === d.id}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: `1px solid ${d.is_active ? '#c62828' : '#1e7e34'}`,
                    background: '#fff',
                    color: d.is_active ? '#c62828' : '#1e7e34',
                    cursor: togglingId === d.id ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    opacity: togglingId === d.id ? 0.5 : 1,
                  }}
                >
                  {togglingId === d.id ? '...' : d.is_active ? '🚫 停用' : '✅ 启用'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingDriver && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }}>
          <form
            onSubmit={handleSaveEdit}
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 420,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 20px', color: '#0066CC', fontSize: 18 }}>编辑司机</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#333' }}>姓名 *</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#333' }}>电话</label>
              <input
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="+255..."
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#333' }}>车牌号</label>
              <input
                value={editPlate}
                onChange={e => setEditPlate(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeEdit}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0066CC', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
