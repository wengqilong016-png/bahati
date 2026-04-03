// ============================================================
// Phase 1 — Score validation rules
// ============================================================

/**
 * For a normal daily task, the reported current_score must be strictly
 * greater than the kiosk's last_recorded_score.
 * If it isn't, the driver must file a score-reset request instead.
 */
export function validateDailyTaskScore(
  currentScore: number,
  lastRecordedScore: number,
): string | null {
  if (!Number.isFinite(currentScore) || currentScore < 0) {
    return '分数必须为非负数';
  }
  if (currentScore <= lastRecordedScore) {
    return `分数必须大于上次记录的分数（${lastRecordedScore}）。如果分数下降，请提交分数重置申请。`;
  }
  return null; // valid
}

/**
 * For a score-reset request, the requested new score should be less
 * than the current recorded score (otherwise it's just a normal task).
 */
export function validateScoreResetRequest(
  requestedNewScore: number,
  currentScore: number,
): string | null {
  if (!Number.isFinite(requestedNewScore) || requestedNewScore < 0) {
    return '申请分数必须为非负数';
  }
  if (requestedNewScore >= currentScore) {
    return `申请分数必须小于当前分数（${currentScore}）。如果分数增加，请提交每日任务。`;
  }
  return null; // valid
}
