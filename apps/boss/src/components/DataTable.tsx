import { useState } from 'react';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | null;
  loading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
  keyField: keyof T;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  loading = false,
  emptyMessage = 'No data found.',
  pageSize = 20,
  keyField,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#0066CC' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        <p style={{ margin: 0, color: '#666' }}>Loading...</p>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: '#999' }}>{emptyMessage}</p>
      </div>
    );
  }

  const totalPages = Math.ceil(rows.length / pageSize);
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {columns.map(col => (
                <th
                  key={String(col.key)}
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#444',
                    borderBottom: '2px solid #e0e0e0',
                    whiteSpace: 'nowrap',
                    width: col.width,
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, idx) => (
              <tr
                key={String(row[keyField])}
                style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}
              >
                {columns.map(col => (
                  <td
                    key={String(col.key)}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid #f0f0f0',
                      verticalAlign: 'middle',
                    }}
                  >
                    {col.render
                      ? col.render(row)
                      : String(row[col.key as keyof T] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '6px 14px', cursor: page === 0 ? 'not-allowed' : 'pointer', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#0066CC' }}
          >
            ← Prev
          </button>
          <span style={{ lineHeight: '32px', color: '#666', fontSize: 13 }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '6px 14px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: '#0066CC' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
