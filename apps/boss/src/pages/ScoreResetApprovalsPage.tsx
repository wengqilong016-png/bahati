import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { colors, radius, shadow, font } from '../lib/theme';
import { CardListSkeleton } from '../components/Skeleton';

interface ScoreResetRequest {
  id: string;
  kiosk_id: string;
  driver_id: string;
  current_score: number;
  requested_new_score: number;
  reason: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  kiosks: { serial_number: string; merchants: { name: string } | null } | null;
  drivers: { full_name: string | null } | null;
}

const MIN_REJECT_CHARS = 5;

export function ScoreResetApprovalsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<ScoreResetRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('score_reset_requests')
      .select(`*, kiosks(serial_number, merchants(name)), drivers(full_name)`)
      .order('created_at', { ascending: false });

    if (err) setError(err.message);
    else setRequests(data as ScoreResetRequest[]);
    setLoading(false);
  };

  useEffect(() => { void fetchRequests(); }, []);

  const closeModal = useCallback(() => { setRejectId(null); setRejectReason(''); }, []);

  // Keyboard: Escape to close modal
  useEffect(() => {
    if (!rejectId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rejectId, closeModal]);

  const handleApprove = async (id: string) => {
    if (!user) return;
    setProcessing(true);
    const { error: err } = await supabase.rpc('approve_score_reset', { p_request_id: id });
    setProcessing(false);
    if (err) {
      setError(err.message);
      showToast(`审批失败: ${err.message}`, 'error');
    } else {
      showToast('已成功批准重置申请', 'success');
      void fetchRequests();
    }
  };

  const handleReject = async () => {
    if (!user || !rejectId) return;
    setProcessing(true);
    const { error: err } = await supabase.rpc('reject_score_reset', { p_request_id: rejectId, p_reason: rejectReason });
    setProcessing(false);
    if (err) {
      setError(err.message);
      showToast(`拒绝失败: ${err.message}`, 'error');
    } else {
      showToast('已拒绝重置申请', 'info');
      closeModal();
      void fetchRequests();
    }
  };

  const scoreDelta = (current: number, requested: number) => {
    const diff = requested - current;
    const sign = diff > 0 ? '+' : '';
    const col = diff > 0 ? colors.success : diff < 0 ? colors.danger : colors.textMuted;
    return <span style={{ color: col, fontWeight: font.weights.semibold }}>({sign}{diff})</span>;
  };

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
          aria-label="拒绝申请"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
        >
          <div
            className="modal-scale-in"
            style={{ background: colors.surface, borderRadius: radius.xl, padding: 28, maxWidth: 400, width: '90%', boxShadow: shadow.modal }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: font.sizes.xl, fontWeight: font.weights.bold }}>拒绝申请</h3>
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

      {loading && <CardListSkeleton count={3} />}

      {!loading && requests && requests.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: colors.success }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <p style={{ marginTop: 12, color: colors.textMuted }}>暂无待处理申请</p>
        </div>
      )}

      {!loading && requests && requests.map(req => {
        const isPending = req.status === 'pending';
        const topBarColor = req.status === 'pending' ? colors.warning : req.status === 'approved' ? colors.success : colors.danger;

        return (
          <div
            key={req.id}
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
            {/* Top color bar */}
            <div style={{ height: 4, background: topBarColor }} />

            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: font.weights.bold, fontSize: font.sizes.lg }}>
                    {req.kiosks?.merchants?.name ?? '—'}
                  </p>
                  <p style={{ margin: '4px 0 0', color: colors.textSecondary, fontSize: font.sizes.sm }}>
                    序列号: {req.kiosks?.serial_number ?? '—'} · 司机: {req.drivers?.full_name ?? '—'}
                  </p>
                  <p style={{ margin: '4px 0 0', color: colors.textMuted, fontSize: font.sizes.xs }}>
                    {new Date(req.created_at).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={req.status} />
              </div>

              {/* Score change display */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0', background: '#f8f9fa', borderRadius: radius.md, padding: 14 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>当前分数</p>
                  <p className="tabular-nums" style={{ margin: '4px 0 0', fontSize: 26, fontWeight: font.weights.bold, color: colors.warning }}>{req.current_score}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: colors.textDisabled }}>
                  <span style={{ fontSize: 20 }}>→</span>
                  <span style={{ fontSize: font.sizes.xs, marginTop: 2 }}>{scoreDelta(req.current_score, req.requested_new_score)}</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: font.sizes.xs, color: colors.textMuted }}>申请新分数</p>
                  <p className="tabular-nums" style={{ margin: '4px 0 0', fontSize: 26, fontWeight: font.weights.bold, color: colors.success }}>{req.requested_new_score}</p>
                </div>
              </div>

              <p style={{ margin: '0 0 8px', fontSize: font.sizes.md, color: colors.textSecondary }}>
                <strong style={{ color: colors.text }}>原因：</strong>{req.reason}
              </p>

              {req.rejection_reason && (
                <p style={{ margin: '0 0 8px', fontSize: font.sizes.sm, color: colors.danger, background: colors.dangerLight, padding: '8px 12px', borderRadius: radius.sm }}>
                  <strong>拒绝原因：</strong>{req.rejection_reason}
                </p>
              )}

              {isPending && (
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button
                    onClick={() => void handleApprove(req.id)}
                    disabled={processing}
                    aria-label="批准申请"
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: colors.success,
                      color: '#fff',
                      border: 'none',
                      borderRadius: radius.md,
                      cursor: processing ? 'not-allowed' : 'pointer',
                      fontWeight: font.weights.semibold,
                      fontSize: font.sizes.md,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      opacity: processing ? 0.7 : 1,
                    }}
                  >
                    <span aria-hidden="true">✓</span> 批准
                  </button>
                  <button
                    onClick={() => setRejectId(req.id)}
                    disabled={processing}
                    aria-label="拒绝申请"
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: colors.surface,
                      color: colors.danger,
                      border: `1px solid ${colors.danger}`,
                      borderRadius: radius.md,
                      cursor: processing ? 'not-allowed' : 'pointer',
                      fontWeight: font.weights.semibold,
                      fontSize: font.sizes.md,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span aria-hidden="true">✕</span> 拒绝
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

