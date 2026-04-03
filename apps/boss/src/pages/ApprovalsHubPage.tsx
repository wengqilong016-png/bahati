import { useState } from 'react';
import { colors, radius, font } from '../lib/theme';
import { ScoreResetApprovalsPage } from './ScoreResetApprovalsPage';
import { OnboardingApprovalsPage } from './OnboardingApprovalsPage';

type TabKey = 'score-reset' | 'onboarding';

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'score-reset', label: '分数重置', icon: '🔄' },
  { key: 'onboarding', label: '入网审核', icon: '📋' },
];

export function ApprovalsHubPage() {
  const [active, setActive] = useState<TabKey>('score-reset');

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h2 style={{ margin: '0 0 20px', color: colors.primary, fontSize: font.sizes.xxl }}>审批中心</h2>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: colors.bg, borderRadius: radius.md, padding: 4 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: radius.sm,
              cursor: 'pointer',
              fontSize: font.sizes.md,
              fontWeight: active === tab.key ? font.weights.semibold : font.weights.normal,
              background: active === tab.key ? colors.surface : 'transparent',
              color: active === tab.key ? colors.primary : colors.textSecondary,
              boxShadow: active === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span aria-hidden="true">{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {active === 'score-reset' && <ScoreResetApprovalsPage />}
      {active === 'onboarding' && <OnboardingApprovalsPage />}
    </div>
  );
}
