import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { fmtCurrency, fmtPercent } from '../lib/format';
import { colors, radius, shadow, font } from '../lib/theme';
import { CardListSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';

interface Merchant {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  dividend_rate: number;
  retained_balance: number;
  debt_balance: number;
  created_at: string;
}

interface KioskRow {
  merchant_id: string;
}

type FilterKey = 'all' | 'active' | 'has_debt';

interface EditMerchantForm {
  name: string;
  contact_name: string;
  phone: string;
  address: string;
  is_active: boolean;
  dividend_rate: string;
}

export function MerchantsPage() {
  const { showToast } = useToast();
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [kioskCounts, setKioskCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [editMerchant, setEditMerchant] = useState<Merchant | null>(null);
  const [editForm, setEditForm] = useState<EditMerchantForm>({ name: '', contact_name: '', phone: '', address: '', is_active: true, dividend_rate: '0' });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);

    const [merchantsRes, kiosksRes, balancesRes] = await Promise.all([
      supabase.from('merchants').select('id, name, contact_name, phone, address, is_active, dividend_rate, created_at').order('name', { ascending: true }),
      supabase.from('kiosks').select('merchant_id'),
      supabase.rpc('read_merchant_balances'),
    ]);

    if (merchantsRes.error) { setError(merchantsRes.error.message); setLoading(false); return; }
    if (balancesRes.error) { setError('数据加载失败'); setLoading(false); return; }
    if (kiosksRes.error) { setError(kiosksRes.error.message); setLoading(false); return; }

    const balanceMap = new Map<string, { retained_balance: number; debt_balance: number }>();
    for (const s of (balancesRes.data ?? []) as { merchant_id: string; retained_balance: number; debt_balance: number }[]) {
      balanceMap.set(s.merchant_id, s);
    }

    const enriched = (merchantsRes.data as Omit<Merchant, 'retained_balance' | 'debt_balance'>[]).map(m => ({
      ...m,
      retained_balance: balanceMap.get(m.id)?.retained_balance ?? 0,
      debt_balance: balanceMap.get(m.id)?.debt_balance ?? 0,
    }));
    setMerchants(enriched);

    const counts: Record<string, number> = {};
    for (const k of (kiosksRes.data ?? []) as KioskRow[]) {
      counts[k.merchant_id] = (counts[k.merchant_id] ?? 0) + 1;
    }
    setKioskCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    void fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = (m: Merchant) => {
    setEditMerchant(m);
    setEditForm({
      name: m.name ?? '',
      contact_name: m.contact_name ?? '',
      phone: m.phone ?? '',
      address: m.address ?? '',
      is_active: m.is_active,
      dividend_rate: String((Number(m.dividend_rate) * 100).toFixed(1)),
    });
  };

  const closeEdit = () => { setEditMerchant(null); setSaving(false); };

  const handleSave = async () => {
    if (!editMerchant) return;
    const rate = parseFloat(editForm.dividend_rate) / 100;
    if (isNaN(rate) || rate < 0 || rate > 1) {
      showToast('分红比例必须在 0-100% 之间', 'error');
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.from('merchants').update({
      name: editForm.name.trim(),
      contact_name: editForm.contact_name.trim() || null,
      phone: editForm.phone.trim() || null,
      address: editForm.address.trim() || null,
      is_active: editForm.is_active,
      dividend_rate: rate,
    }).eq('id', editMerchant.id);
    setSaving(false);
    if (err) {
      showToast(`保存失败: ${err.message}`, 'error');
    } else {
      showToast('商家资料已更新', 'success');
      closeEdit();
      void fetchData();
    }
  };

  const filteredMerchants = merchants?.filter(m => {
    if (filter === 'active') return m.is_active;
    if (filter === 'has_debt') return Number(m.debt_balance) > 0;
    return true;
  });

  const counts: Record<FilterKey, number> = {
    all: merchants?.length ?? 0,
    active: merchants?.filter(m => m.is_active).length ?? 0,
    has_debt: merchants?.filter(m => Number(m.debt_balance) > 0).length ?? 0,
  };

  const tabLabels: Record<FilterKey, string> = { all: '全部', active: '活跃', has_debt: '有债务' };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 16px', color: colors.primary, fontSize: font.sizes.xxl }}>商家管理</h2>

      {error && (
        <div style={{ background: colors.dangerLight, color: colors.danger, padding: 12, borderRadius: radius.md, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Edit Merchant Modal */}
      {editMerchant && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="编辑商家资料"
          onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
        >
          <div style={{ background: colors.surface, borderRadius: radius.xl, padding: 28, maxWidth: 480, width: '92%', boxShadow: shadow.modal, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 18px', fontSize: font.sizes.xl, fontWeight: font.weights.bold }}>编辑商家资料</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>商家名称 *</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>联系人</label>
                <input value={editForm.contact_name} onChange={e => setEditForm(f => ({ ...f, contact_name: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>电话</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>地址</label>
                <input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>分红比例 (%)</label>
                <input type="number" min={0} max={100} step="0.1" value={editForm.dividend_rate} onChange={e => setEditForm(f => ({ ...f, dividend_rate: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="edit-merchant-active" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                <label htmlFor="edit-merchant-active" style={{ fontSize: font.sizes.md, cursor: 'pointer' }}>活跃（激活）</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closeEdit} style={{ flex: 1, padding: 10, background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.divider}`, borderRadius: radius.md, cursor: 'pointer', fontSize: font.sizes.md }}>
                取消
              </button>
              <button onClick={() => void handleSave()} disabled={saving || !editForm.name.trim()}
                style={{ flex: 1, padding: 10, background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.md, cursor: saving || !editForm.name.trim() ? 'not-allowed' : 'pointer', fontWeight: font.weights.semibold, fontSize: font.sizes.md, opacity: saving || !editForm.name.trim() ? 0.6 : 1 }}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }} role="tablist" aria-label="商家筛选">
        {(['all', 'active', 'has_debt'] as const).map(f => (
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

      {loading && <CardListSkeleton count={3} />}

      {!loading && filteredMerchants && filteredMerchants.length === 0 && (
        <p style={{ color: colors.textDisabled, textAlign: 'center', padding: 40 }}>暂无商家数据</p>
      )}

      {/* Merchant Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredMerchants?.map(m => {
          const hasDebt = Number(m.debt_balance) > 0;
          const accentColor = !m.is_active ? colors.textDisabled : hasDebt ? colors.warning : colors.success;

          return (
            <div
              key={m.id}
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
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: font.weights.bold, fontSize: font.sizes.lg }}>{m.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: font.sizes.sm, color: colors.textMuted }}>
                    {m.contact_name ?? '—'} · {m.phone ?? '—'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    onClick={() => openEdit(m)}
                    aria-label={`编辑商家 ${m.name}`}
                    style={{ padding: '3px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, background: colors.primaryLight, color: colors.primary, border: 'none', cursor: 'pointer' }}
                  >
                    ✎ 编辑
                  </button>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: radius.badge,
                    fontSize: font.sizes.xs,
                    fontWeight: font.weights.semibold,
                    background: m.is_active ? colors.successLight : '#f5f5f5',
                    color: m.is_active ? colors.success : colors.textSecondary,
                  }}>
                    {m.is_active ? '活跃' : '停用'}
                  </span>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: radius.badge,
                    fontSize: font.sizes.xs,
                    fontWeight: font.weights.semibold,
                    background: colors.infoLight,
                    color: colors.info,
                  }}>
                    {kioskCounts[m.id] ?? 0} 台机器
                  </span>
                </div>
              </div>

              {/* Financial details */}
              <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>分红比例</p>
                  <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.bold, color: colors.primary }}>{fmtPercent(Number(m.dividend_rate))}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>留存余额</p>
                  <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.bold, color: colors.success }}>{fmtCurrency(Number(m.retained_balance))}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>债务余额</p>
                  <p className="tabular-nums" style={{ margin: '2px 0 0', fontSize: font.sizes.base, fontWeight: font.weights.bold, color: hasDebt ? colors.danger : colors.textSecondary }}>{fmtCurrency(Number(m.debt_balance))}</p>
                </div>
              </div>

              {m.address && (
                <p style={{ margin: '10px 0 0', fontSize: font.sizes.sm, color: colors.textMuted }}>📍 {m.address}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

