/**
 * Validate that current_score > last_recorded_score when both are provided.
 * Throws a user-facing error message when the rule is violated.
 *
 * This rule is enforced in three layers (defense-in-depth):
 *   1. UI hint — TaskPage shows inline warning before submission
 *   2. Action layer — saveTask() calls this function before writing to Dexie
 *   3. Database — SQL CHECK constraint `chk_score_increase` on the tasks table
 *
 * All three layers use the same invariant: current > last (strict).
 */
export function validateScoreIncrease(
  currentScore: number | null | undefined,
  lastRecordedScore: number | null | undefined,
): void {
  if (
    currentScore != null &&
    lastRecordedScore != null &&
    currentScore <= lastRecordedScore
  ) {
    throw new Error(
      '当前分数必须大于上次记录分数。如需修正，请提交分数重置申请。',
    );
  }
}
