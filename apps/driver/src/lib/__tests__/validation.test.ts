import { describe, it, expect } from 'vitest';
import { validateDailyTaskScore, validateScoreResetRequest } from '../validation';

describe('validateDailyTaskScore', () => {
  it('accepts score higher than last recorded', () => {
    expect(validateDailyTaskScore(500, 400)).toBeNull();
  });

  it('accepts score of 1 when last was 0', () => {
    expect(validateDailyTaskScore(1, 0)).toBeNull();
  });

  it('rejects score equal to last recorded', () => {
    expect(validateDailyTaskScore(400, 400)).not.toBeNull();
  });

  it('rejects score lower than last recorded', () => {
    expect(validateDailyTaskScore(300, 400)).not.toBeNull();
  });

  it('rejects negative score', () => {
    expect(validateDailyTaskScore(-1, 400)).not.toBeNull();
  });

  it('rejects NaN', () => {
    expect(validateDailyTaskScore(NaN, 400)).not.toBeNull();
  });

  it('rejects Infinity', () => {
    expect(validateDailyTaskScore(Infinity, 400)).not.toBeNull();
  });

  it('includes last recorded score in error message', () => {
    const result = validateDailyTaskScore(400, 400);
    expect(result).toContain('400');
  });
});

describe('validateScoreResetRequest', () => {
  it('accepts score lower than current', () => {
    expect(validateScoreResetRequest(100, 400)).toBeNull();
  });

  it('accepts zero when current is positive', () => {
    expect(validateScoreResetRequest(0, 400)).toBeNull();
  });

  it('rejects score equal to current', () => {
    expect(validateScoreResetRequest(400, 400)).not.toBeNull();
  });

  it('rejects score higher than current', () => {
    expect(validateScoreResetRequest(500, 400)).not.toBeNull();
  });

  it('rejects negative score', () => {
    expect(validateScoreResetRequest(-1, 400)).not.toBeNull();
  });

  it('rejects NaN', () => {
    expect(validateScoreResetRequest(NaN, 400)).not.toBeNull();
  });

  it('includes current score in error message', () => {
    const result = validateScoreResetRequest(500, 400);
    expect(result).toContain('400');
  });
});
