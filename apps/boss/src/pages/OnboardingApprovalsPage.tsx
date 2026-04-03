import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { colors, radius, shadow, font } from '../lib/theme';
import { CardListSkeleton } from '../components/Skeleton';

interface OnboardingRecord {
  id: string;
  kiosk_id: string;
  driver_id: string;
  onboarding_type: string;
  photo_urls: string[];
  notes: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  kiosks: {
    serial_number: string;
    location_name: string | null;
    merchants: { name: string } | null;
  } | null;
  drivers: { full_name: string | null } | null;
}

const MIN_REJECT_CHARS = 5;

export function OnboardingApprovalsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [records, setRecords] = useState<OnboardingRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('kiosk_onboarding_records')
      .select(`*, kiosks(serial_number, location_name, merchants(name)), drivers(full_name)`)
      .order('created_at', { ascending: false });

    if (err) setError(err.message);
    else setRecords(data as OnboardingRecord[]);
    setLoading(false);
  };

  useEffect(() => { void fetchRecords(); }, []);

  const closeModal = useCallback(() => { setRejectId(null); setRejectReason(''); }, []);

  useEffect(() => {
    if (!rejectId && !lightboxUrl) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxUrl) setLightboxUrl(null);
        else closeModal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rejectId, lightboxUrl, closeModal]);

  const handleApprove = async (id: string) => {
    if (!user) return;
    setProcessing(true);
    const { error: err } = await supabase.rpc('approve_onboarding', { p_record_id: id });
    setProcessing(false);
    if (err) {
      setError(err.message);
      showToast(`审批失败: ${err.message}`, 'error');
    } else {
      showToast('已批准入网申请', 'success');
      void fetchRecords();
    }
  };

  const handleReject = async () => {
    if (!user || !rejectId) return;
    setProcessing(true);
    const { error: err } = await supabase.rpc('reject_onboarding', { p_record_id: rejectId, p_reason: rejectReason });
    setProcessing(false);
    if (err) {
      setError(err.message);
      showToast(`拒绝失败: ${err.message}`, 'error');
    } else {
      showToast('已拒绝入网申请', 'info');
      closeModal();
      void fetchRecords();
    }
  };

  const typeLabel = (t: string) => t === 'recertification' ? '复检' : '新入网';

  const photoUrl = (raw: string): string => {
    if (raw.startsWith('http')) return raw;
    const { data } = supabase.storage.from('onboarding-photos').getPublicUrl(raw);
    return data.publicUrl;
  };

  const pending = records?.filter(r => r.status === 'pending') ?? [];
  const resolved = records?.filter(r => r.status !== 'pending') ?? [];

  return (
    <>
      {error && (
        <div style={{ background: colors.dangerLight, color: colors.danger, padding: 12, borderRadius: radius.md, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="拒绝入网申请"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
        >
          <div
            className="modal-scale-in"
            style={{ background: colors.surface, borderRadius: radius.xl, padding: 28, maxWidth: 400, width: '90%', boxShadow: shadow.modal }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: font.sizes.xl, fontWeight: font.weights.bold }}>拒绝入网申请</h3>
            <p style={{ margin: '0 0 16px', fontSize: font.sizes.sm, color: colors.textMuted }}>请提供拒绝原因（Esc 取消）</p>
            <label style={{ display: 'block', marginBottom: 6, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
              拒绝原因 *
            </label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
              required
              placeholder="请输入拒绝原因…"
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${colors.divider}`, borderRadius: radius.sm, fontSize: font.sizes.md, boxSizing: 'border-box', resize: 'vertical', fontFamily: font.family }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 16 }}>
              <span style={{ fontSize: font.sizes.xs, color: rejectReason.length < MIN_REJECT_CHARS ? colors.warning : colors.success }}>
                已输入 {rejectReason.length} 字{rejectReason.length < MIN_REJECT_CHARS ? `，至少 ${MIN_REJECT_CHARS} 字` : ' ✓'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={closeModal}
                aria-label="取消"
                style={{ flex: 1, padding: '10px', background: colors.surface, color: colors.textSecondary, border: `1px solid ${colors.divider}`, borderRadius: radius.md, cursor: 'pointer', fontSize: font.sizes.md }}>
                取消
              </button>
              <button
                onClick={() => void handleReject()}
                disabled={processing || rejectReason.trim().length < MIN_REJECT_CHARS}
                aria-label="确认拒绝"
                style={{ flex: 1, padding: '10px', background: colors.danger, color: '#fff', border: 'none', borderRadius: radius.md, cursor: processing || rejectReason.trim().length < MIN_REJECT_CHARS ? 'not-allowed' : 'pointer', fontWeight: font.weights.semibold, opacity: processing || rejectReason.trim().length < MIN_REJECT_CHARS ? 0.6 : 1, fontSize: font.sizes.md }}>
                {processing ? '处理中…' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, cursor: 'zoom-out' }}
        >
          <img src={lightboxUrl} alt="入网照片" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: radius.md, objectFit: 'contain' }} />
        </div>
      )}

      {loading && <CardListSkeleton count={3} />}

      {!loading && records && records.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: colors.success }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <p style={{ marginTop: 12, color: colors.textMuted }}>暂无入网记录</p>
        </div>
      )}

      {/* Pending first */}
      {!loading && pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: font.sizes.lg, color: colors.warning }}>⏳ 待审批 ({pending.length})</h3>
          {pending.map(rec => renderCard(rec, true))}
        </div>
      )}

      {/* Resolved */}
      {!loading && resolved.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: font.sizes.lg, color: colors.textSecondary }}>历史记录 ({resolved.length})</h3>
          {resolved.map(rec => renderCard(rec, false))}
        </div>
      )}
    </>
  );

  function renderCard(rec: OnboardingRecord, isPending: boolean) {
    const topBarColor = rec.status === 'pending' ? colors.warning : rec.status === 'approved' ? colors.success : colors.danger;

    return (
      <div
        key={rec.id}
        className="card-hover"
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          marginBottom: 16,
          overflow: 'hidden',
          boxShadow: shadow.card,
        }}
      >
        <div style={{ height: 4, background: topBarColor }} />

        <div style={{ padding: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p style={{ margin: 0, fontWeight: font.weights.bold, fontSize: font.sizes.lg }}>
                {rec.kiosks?.merchants?.name ?? '—'}
              </p>
              <p style={{ margin: '4px 0 0', color: colors.textSecondary, fontSize: font.sizes.sm }}>
                序列号: {rec.kiosks?.serial_number ?? '—'} · 司机: {rec.drivers?.full_name ?? '—'}
              </p>
              <p style={{ margin: '4px 0 0', color: colors.textMuted, fontSize: font.sizes.xs }}>
                {rec.kiosks?.location_name ?? ''} · {new Date(rec.created_at).toLocaleString()}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: radius.badge,
                fontSize: font.sizes.xs,
                fontWeight: font.weights.semibold,
                background: rec.onboarding_type === 'recertification' ? colors.infoLight : colors.primaryLight,
                color: rec.onboarding_type === 'recertification' ? colors.info : colors.primary,
              }}>
                {typeLabel(rec.onboarding_type)}
              </span>
              <StatusBadge status={rec.status} />
            </div>
          </div>

          {/* Photos */}
          {rec.photo_urls && rec.photo_urls.length > 0 && (
            <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
              {rec.photo_urls.map((url, i) => (
                <img
                  key={i}
                  src={photoUrl(url)}
                  alt={`入网照片 ${i + 1}`}
                  onClick={() => setLightboxUrl(photoUrl(url))}
                  style={{
                    width: 80,
                    height: 80,
                    objectFit: 'cover',
                    borderRadius: radius.sm,
                    border: `1px solid ${colors.border}`,
                    cursor: 'zoom-in',
                  }}
                />
              ))}
            </div>
          )}

          {/* Notes */}
          {rec.notes && (
            <p style={{ margin: '0 0 8px', fontSize: font.sizes.md, color: colors.textSecondary }}>
              <strong style={{ color: colors.text }}>备注：</strong>{rec.notes}
            </p>
          )}

          {/* Rejection reason */}
          {rec.rejection_reason && (
            <p style={{ margin: '0 0 8px', fontSize: font.sizes.sm, color: colors.danger, background: colors.dangerLight, padding: '8px 12px', borderRadius: radius.sm }}>
              <strong>拒绝原因：</strong>{rec.rejection_reason}
            </p>
          )}

          {/* Action buttons */}
          {isPending && (
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => void handleApprove(rec.id)}
                disabled={processing}
                aria-label="批准入网"
                style={{
                  flex: 1, padding: '10px 16px', background: colors.success, color: '#fff',
                  border: 'none', borderRadius: radius.md,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontWeight: font.weights.semibold, fontSize: font.sizes.md,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: processing ? 0.7 : 1,
                }}
              >
                <span aria-hidden="true">✓</span> 批准
              </button>
              <button
                onClick={() => setRejectId(rec.id)}
                disabled={processing}
                aria-label="拒绝入网"
                style={{
                  flex: 1, padding: '10px 16px', background: colors.surface, color: colors.danger,
                  border: `1px solid ${colors.danger}`, borderRadius: radius.md,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontWeight: font.weights.semibold, fontSize: font.sizes.md,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span aria-hidden="true">✕</span> 拒绝
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
}
