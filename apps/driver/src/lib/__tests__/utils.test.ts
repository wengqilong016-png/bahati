import { describe, it, expect } from 'vitest';
import { getTodayDarEsSalaam, getDateDarEsSalaam } from '../utils';

describe('getTodayDarEsSalaam', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = getTodayDarEsSalaam();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a valid date string', () => {
    const result = getTodayDarEsSalaam();
    const parsed = new Date(result);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });
});

describe('getDateDarEsSalaam', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = getDateDarEsSalaam('2026-04-03T10:00:00.000Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('converts UTC noon to EAT date (UTC+3, same calendar day)', () => {
    // 2026-04-03T10:00:00Z = 2026-04-03T13:00:00 EAT — still April 3
    expect(getDateDarEsSalaam('2026-04-03T10:00:00.000Z')).toBe('2026-04-03');
  });

  it('advances date for UTC timestamps near midnight that cross into next EAT day', () => {
    // 2026-04-02T22:30:00Z = 2026-04-03T01:30:00 EAT — April 3 in EAT
    expect(getDateDarEsSalaam('2026-04-02T22:30:00.000Z')).toBe('2026-04-03');
  });

  it('keeps the same date when UTC is 21:59 (23:59 EAT)', () => {
    // 2026-04-03T20:59:59Z = 2026-04-03T23:59:59 EAT — still April 3
    expect(getDateDarEsSalaam('2026-04-03T20:59:59.000Z')).toBe('2026-04-03');
  });

  it('advances date when UTC midnight has not yet reached EAT midnight', () => {
    // 2026-04-03T21:30:00Z = 2026-04-04T00:30:00 EAT — April 4 in EAT
    expect(getDateDarEsSalaam('2026-04-03T21:30:00.000Z')).toBe('2026-04-04');
  });

  it('handles start-of-year boundary', () => {
    // 2026-01-01T00:00:00Z = 2026-01-01T03:00:00 EAT
    expect(getDateDarEsSalaam('2026-01-01T00:00:00.000Z')).toBe('2026-01-01');
  });

  it('handles year-end EAT rollover', () => {
    // 2025-12-31T22:00:00Z = 2026-01-01T01:00:00 EAT — new year in EAT
    expect(getDateDarEsSalaam('2025-12-31T22:00:00.000Z')).toBe('2026-01-01');
  });
});
