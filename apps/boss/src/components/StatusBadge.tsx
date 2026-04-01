import { colors, radius, font } from '../lib/theme';

type Status = 'pending' | 'approved' | 'rejected' | 'submitted' | 'confirmed' | 'draft' | 'active' | 'inactive' | 'maintenance' | 'reviewed';

const colorMap: Record<Status, { bg: string; color: string }> = {
  pending: { bg: colors.warningLight, color: colors.warning },
  approved: { bg: colors.successLight, color: colors.success },
  rejected: { bg: colors.dangerLight, color: colors.danger },
  submitted: { bg: colors.infoLight, color: colors.info },
  confirmed: { bg: colors.successLight, color: colors.success },
  draft: { bg: '#f5f5f5', color: colors.textSecondary },
  active: { bg: colors.successLight, color: colors.success },
  inactive: { bg: '#f5f5f5', color: colors.textSecondary },
  maintenance: { bg: colors.warningLight, color: colors.warning },
  reviewed: { bg: colors.infoLight, color: colors.info },
};

const iconMap: Record<Status, string> = {
  pending: '⏳',
  approved: '✓',
  rejected: '✕',
  submitted: '↑',
  confirmed: '✓',
  draft: '○',
  active: '●',
  inactive: '○',
  maintenance: '⚠',
  reviewed: '✓',
};

const labelMap: Record<Status, string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已拒绝',
  submitted: '已提交',
  confirmed: '已确认',
  draft: '草稿',
  active: '活跃',
  inactive: '停用',
  maintenance: '维修中',
  reviewed: '已审阅',
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const key = status as Status;
  const style = colorMap[key] ?? { bg: '#f5f5f5', color: colors.text };
  const icon = iconMap[key] ?? '·';
  const label = labelMap[key] ?? status;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: `3px 10px`,
      borderRadius: radius.badge,
      fontSize: font.sizes.xs,
      fontWeight: font.weights.semibold,
      background: style.bg,
      color: style.color,
    }}>
      <span aria-hidden="true" style={{ fontSize: 10 }}>{icon}</span>
      {label}
    </span>
  );
}
