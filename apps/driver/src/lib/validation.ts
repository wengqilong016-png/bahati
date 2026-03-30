// ============================================================
// Phase 1 — Score validation rules
// ============================================================

/**
 * For a normal daily task, the reported current_score must be strictly
 * greater than the machine's last_recorded_score.
 * If it isn't, the driver must file a score-reset request instead.
 */
export function validateDailyTaskScore(
  currentScore: number,
  lastRecordedScore: number,
): string | null {
  if (!Number.isFinite(currentScore) || currentScore < 0) {
    return 'Score must be a non-negative number.';
  }
  if (currentScore <= lastRecordedScore) {
    return `Score must be greater than the last recorded score (${lastRecordedScore}). If the score decreased, please submit a Score Reset Request instead.`;
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
    return 'Requested score must be a non-negative number.';
  }
  if (requestedNewScore >= currentScore) {
    return `Requested new score must be less than the current score (${currentScore}). For a score increase, use a normal Daily Task instead.`;
  }
  return null; // valid
}
