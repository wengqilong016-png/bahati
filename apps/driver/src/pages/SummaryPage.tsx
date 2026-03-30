import { useState, useEffect } from 'react';
import { db } from '../lib/db';
import type { LocalDailyTask, LocalScoreResetRequest, LocalMachineOnboarding, LocalMachine } from '../lib/types';

export function SummaryPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [tasks, setTasks] = useState<(LocalDailyTask & { machine?: LocalMachine })[]>([]);
  const [resets, setResets] = useState<(LocalScoreResetRequest & { machine?: LocalMachine })[]>([]);
  const [onboardings, setOnboardings] = useState<LocalMachineOnboarding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Today's tasks
      const todayTasks = await db.daily_tasks.where('task_date').equals(today).toArray();
      const machineIds = [...new Set([
        ...todayTasks.map(t => t.machine_id),
      ])];
      const machines = await db.machines.where('id').anyOf(machineIds).toArray();
      const machineMap = new Map(machines.map(m => [m.id, m]));

      const enrichedTasks = todayTasks.map(t => ({ ...t, machine: machineMap.get(t.machine_id) }));

      // Today's resets
      const allResets = await db.score_reset_requests.toArray();
      const todayResets = allResets.filter(r => r.created_at.startsWith(today));
      const resetMachineIds = [...new Set(todayResets.map(r => r.machine_id))];
      const resetMachines = resetMachineIds.length > 0
        ? await db.machines.where('id').anyOf(resetMachineIds).toArray()
        : [];
      const resetMachineMap = new Map(resetMachines.map(m => [m.id, m]));
      const enrichedResets = todayResets.map(r => ({ ...r, machine: resetMachineMap.get(r.machine_id) }));

      // Today's onboardings
      const allOnboardings = await db.machine_onboardings.toArray();
      const todayOnboardings = allOnboardings.filter(o => o.created_at.startsWith(today));

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
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t.machine?.merchant_name ?? t.machine_id.slice(0, 8)}</span>
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
              <span style={{ fontWeight: 600, fontSize: 14 }}>{r.machine?.merchant_name ?? r.machine_id.slice(0, 8)}</span>
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
              Machine: {o.machine_id.slice(0, 8)}… · {o.photo_urls.length} photo(s)
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
