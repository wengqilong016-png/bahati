import { useState } from 'react';
import { colors, radius, font, transition } from '../lib/theme';
import { TableSkeleton } from './Skeleton';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | null;
  loading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
  keyField: keyof T;
}

type SortDir = 'asc' | 'desc';

const PAGE_SIZES = [10, 20, 50];

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  loading = false,
  emptyMessage = 'No data found.',
  pageSize: defaultPageSize = 20,
  keyField,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Reset page when data changes
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  };

  if (loading) {
    return <TableSkeleton rows={5} cols={columns.length} />;
  }

  if (!rows || rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }} role="status">
        <p style={{ color: colors.textDisabled, margin: 0 }}>{emptyMessage}</p>
      </div>
    );
  }

  // Sort rows
  let displayRows = [...rows];
  if (sortKey) {
    displayRows.sort((a, b) => {
      const av = a[sortKey as keyof T];
      const bv = b[sortKey as keyof T];
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  const totalPages = Math.ceil(displayRows.length / pageSize);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageRows = displayRows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const SortIcon = ({ col }: { col: Column<T> }) => {
    if (!col.sortable) return null;
    const active = sortKey === String(col.key);
    return (
      <span
        aria-hidden="true"
        style={{
          marginLeft: 4,
          fontSize: 10,
          color: active ? colors.primary : colors.textDisabled,
          display: 'inline-block',
          verticalAlign: 'middle',
        }}
      >
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    );
  };

  // Build page numbers: always show first, last, current±1, with ellipsis
  const pageNumbers: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(0);
    if (safePage > 2) pageNumbers.push('...');
    for (let i = Math.max(1, safePage - 1); i <= Math.min(totalPages - 2, safePage + 1); i++) {
      pageNumbers.push(i);
    }
    if (safePage < totalPages - 3) pageNumbers.push('...');
    pageNumbers.push(totalPages - 1);
  }

  return (
    <div>
      {/* Desktop table */}
      <div style={{ overflowX: 'auto' }} className="boss-table-wrap">
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.sizes.md }}
          role="table"
          aria-rowcount={rows.length}
        >
          <thead>
            <tr style={{ background: '#f5f5f5' }} role="row">
              {columns.map(col => (
                <th
                  key={String(col.key)}
                  role="columnheader"
                  scope="col"
                  onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                  aria-sort={
                    col.sortable
                      ? sortKey === String(col.key)
                        ? sortDir === 'asc' ? 'ascending' : 'descending'
                        : 'none'
                      : undefined
                  }
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontWeight: font.weights.semibold,
                    color: colors.textSecondary,
                    borderBottom: `2px solid ${colors.border}`,
                    whiteSpace: 'nowrap',
                    width: col.width,
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    transition: transition.fast,
                  }}
                >
                  {col.header}
                  <SortIcon col={col} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, idx) => {
              const rowKey = String(row[keyField]);
              const isHovered = hoveredRow === rowKey;
              return (
                <tr
                  key={rowKey}
                  role="row"
                  onMouseEnter={() => setHoveredRow(rowKey)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    background: isHovered ? colors.surfaceHover : idx % 2 === 0 ? colors.surface : colors.surfaceAlt,
                    transition: 'background-color 0.1s ease',
                  }}
                >
                  {columns.map(col => (
                    <td
                      key={String(col.key)}
                      role="cell"
                      style={{
                        padding: '10px 14px',
                        borderBottom: `1px solid ${colors.borderLight}`,
                        verticalAlign: 'middle',
                      }}
                    >
                      {col.render
                        ? col.render(row)
                        : String(row[col.key as keyof T] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list view */}
      <div className="boss-card-list" style={{ display: 'none', flexDirection: 'column', gap: 10, padding: 12 }}>
        {pageRows.map(row => {
          const rowKey = String(row[keyField]);
          return (
            <div
              key={rowKey}
              style={{
                background: colors.surface,
                borderRadius: radius.lg,
                padding: '12px 14px',
                border: `1px solid ${colors.border}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              {columns.map(col => (
                <div key={String(col.key)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
                  <span style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold, flexShrink: 0, minWidth: 80 }}>
                    {col.header}
                  </span>
                  <span style={{ fontSize: font.sizes.sm, color: colors.text, textAlign: 'right' }}>
                    {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '')}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderTop: `1px solid ${colors.borderLight}`,
          flexWrap: 'wrap',
          gap: 8,
        }}>
          {/* Page size selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>每页</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
              aria-label="每页显示条数"
              style={{
                padding: '3px 6px',
                fontSize: font.sizes.xs,
                border: `1px solid ${colors.divider}`,
                borderRadius: radius.sm,
                background: colors.surface,
                color: colors.textSecondary,
                cursor: 'pointer',
              }}
            >
              {PAGE_SIZES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>条 · 共 {rows.length} 条</span>
          </div>

          {/* Page number buttons */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} role="navigation" aria-label="分页导航">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="上一页"
              style={{
                padding: '4px 10px',
                cursor: safePage === 0 ? 'not-allowed' : 'pointer',
                borderRadius: radius.sm,
                border: `1px solid ${colors.divider}`,
                background: colors.surface,
                color: colors.primary,
                fontSize: font.sizes.sm,
                opacity: safePage === 0 ? 0.4 : 1,
              }}
            >
              ‹
            </button>

            {pageNumbers.map((p, i) => (
              p === '...'
                ? <span key={`ellipsis-${i}`} style={{ padding: '4px 6px', fontSize: font.sizes.sm, color: colors.textMuted }}>…</span>
                : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    aria-label={`第 ${p + 1} 页`}
                    aria-current={safePage === p ? 'page' : undefined}
                    style={{
                      padding: '4px 9px',
                      cursor: 'pointer',
                      borderRadius: radius.sm,
                      border: safePage === p ? 'none' : `1px solid ${colors.divider}`,
                      background: safePage === p ? colors.primary : colors.surface,
                      color: safePage === p ? '#fff' : colors.textSecondary,
                      fontSize: font.sizes.sm,
                      fontWeight: safePage === p ? font.weights.bold : font.weights.normal,
                      minWidth: 30,
                    }}
                  >
                    {p + 1}
                  </button>
                )
            ))}

            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              aria-label="下一页"
              style={{
                padding: '4px 10px',
                cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                borderRadius: radius.sm,
                border: `1px solid ${colors.divider}`,
                background: colors.surface,
                color: colors.primary,
                fontSize: font.sizes.sm,
                opacity: safePage >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* CSS: show card list on mobile, hide table */}
      <style>{`
        @media (max-width: 600px) {
          .boss-table-wrap { display: none !important; }
          .boss-card-list { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

