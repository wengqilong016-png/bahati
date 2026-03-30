import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';

export function SyncStatusBadge() {
  const count = useLiveQuery(() =>
    db.sync_queue.where('retry_count').below(3).count()
  , [], 0);

  if (!count) return null;

  return (
    <span style={{
      background: '#CC0000',
      color: '#fff',
      borderRadius: 10,
      padding: '2px 6px',
      fontSize: 11,
      fontWeight: 700,
      marginLeft: 4,
    }}>
      {count}
    </span>
  );
}
