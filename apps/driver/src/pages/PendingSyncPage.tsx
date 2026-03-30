import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useSync } from '../hooks/useSync';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function PendingSyncPage() {
  const { isSyncing, lastSyncAt, triggerSync } = useSync();
  const isOnline = useOnlineStatus();
  const items = useLiveQuery(() => db.sync_queue.toArray(), []);

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#0066CC' }}>Sync Status</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: isOnline ? '#1e7e34' : '#cc0000',
            display: 'inline-block',
          }} />
          <span style={{ fontSize: 13, color: '#666' }}>{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {lastSyncAt && (
        <p style={{ color: '#999', fontSize: 12, margin: '0 0 16px' }}>
          Last sync: {lastSyncAt.toLocaleTimeString()}
        </p>
      )}

      <button
        onClick={triggerSync}
        disabled={isSyncing || !isOnline}
        style={{
          width: '100%',
          padding: 14,
          background: isSyncing || !isOnline ? '#ccc' : '#0066CC',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: isSyncing || !isOnline ? 'not-allowed' : 'pointer',
          marginBottom: 24,
        }}
      >
        {isSyncing ? '⏳ Syncing...' : '🔄 Retry Sync Now'}
      </button>

      <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#333' }}>
        Pending Items ({items?.length ?? 0})
      </h3>

      {!items && <p style={{ color: '#666' }}>Loading...</p>}
      {items && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#1e7e34' }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <p style={{ marginTop: 8 }}>All items synced!</p>
        </div>
      )}

      {items && items.map(item => (
        <div
          key={item.id}
          style={{
            background: '#fff',
            border: `1px solid ${item.retry_count >= 3 ? '#ffcdd2' : '#e0e0e0'}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>
              {item.table_name.replace(/_/g, ' ')}
            </span>
            <span style={{
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 8,
              fontWeight: 600,
              background: item.retry_count >= 3 ? '#ffcdd2' : '#fff3e0',
              color: item.retry_count >= 3 ? '#c62828' : '#e65100',
            }}>
              {item.retry_count >= 3 ? 'FAILED' : `Retry ${item.retry_count}`}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: '#999' }}>
            {item.operation.toUpperCase()} · {item.record_id.slice(0, 8)}...
          </p>
          {item.last_error && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#c62828' }}>
              ⚠️ {item.last_error}
            </p>
          )}
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#bbb' }}>
            {new Date(item.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
