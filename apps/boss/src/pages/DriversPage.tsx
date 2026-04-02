import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { supabase } from '../supabase';
import { fmtCurrency } from '../lib/format';
import { getTodayDarEsSalaam } from '../lib/utils';
import { colors, radius, shadow, font } from '../lib/theme';
import { CardListSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';

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

type FilterKey = 'all' | 'active' | 'inactive';

interface EditDriverForm {
  full_name: string;
  phone: string;
  license_plate: string;
  is_active: boolean;
}

export function DriversPage() {
  const { showToast } = useToast();
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [reconcMap, setReconcMap] = useState<Record<string, ReconciliationStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [editForm, setEditForm] = useState<EditDriverForm>({ full_name: '', phone: '', license_plate: '', is_active: true });
  const [saving, setSaving] = useState(false);

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

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    setLoading(true);
    const today = getTodayDarEsSalaam();
    const [driversRes, reconcRes] = await Promise.all([
      supabase.from('drivers').select('*').order('created_at', { ascending: false }),
      supabase.from('daily_driver_reconciliations').select('driver_id, status, coin_variance, cash_variance').eq('reconciliation_date', today),
    ]);

    if (!mountedRef.current) return;

    if (driversRes.error) setError(driversRes.error.message);
    else setDrivers(driversRes.data as Driver[]);

    const map: Record<string, ReconciliationStatus> = {};
    for (const r of (reconcRes.data ?? []) as ReconciliationStatus[]) {
      map[r.driver_id] = r;
    }
    setReconcMap(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openEdit = (d: Driver) => {
    setEditDriver(d);
    setEditForm({ full_name: d.full_name ?? '', phone: d.phone ?? '', license_plate: d.license_plate ?? '', is_active: d.is_active });
  };

  const closeEdit = () => { setEditDriver(null); setSaving(false); };

  const handleSave = async () => {
    if (!editDriver) return;
    setSaving(true);
    const { error: err } = await supabase.from('drivers').update({
      full_name: editForm.full_name.trim(),
      phone: editForm.phone.trim() || null,
      license_plate: editForm.license_plate.trim() || null,
      is_active: editForm.is_active,
    }).eq('id', editDriver.id);
    setSaving(false);
    if (err) {
      showToast(`保存失败: ${err.message}`, 'error');
    } else {
      showToast('司机资料已更新', 'success');
      closeEdit();
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
      showToast(err.message, 'error');
    } else if (data?.error) {
      showToast(data.error, 'error');
    } else {
      showToast(`司机 "${addName}" 创建成功`, 'success');
      closeAddModal();
      void fetchData();
    }
  };

  // --- Delete driver ---
  const handleDeleteDriver = async () => {
    if (!deletingDriver) return;
    setDeleting(true);
    setError(null);

    const { error: err } = await supabase.rpc('soft_delete_driver', {
      p_driver_id: deletingDriver.id,
    });

    setDeleting(false);
    if (err) {
      showToast(err.message, 'error');
    } else {
      showToast(`司机 "${deletingDriver.full_name}" 已停用`, 'success');
      setDeletingDriver(null);
      void fetchData();
    }
  };

  const filteredDrivers = drivers?.filter(d => {
    if (filter === 'active') return d.is_active;
    if (filter === 'inactive') return !d.is_active;
    return true;
  });

  // Counts per tab
  const counts: Record<FilterKey, number> = {
    all: drivers?.length ?? 0,
    active: drivers?.filter(d => d.is_active).length ?? 0,
    inactive: drivers?.filter(d => !d.is_active).length ?? 0,
  };

  const tabLabels: Record<FilterKey, string> = { all: '全部', active: '在线', inactive: '离线' };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: colors.primary, fontSize: font.sizes.xxl }}>司机管理</h2>
        <button
          onClick={() => setShowAddModal(true)}
          style={{ padding: '8px 18px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.md, cursor: 'pointer', fontWeight: font.weights.semibold, fontSize: font.sizes.sm }}
        >
          + 添加司机
        </button>
      </div>

      {error && (
        <div style={{ background: colors.dangerLight, color: colors.danger, padding: 12, borderRadius: radius.md, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Edit Driver Modal */}
      {editDriver && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="编辑司机资料"
          onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
        >
          <div style={{ background: colors.surface, borderRadius: radius.xl, padding: 28, maxWidth: 440, width: '92%', boxShadow: shadow.modal }}>
            <h3 style={{ margin: '0 0 18px', fontSize: font.sizes.xl, fontWeight: font.weights.bold }}>编辑司机资料</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>姓名 *</label>
                <input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>电话</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>车牌号</label>
                <input value={editForm.license_plate} onChange={e => setEditForm(f => ({ ...f, license_plate: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="edit-driver-active" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                <label htmlFor="edit-driver-active" style={{ fontSize: font.sizes.md, cursor: 'pointer' }}>在线（激活）</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closeEdit} style={{ flex: 1, padding: 10, background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.divider}`, borderRadius: radius.md, cursor: 'pointer', fontSize: font.sizes.md }}>
                取消
              </button>
              <button onClick={() => void handleSave()} disabled={saving || !editForm.full_name.trim()}
                style={{ flex: 1, padding: 10, background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.md, cursor: saving || !editForm.full_name.trim() ? 'not-allowed' : 'pointer', fontWeight: font.weights.semibold, fontSize: font.sizes.md, opacity: saving || !editForm.full_name.trim() ? 0.6 : 1 }}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Driver Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="添加新司机"
          onClick={e => { if (e.target === e.currentTarget) closeAddModal(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}
        >
          <form
            onSubmit={handleAddDriver}
            style={{ background: colors.surface, borderRadius: radius.xl, padding: 28, maxWidth: 440, width: '92%', boxShadow: shadow.modal }}
          >
            <h3 style={{ margin: '0 0 18px', fontSize: font.sizes.xl, fontWeight: font.weights.bold }}>添加新司机</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>姓名 *</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} required placeholder="例: John Doe"
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>邮箱 *</label>
                <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} required placeholder="driver@example.com"
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>初始密码 *</label>
                <input type="password" value={addPassword} onChange={e => setAddPassword(e.target.value)} required minLength={6} placeholder="至少6位"
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>电话</label>
                <input value={addPhone} onChange={e => setAddPhone(e.target.value)} placeholder="+255..."
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>车牌号</label>
                <input value={addPlate} onChange={e => setAddPlate(e.target.value)} placeholder="T 123 ABC"
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={closeAddModal} style={{ flex: 1, padding: 10, background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.divider}`, borderRadius: radius.md, cursor: 'pointer', fontSize: font.sizes.md }}>
                取消
              </button>
              <button type="submit" disabled={adding}
                style={{ flex: 1, padding: 10, background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.md, cursor: adding ? 'not-allowed' : 'pointer', fontWeight: font.weights.semibold, fontSize: font.sizes.md, opacity: adding ? 0.6 : 1 }}>
                {adding ? '创建中…' : '创建'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDriver && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="确认删除"
          onClick={e => { if (e.target === e.currentTarget) setDeletingDriver(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}
        >
          <div style={{ background: colors.surface, borderRadius: radius.xl, padding: 28, maxWidth: 400, width: '92%', boxShadow: shadow.modal }}>
            <h3 style={{ margin: '0 0 12px', color: colors.danger, fontSize: font.sizes.xl }}>确认删除</h3>
            <p style={{ margin: '0 0 8px', fontSize: font.sizes.md, color: colors.text }}>
              确定要停用司机 <strong>{deletingDriver.full_name}</strong> 吗？
            </p>
            <p style={{ margin: '0 0 20px', fontSize: font.sizes.sm, color: colors.textMuted }}>
              系统将检查该司机是否有未结算的任务、未完成的对账或待审批的分数重置申请。
              如果有，将无法停用。停用后，该司机将无法登录或执行任何操作。
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeletingDriver(null)}
                style={{ padding: '8px 18px', borderRadius: radius.md, border: `1px solid ${colors.divider}`, background: colors.surface, color: colors.textSecondary, cursor: 'pointer', fontWeight: font.weights.semibold, fontSize: font.sizes.sm }}>
                取消
              </button>
              <button onClick={() => void handleDeleteDriver()} disabled={deleting}
                style={{ padding: '8px 18px', borderRadius: radius.md, border: 'none', background: colors.danger, color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: font.weights.semibold, fontSize: font.sizes.sm, opacity: deleting ? 0.6 : 1 }}>
                {deleting ? '处理中…' : '确认停用'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }} role="tablist" aria-label="司机筛选">
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              borderRadius: radius.pill,
              border: filter === f ? 'none' : `1px solid ${colors.divider}`,
              background: filter === f ? colors.primary : colors.surface,
              color: filter === f ? '#fff' : colors.textSecondary,
              cursor: 'pointer',
              fontSize: font.sizes.sm,
              fontWeight: font.weights.semibold,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s ease',
            }}
          >
            {tabLabels[f]}
            {!loading && (
              <span style={{
                background: filter === f ? 'rgba(255,255,255,0.25)' : '#f0f0f0',
                color: filter === f ? '#fff' : colors.textMuted,
                borderRadius: radius.pill,
                padding: '1px 7px',
                fontSize: 11,
                fontWeight: font.weights.bold,
              }}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <CardListSkeleton count={4} />}

      {!loading && filteredDrivers && filteredDrivers.length === 0 && (
        <p style={{ color: colors.textDisabled, textAlign: 'center', padding: 40 }}>暂无司机数据</p>
      )}

      {/* Driver Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredDrivers?.map(d => {
          const rec = reconcMap[d.id];
          const hasDiscrepancy = rec && (Number(rec.coin_variance) !== 0 || Number(rec.cash_variance) !== 0);
          const isReconciled = rec && (rec.status === 'submitted' || rec.status === 'confirmed');
          const isExpanded = expandedIds.has(d.id);
          const accentColor = !d.is_active ? colors.textDisabled : hasDiscrepancy ? colors.danger : colors.primary;

          return (
            <div
              key={d.id}
              className="card-hover"
              style={{
                background: colors.surface,
                borderRadius: radius.lg,
                padding: '16px 18px',
                border: `1px solid ${colors.border}`,
                borderLeft: `4px solid ${accentColor}`,
                boxShadow: shadow.card,
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: font.weights.bold, fontSize: font.sizes.lg }}>{d.full_name || '(未命名)'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: font.sizes.sm, color: colors.textMuted }}>
                    {d.phone ?? '—'} · {d.license_plate ?? '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    onClick={() => openEdit(d)}
                    aria-label={`编辑司机 ${d.full_name}`}
                    style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.primaryLight, color: colors.primary, border: 'none', cursor: 'pointer' }}
                  >
                    ✎ 编辑
                  </button>
                  {d.is_active && (
                    <button
                      onClick={() => setDeletingDriver(d)}
                      aria-label={`停用司机 ${d.full_name}`}
                      style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.dangerLight, color: colors.danger, border: 'none', cursor: 'pointer' }}
                    >
                      🗑 停用
                    </button>
                  )}
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: radius.badge,
                    fontSize: font.sizes.xs,
                    fontWeight: font.weights.semibold,
                    background: d.is_active ? colors.successLight : '#f5f5f5',
                    color: d.is_active ? colors.success : colors.textSecondary,
                  }}>
                    {d.is_active ? '● 在线' : '○ 离线'}
                  </span>
                  {isReconciled && (
                    <span style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.successLight, color: colors.success }}>
                      ✓ 已日结
                    </span>
                  )}
                  {d.is_active && !isReconciled && (
                    <span style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.warningLight, color: colors.warning }}>
                      ⏳ 未日结
                    </span>
                  )}
                  {hasDiscrepancy && (
                    <span style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.dangerLight, color: colors.danger }}>
                      ⚠ 有差额
                    </span>
                  )}
                </div>
              </div>

              {/* Balance row */}
              <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>硬币余额</p>
                    <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.primary }}>{fmtCurrency(Number(d.coin_balance))}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>现金余额</p>
                    <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.success }}>{fmtCurrency(Number(d.cash_balance))}</p>
                  </div>
                </div>

                {/* Expand/collapse button (only if there's detail) */}
                {hasDiscrepancy && rec && (
                  <button
                    onClick={() => toggleExpand(d.id)}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? '收起差额详情' : '展开差额详情'}
                    style={{
                      padding: '4px 10px',
                      background: colors.dangerLight,
                      color: colors.danger,
                      border: 'none',
                      borderRadius: radius.sm,
                      cursor: 'pointer',
                      fontSize: font.sizes.xs,
                      fontWeight: font.weights.semibold,
                    }}
                  >
                    {isExpanded ? '▲ 收起' : '▼ 差额详情'}
                  </button>
                )}
              </div>

              {/* Expandable discrepancy details */}
              {isExpanded && hasDiscrepancy && rec && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: colors.dangerLight,
                  borderRadius: radius.md,
                  display: 'flex',
                  gap: 20,
                  flexWrap: 'wrap',
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>硬币差额</p>
                    <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.semibold, color: colors.danger }}>{fmtCurrency(Number(rec.coin_variance))}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>现金差额</p>
                    <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.semibold, color: colors.danger }}>{fmtCurrency(Number(rec.cash_variance))}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
