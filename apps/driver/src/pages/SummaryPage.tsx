import { useState, useEffect } from 'react';
import { db } from '../lib/db';
import type { LocalTask, LocalScoreResetRequest, LocalKioskOnboarding, LocalKiosk } from '../lib/types';
import { getTodayDarEsSalaam, getDateDarEsSalaam } from '../lib/utils';

export function SummaryPage() {
  const today = getTodayDarEsSalaam();

  const [tasks, setTasks] = useState<(LocalTask & { kiosk?: LocalKiosk })[]>([]);
  const [resets, setResets] = useState<(LocalScoreResetRequest & { kiosk?: LocalKiosk })[]>([]);
  const [onboardings, setOnboardings] = useState<LocalKioskOnboarding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Today's tasks
      const todayTasks = await db.tasks.where('task_date').equals(today).toArray();
      const kioskIds = [...new Set([
        ...todayTasks.map(t => t.kiosk_id),
      ])];
      const kiosks = await db.kiosks.where('id').anyOf(kioskIds).toArray();
      const kioskMap = new Map(kiosks.map(k => [k.id, k]));

      const enrichedTasks = todayTasks.map(t => ({ ...t, kiosk: kioskMap.get(t.kiosk_id) }));

      // Today's resets
      const allResets = await db.score_reset_requests.toArray();
      const todayResets = allResets.filter(r => getDateDarEsSalaam(r.created_at) === today);
      const resetKioskIds = [...new Set(todayResets.map(r => r.kiosk_id))];
      const resetKiosks = resetKioskIds.length > 0
        ? await db.kiosks.where('id').anyOf(resetKioskIds).toArray()
        : [];
      const resetKioskMap = new Map(resetKiosks.map(k => [k.id, k]));
      const enrichedResets = todayResets.map(r => ({ ...r, kiosk: resetKioskMap.get(r.kiosk_id) }));

      // Today's onboardings
      const allOnboardings = await db.kiosk_onboarding_records.toArray();
      const todayOnboardings = allOnboardings.filter(o => getDateDarEsSalaam(o.created_at) === today);

      if (!cancelled) {
        setTasks(enrichedTasks);
        setResets(enrichedResets);
        setOnboardings(todayOnboardings);
        setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [today]);

  if (loading) {
    return <div style={{ padding: 16, color: '#666' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <h2 style={{ margin: '0 0 4px', color: '#0066CC' }}>My Daily Summary</h2>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666' }}>{today}</p>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <MiniStat label="Tasks" value={tasks.length} color="#0066CC" />
        <MiniStat label="Resets" value={resets.length} color="#7b1fa2" />
        <MiniStat label="Onboard" value={onboardings.length} color="#1e7e34" />
      </div>

      {/* Tasks list */}
      <Section title={`Tasks (${tasks.length})`}>
        {tasks.length === 0 && <EmptyMsg text="No tasks recorded today" />}
        {tasks.map(t => (
          <div key={t.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t.kiosk?.merchant_name ?? t.kiosk_id.slice(0, 8)}</span>
              <SyncBadge status={t.sync_status} />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#555' }}>
              Score: {t.current_score} · {t.photo_urls.length} photo(s)
            </p>
            {t.notes && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>{t.notes}</p>}
          </div>
        ))}
      </Section>

      {/* Resets list */}
      <Section title={`Reset Requests (${resets.length})`}>
        {resets.length === 0 && <EmptyMsg text="No reset requests today" />}
        {resets.map(r => (
          <div key={r.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{r.kiosk?.merchant_name ?? r.kiosk_id.slice(0, 8)}</span>
              <SyncBadge status={r.sync_status} />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#555' }}>
              {r.current_score} → {r.requested_new_score}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>{r.reason}</p>
          </div>
        ))}
      </Section>

      {/* Onboardings */}
      <Section title={`Onboardings (${onboardings.length})`}>
        {onboardings.length === 0 && <EmptyMsg text="No onboardings today" />}
        {onboardings.map(o => (
          <div key={o.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{o.onboarding_type}</span>
              <SyncBadge status={o.sync_status} />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#555' }}>
              Kiosk: {o.kiosk_id.slice(0, 8)}… · {o.photo_urls.length} photo(s)
            </p>
          </div>
        ))}
      </Section>
    </div>
  );
}

// ---- sub-components ----

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
};

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e0e0e0', textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color }}>{value}</p>
      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#666' }}>{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#333' }}>{title}</h3>
      {children}
    </div>
  );
}

function SyncBadge({ status }: { status: string }) {
  const bg = status === 'synced' ? '#e6f4ea' : status === 'failed' ? '#fce8e6' : '#fff3e0';
  const color = status === 'synced' ? '#1e7e34' : status === 'failed' ? '#c62828' : '#e65100';
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: bg, color }}>
      {status}
    </span>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return <p style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: 16 }}>{text}</p>;
}
