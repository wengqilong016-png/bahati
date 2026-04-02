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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  // Edit modal state
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [saving, setSaving] = useState(false);

  // Toggle-active loading state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Add driver modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPlate, setAddPlate] = useState('');
  const [adding, setAdding] = useState(false);

  // Delete confirmation state
  const [deletingDriver, setDeletingDriver] = useState<Driver | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // --- Add driver ---
  const closeAddModal = () => {
    setShowAddModal(false);
    setAddEmail('');
    setAddPassword('');
    setAddName('');
    setAddPhone('');
    setAddPlate('');
  };

  const handleAddDriver = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError(null);
    setSuccessMsg(null);

    const { data, error: err } = await supabase.functions.invoke('invite-driver', {
      body: {
        email: addEmail,
        password: addPassword,
        full_name: addName,
        phone: addPhone || undefined,
        license_plate: addPlate || undefined,
      },
    });

    setAdding(false);
    if (err) {
      setError(err.message);
    } else if (data?.error) {
      setError(data.error);
    } else {
      setSuccessMsg(`司机 "${addName}" 创建成功`);
      closeAddModal();
      void fetchData();
    }
  };

  // --- Delete driver ---
  const handleDeleteDriver = async () => {
    if (!deletingDriver) return;
    setDeleting(true);
    setError(null);
    setSuccessMsg(null);

    const { error: err } = await supabase.rpc('soft_delete_driver', {
      p_driver_id: deletingDriver.id,
    });

    setDeleting(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccessMsg(`司机 "${deletingDriver.full_name}" 已停用`);
      setDeletingDriver(null);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#0066CC', fontSize: 20 }}>司机管理</h2>
        <button
          onClick={() => setShowAddModal(true)}
          style={{ padding: '8px 18px', background: '#0066CC', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
        >
          + 添加司机
        </button>
      </div>

      {successMsg && (
        <div style={{ background: '#e6f4ea', color: '#1e7e34', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#1e7e34', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

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
                {d.is_active && (
                  <button
                    onClick={() => setDeletingDriver(d)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: '1px solid #c62828',
                      background: '#fff',
                      color: '#c62828',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    🗑 删除
                  </button>
                )}
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
      {/* Add Driver Modal */}
      {showAddModal && (
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
            onSubmit={handleAddDriver}
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 420,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 20px', color: '#0066CC', fontSize: 18 }}>添加新司机</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#333' }}>姓名 *</label>
              <input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                required
                placeholder="例: John Doe"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#333' }}>邮箱 *</label>
              <input
                type="email"
                value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                required
                placeholder="driver@example.com"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#333' }}>初始密码 *</label>
              <input
                type="password"
                value={addPassword}
                onChange={e => setAddPassword(e.target.value)}
                required
                minLength={6}
                placeholder="至少6位"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#333' }}>电话</label>
              <input
                value={addPhone}
                onChange={e => setAddPhone(e.target.value)}
                placeholder="+255..."
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#333' }}>车牌号</label>
              <input
                value={addPlate}
                onChange={e => setAddPlate(e.target.value)}
                placeholder="T 123 ABC"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeAddModal}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={adding}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0066CC', color: '#fff', cursor: adding ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, opacity: adding ? 0.6 : 1 }}
              >
                {adding ? '创建中...' : '创建'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDriver && (
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
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 400,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 12px', color: '#c62828', fontSize: 18 }}>确认删除</h3>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: '#333' }}>
              确定要停用司机 <strong>{deletingDriver.full_name}</strong> 吗？
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: '#888' }}>
              系统将检查该司机是否有未结算的任务、未完成的对账或待审批的分数重置申请。
              如果有，将无法停用。停用后，该司机将无法登录或执行任何操作。
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingDriver(null)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                取消
              </button>
              <button
                onClick={() => void handleDeleteDriver()}
                disabled={deleting}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#c62828', color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? '处理中...' : '确认停用'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
