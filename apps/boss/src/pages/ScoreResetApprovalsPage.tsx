import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';

interface ScoreResetRequest {
  id: string;
  machine_id: string;
  driver_id: string;
  current_score: number;
  requested_new_score: number;
  reason: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  machines: { serial_number: string; merchant_name: string } | null;
  profiles: { full_name: string | null } | null;
}

export function ScoreResetApprovalsPage() {
  const { user } = useAuth();
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
      .select(`
        *,
        machines(serial_number, merchant_name),
        profiles(full_name)
      `)
      .order('created_at', { ascending: false });

    if (err) setError(err.message);
    else setRequests(data as ScoreResetRequest[]);
    setLoading(false);
  };

  useEffect(() => { void fetchRequests(); }, []);

  const handleApprove = async (id: string) => {
    if (!user) return;
    setProcessing(true);
    const { error: err } = await supabase.rpc('approve_score_reset', {
      p_request_id: id,
      p_reviewer_id: user.id,
    });
    setProcessing(false);
    if (err) setError(err.message);
    else void fetchRequests();
  };

  const handleReject = async () => {
    if (!user || !rejectId) return;
    setProcessing(true);
    const { error: err } = await supabase.rpc('reject_score_reset', {
      p_request_id: rejectId,
      p_reviewer_id: user.id,
      p_reason: rejectReason,
    });
    setProcessing(false);
    if (err) {
      setError(err.message);
    } else {
      setRejectId(null);
      setRejectReason('');
      void fetchRequests();
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', color: '#0066CC' }}>Score Reset Approvals</h2>

      {error && <div style={{ background: '#fce8e6', color: '#c62828', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {/* Reject modal */}
      {rejectId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%' }}>
            <h3 style={{ margin: '0 0 16px' }}>Reject Request</h3>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Rejection Reason *</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
              required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setRejectId(null); setRejectReason(''); }} style={{ flex: 1, padding: '10px', background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={() => void handleReject()}
                disabled={processing || !rejectReason.trim()}
                style={{ flex: 1, padding: '10px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                {processing ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ color: '#666' }}>Loading requests...</p>}

      {!loading && requests && requests.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#1e7e34' }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <p style={{ marginTop: 12 }}>No score reset requests.</p>
        </div>
      )}

      {!loading && requests && requests.map(req => (
        <div
          key={req.id}
          style={{
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            borderLeft: `4px solid ${req.status === 'pending' ? '#e65100' : req.status === 'approved' ? '#1e7e34' : '#c62828'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>
                {req.machines?.merchant_name ?? 'Unknown Machine'}
              </p>
              <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
                Serial: {req.machines?.serial_number ?? '—'} · Driver: {req.profiles?.full_name ?? '—'}
              </p>
              <p style={{ margin: '4px 0 0', color: '#999', fontSize: 12 }}>
                {new Date(req.created_at).toLocaleString()}
              </p>
            </div>
            <StatusBadge status={req.status} />
          </div>

          <div style={{ display: 'flex', gap: 24, margin: '14px 0', background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: '#888' }}>Current Score</p>
              <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: '#e65100' }}>{req.current_score}</p>
            </div>
            <div style={{ fontSize: 24, alignSelf: 'center', color: '#bbb' }}>→</div>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: '#888' }}>Requested New Score</p>
              <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: '#1e7e34' }}>{req.requested_new_score}</p>
            </div>
          </div>

          <p style={{ margin: '0 0 8px', fontSize: 14, color: '#444' }}>
            <strong>Reason:</strong> {req.reason}
          </p>

          {req.rejection_reason && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#c62828' }}>
              <strong>Rejection:</strong> {req.rejection_reason}
            </p>
          )}

          {req.status === 'pending' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => void handleApprove(req.id)}
                disabled={processing}
                style={{ flex: 1, padding: '10px', background: '#1e7e34', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                ✅ Approve
              </button>
              <button
                onClick={() => setRejectId(req.id)}
                disabled={processing}
                style={{ flex: 1, padding: '10px', background: '#fff', color: '#c62828', border: '1px solid #c62828', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                ❌ Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
