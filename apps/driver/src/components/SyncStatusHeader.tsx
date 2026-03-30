import { useEffect, useState } from 'react';
import { db } from '../lib/db';

export default function SyncStatusHeader() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      const count = await db.sync_queue.count();
      setPending(count);
    };

    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  if (pending === 0) return null;

  return (
    <div
      style={{
        background: '#fef3c7',
        padding: '6px 16px',
        textAlign: 'center',
        fontSize: 13,
        color: '#92400e',
      }}
    >
      ⏳ {pending} 条记录待同步
    </div>
  );
}
