import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { processQueue } from '../lib/sync';
import type { SyncQueueItem } from '../lib/types';

export default function PendingSyncPage() {
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      const all = await db.sync_queue.orderBy('created_at').toArray();
      if (!cancelled) setItems(all);
    }

    loadItems();
    return () => { cancelled = true; };
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await processQueue();
      alert(`同步完成: ${result.synced} 成功, ${result.failed} 失败, ${result.remaining} 剩余`);
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
      // Reload items after sync
      const all = await db.sync_queue.orderBy('created_at').toArray();
      setItems(all);
    }
  }

  const tableLabel: Record<string, string> = {
    kiosk_onboarding_records: '入网',
    tasks: '任务',
    score_reset_requests: '重置申请',
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>待同步列表</h1>

      <button
        onClick={handleSync}
        disabled={syncing || items.length === 0}
        style={{
          padding: '10px 24px',
          background: syncing ? '#ccc' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          cursor: syncing ? 'default' : 'pointer',
          marginBottom: 16,
          width: '100%',
        }}
      >
        {syncing ? '同步中…' : `同步全部 (${items.length})`}
      </button>

      {items.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999' }}>没有待同步的记录</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: 12,
                background: item.attempts > 0 ? '#fef2f2' : '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontWeight: 500 }}>
                {tableLabel[item.table] || item.table}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                ID: {item.record_id.slice(0, 8)}… | 尝试: {item.attempts}
                {item.last_error && ` | 错误: ${item.last_error}`}
              </div>
            </div>
          ))}
        </div>
      )}

      <a href="/" style={{ display: 'block', marginTop: 24, textAlign: 'center' }}>
        ← 返回首页
      </a>
    </div>
  );
}
