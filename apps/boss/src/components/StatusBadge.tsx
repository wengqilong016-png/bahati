type Status = 'pending' | 'approved' | 'rejected' | 'submitted' | 'confirmed' | 'draft' | 'active' | 'inactive' | 'maintenance' | 'reviewed';

const colorMap: Record<Status, { bg: string; color: string }> = {
  pending: { bg: '#fff3e0', color: '#e65100' },
  approved: { bg: '#e6f4ea', color: '#1e7e34' },
  rejected: { bg: '#fce8e6', color: '#c62828' },
  submitted: { bg: '#e3f2fd', color: '#1565c0' },
  confirmed: { bg: '#e6f4ea', color: '#1e7e34' },
  draft: { bg: '#f5f5f5', color: '#666' },
  active: { bg: '#e6f4ea', color: '#1e7e34' },
  inactive: { bg: '#f5f5f5', color: '#666' },
  maintenance: { bg: '#fff3e0', color: '#e65100' },
  reviewed: { bg: '#e3f2fd', color: '#1565c0' },
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = colorMap[status as Status] ?? { bg: '#f5f5f5', color: '#333' };

  return (
    <span style={{
      padding: '3px 10px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      background: style.bg,
      color: style.color,
      textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}
