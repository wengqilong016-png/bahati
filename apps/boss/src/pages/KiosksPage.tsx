import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '../supabase';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { colors, radius, shadow, font } from '../lib/theme';
import { useToast } from '../components/Toast';

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

interface OnboardingRecord {
  id: string;
  kiosk_id: string;
  onboarding_type: string;
  photo_urls: string[];
  notes: string | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
  drivers: { full_name: string | null } | null;
}

interface EditKioskForm {
  serial_number: string;
  location_name: string;
  merchant_id: string;
}

export function KiosksPage() {
  const { showToast } = useToast();
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

  // Edit kiosk state
  const [editKiosk, setEditKiosk] = useState<Kiosk | null>(null);
  const [editForm, setEditForm] = useState<EditKioskForm>({ serial_number: '', location_name: '', merchant_id: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Photo viewer state
  const [photoKiosk, setPhotoKiosk] = useState<Kiosk | null>(null);
  const [onboardingRecords, setOnboardingRecords] = useState<OnboardingRecord[] | null>(null);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

  const openEdit = (k: Kiosk) => {
    setEditKiosk(k);
    setEditForm({ serial_number: k.serial_number, location_name: k.location_name, merchant_id: k.merchant_id });
  };

  const closeEdit = () => { setEditKiosk(null); setEditSaving(false); };

  const handleEditSave = async () => {
    if (!editKiosk) return;
    setEditSaving(true);
    const { error: err } = await supabase.from('kiosks').update({
      serial_number: editForm.serial_number.trim(),
      location_name: editForm.location_name.trim(),
      merchant_id: editForm.merchant_id,
    }).eq('id', editKiosk.id);
    setEditSaving(false);
    if (err) {
      showToast(`保存失败: ${err.message}`, 'error');
    } else {
      showToast('机器信息已更新', 'success');
      closeEdit();
      void fetchKiosks();
    }
  };

  const openPhotos = async (k: Kiosk) => {
    setPhotoKiosk(k);
    setOnboardingRecords(null);
    setPhotosLoading(true);
    const { data, error: err } = await supabase
      .from('kiosk_onboarding_records')
      .select('id, kiosk_id, onboarding_type, photo_urls, notes, status, reviewed_at, created_at, drivers(full_name)')
      .eq('kiosk_id', k.id)
      .order('created_at', { ascending: false });
    setPhotosLoading(false);
    if (err) {
      showToast(`加载照片失败: ${err.message}`, 'error');
    } else {
      setOnboardingRecords(data as unknown as OnboardingRecord[]);
    }
  };

  const closePhotos = () => { setPhotoKiosk(null); setOnboardingRecords(null); setLightboxUrl(null); };

  const columns: Column<Record<string, unknown>>[] = [
    { key: 'serial_number', header: '序列号', width: '110px' },
    { key: 'merchant_name', header: '商家' },
    { key: 'location_name', header: '地点' },
    { key: 'last_recorded_score', header: '分数', width: '80px' },
    {
      key: 'status',
      header: '状态',
      render: row => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={String(row.status)} />
          <select
            value={String(row.status)}
            onChange={e => void updateStatus(String(row.id), e.target.value)}
            style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid #ddd' }}
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="maintenance">maintenance</option>
          </select>
        </div>
      ),
    },
    { key: 'merchant_contact', header: '联系方式' },
    {
      key: 'actions',
      header: '',
      width: '160px',
      render: row => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => openEdit(row as unknown as Kiosk)}
            style={{ padding: '4px 10px', fontSize: 12, background: colors.primaryLight, color: colors.primary, border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontWeight: 600 }}
          >
            ✎ 编辑
          </button>
          <button
            onClick={() => void openPhotos(row as unknown as Kiosk)}
            style={{ padding: '4px 10px', fontSize: 12, background: colors.infoLight, color: colors.info, border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontWeight: 600 }}
          >
            📷 照片
          </button>
        </div>
      ),
    },
  ];

  const rows = kiosks?.map(k => ({
    ...k,
    merchant_name: k.merchants?.name ?? '—',
    merchant_contact: k.merchants?.phone ?? '—',
  })) as unknown as Record<string, unknown>[] | null;

  const typeLabel: Record<string, string> = { initial: '首次进场', recertification: '复检' };
  const statusColor: Record<string, string> = { pending: colors.warning, approved: colors.success, rejected: colors.danger };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: colors.primary }}>机器管理</h2>
        <button
          onClick={() => setShowForm(s => !s)}
          style={{ padding: '8px 18px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.md, cursor: 'pointer', fontWeight: 600 }}
        >
          {showForm ? '取消' : '+ 添加机器'}
        </button>
      </div>

      {error && <div style={{ background: colors.dangerLight, color: colors.danger, padding: 12, borderRadius: radius.md, marginBottom: 16 }}>{error}</div>}

      {/* Add Kiosk Form */}
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px' }}>新增机器</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>序列号 *</label>
              <input value={serial} onChange={e => setSerial(e.target.value)} required
                style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>地点 *</label>
              <input value={location} onChange={e => setLocation(e.target.value)} required
                style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>商家 *</label>
              <select value={merchantId} onChange={e => setMerchantId(e.target.value)} required
                style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }}>
                <option value="">选择商家…</option>
                {merchantOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving}
            style={{ marginTop: 16, padding: '9px 20px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.md, cursor: 'pointer', fontWeight: 600 }}>
            {saving ? '保存中…' : '添加机器'}
          </button>
        </form>
      )}

      {/* Edit Kiosk Modal */}
      {editKiosk && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="编辑机器信息"
          onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
        >
          <div style={{ background: colors.surface, borderRadius: radius.xl, padding: 28, maxWidth: 440, width: '92%', boxShadow: shadow.modal }}>
            <h3 style={{ margin: '0 0 18px', fontSize: font.sizes.xl, fontWeight: font.weights.bold }}>编辑机器信息</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>序列号 *</label>
                <input value={editForm.serial_number} onChange={e => setEditForm(f => ({ ...f, serial_number: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>地点 *</label>
                <input value={editForm.location_name} onChange={e => setEditForm(f => ({ ...f, location_name: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>商家 *</label>
                <select value={editForm.merchant_id} onChange={e => setEditForm(f => ({ ...f, merchant_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box' }}>
                  <option value="">选择商家…</option>
                  {merchantOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closeEdit} style={{ flex: 1, padding: 10, background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.divider}`, borderRadius: radius.md, cursor: 'pointer', fontSize: font.sizes.md }}>
                取消
              </button>
              <button onClick={() => void handleEditSave()} disabled={editSaving || !editForm.serial_number.trim() || !editForm.location_name.trim() || !editForm.merchant_id}
                style={{ flex: 1, padding: 10, background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.md, cursor: 'pointer', fontWeight: font.weights.semibold, fontSize: font.sizes.md, opacity: editSaving ? 0.6 : 1 }}>
                {editSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Viewer Modal */}
      {photoKiosk && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="进场照片"
          onClick={e => { if (e.target === e.currentTarget) closePhotos(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, overflowY: 'auto', padding: '32px 16px' }}
        >
          <div style={{ background: colors.surface, borderRadius: radius.xl, padding: 24, maxWidth: 680, width: '100%', boxShadow: shadow.modal }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: font.sizes.xl, fontWeight: font.weights.bold }}>进场照片</h3>
                <p style={{ margin: '4px 0 0', fontSize: font.sizes.sm, color: colors.textMuted }}>
                  {photoKiosk.serial_number} · {photoKiosk.merchants?.name ?? '—'}
                </p>
              </div>
              <button onClick={closePhotos} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: colors.textMuted, lineHeight: 1 }}>✕</button>
            </div>

            {photosLoading && <p style={{ textAlign: 'center', color: colors.textMuted, padding: 40 }}>加载中…</p>}

            {!photosLoading && onboardingRecords && onboardingRecords.length === 0 && (
              <p style={{ textAlign: 'center', color: colors.textDisabled, padding: 40 }}>暂无进场记录</p>
            )}

            {!photosLoading && onboardingRecords?.map(rec => {
              const driverRaw = rec.drivers;
              const driverName = Array.isArray(driverRaw)
                ? (driverRaw[0] as { full_name: string | null } | undefined)?.full_name ?? '—'
                : driverRaw?.full_name ?? '—';
              return (
                <div key={rec.id} style={{ marginBottom: 20, borderBottom: `1px solid ${colors.borderLight}`, paddingBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <div>
                      <span style={{ fontWeight: font.weights.semibold, fontSize: font.sizes.sm }}>
                        {typeLabel[rec.onboarding_type] ?? rec.onboarding_type}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: font.sizes.xs, color: colors.textMuted }}>司机: {driverName}</span>
                      <span style={{ marginLeft: 8, fontSize: font.sizes.xs, color: colors.textMuted }}>
                        {new Date(rec.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <span style={{
                      padding: '2px 10px', borderRadius: radius.badge, fontSize: font.sizes.xs, fontWeight: font.weights.semibold,
                      background: (statusColor[rec.status] ?? colors.textMuted) + '22',
                      color: statusColor[rec.status] ?? colors.textMuted,
                    }}>
                      {rec.status === 'pending' ? '待审' : rec.status === 'approved' ? '已批准' : rec.status === 'rejected' ? '已拒绝' : rec.status}
                    </span>
                  </div>

                  {rec.photo_urls.length === 0 ? (
                    <p style={{ fontSize: font.sizes.sm, color: colors.textDisabled }}>无照片</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                      {rec.photo_urls.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`照片 ${i + 1}`}
                          onClick={() => setLightboxUrl(url)}
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: radius.sm, cursor: 'zoom-in', border: `1px solid ${colors.borderLight}` }}
                        />
                      ))}
                    </div>
                  )}

                  {rec.notes && (
                    <p style={{ margin: '8px 0 0', fontSize: font.sizes.sm, color: colors.textSecondary }}>备注: {rec.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, cursor: 'zoom-out' }}
        >
          <img src={lightboxUrl} alt="放大图" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: radius.md }} />
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: radius.lg, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          keyField="id"
          emptyMessage="暂无机器数据"
        />
      </div>
    </div>
  );
}
