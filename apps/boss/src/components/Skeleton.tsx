import React from 'react';
import { colors, radius } from '../lib/theme';

/** Single shimmer block */
function ShimmerBlock({ width = '100%', height = 16, borderRadius = radius.sm, style }: {
  width?: string | number;
  height?: number;
  borderRadius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton-shimmer"
      style={{ width, height, borderRadius, flexShrink: 0, ...style }}
      aria-hidden="true"
    />
  );
}

/** KPI card skeleton – 4 cards in a 2×2 grid */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <ShimmerBlock width={80} height={13} style={{ marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ background: colors.surface, borderRadius: radius.lg, padding: '16px 18px', border: `1px solid ${colors.border}` }}>
            <ShimmerBlock width={32} height={32} borderRadius={8} style={{ marginBottom: 10 }} />
            <ShimmerBlock width="60%" height={11} style={{ marginBottom: 6 }} />
            <ShimmerBlock width="80%" height={22} />
          </div>
        ))}
      </div>
      <ShimmerBlock width={80} height={13} style={{ marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[1, 2].map(i => (
          <div key={i} style={{ background: colors.surface, borderRadius: radius.lg, padding: '16px 18px', border: `1px solid ${colors.border}` }}>
            <ShimmerBlock width={32} height={32} borderRadius={8} style={{ marginBottom: 10 }} />
            <ShimmerBlock width="60%" height={11} style={{ marginBottom: 6 }} />
            <ShimmerBlock width="80%" height={22} />
          </div>
        ))}
      </div>
      <ShimmerBlock width={80} height={13} style={{ marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ background: colors.surface, borderRadius: radius.lg, padding: '16px 18px', border: `1px solid ${colors.border}` }}>
            <ShimmerBlock width={32} height={32} borderRadius={8} style={{ marginBottom: 10 }} />
            <ShimmerBlock width="60%" height={11} style={{ marginBottom: 6 }} />
            <ShimmerBlock width="50%" height={22} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 3 card skeletons for drivers / merchants list */
export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: colors.surface, borderRadius: radius.lg, padding: '16px 18px', border: `1px solid ${colors.border}`, borderLeft: `4px solid ${colors.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <ShimmerBlock width="45%" height={16} style={{ marginBottom: 6 }} />
              <ShimmerBlock width="60%" height={12} />
            </div>
            <ShimmerBlock width={60} height={22} borderRadius={radius.badge} />
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
            <div>
              <ShimmerBlock width={50} height={11} style={{ marginBottom: 4 }} />
              <ShimmerBlock width={80} height={18} />
            </div>
            <div>
              <ShimmerBlock width={50} height={11} style={{ marginBottom: 4 }} />
              <ShimmerBlock width={80} height={18} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Table skeleton: header row + N body rows */
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading table">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} style={{ padding: '10px 14px', borderBottom: `2px solid ${colors.border}` }}>
                  <ShimmerBlock width="70%" height={12} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} style={{ background: r % 2 === 0 ? colors.surface : colors.surfaceAlt }}>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.borderLight}` }}>
                    <ShimmerBlock width={c === cols - 1 ? '40%' : '80%'} height={14} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
