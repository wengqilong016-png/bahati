import { describe, it, expect } from 'vitest';
import { computeSettlement, type SettlementCalcInput } from '../settlementCalc';

const base: SettlementCalcInput = {
  scoreBefore: 1000,
  scoreCurrent: 1050,
  dividendRate: 0.15,
  dividendMethod: 'cash',
  exchangeAmount: 0,
  expenseAmount: 0,
  openingCoinBalance: 5000,
  openingCashBalance: 2000,
};

describe('computeSettlement', () => {
  it('computes gross revenue from score delta × 200', () => {
    const r = computeSettlement(base);
    // (1050 - 1000) * 200 = 10,000
    expect(r.grossRevenue).toBe(10_000);
  });

  it('computes dividend as round(grossRevenue × rate)', () => {
    const r = computeSettlement(base);
    // 10,000 × 0.15 = 1,500
    expect(r.dividendAmount).toBe(1_500);
  });

  it('adds gross revenue to coin balance after collection', () => {
    const r = computeSettlement(base);
    expect(r.afterCollectCoin).toBe(5000 + 10_000);
    expect(r.afterCollectCash).toBe(2000);
  });

  it('deducts cash dividend when method is cash', () => {
    const r = computeSettlement(base);
    expect(r.afterDividendCash).toBe(2000 - 1500);
    expect(r.afterDividendCoin).toBe(15_000); // unchanged
  });

  it('does not deduct dividend when method is retained', () => {
    const r = computeSettlement({ ...base, dividendMethod: 'retained' });
    expect(r.afterDividendCash).toBe(2000); // unchanged
  });

  it('exchange moves coins to cash', () => {
    const r = computeSettlement({ ...base, exchangeAmount: 3000 });
    expect(r.afterExchangeCoin).toBe(15_000 - 3000);
    expect(r.afterExchangeCash).toBe(500 + 3000); // 500 = 2000 - 1500 dividend
  });

  it('expense reduces final cash', () => {
    const r = computeSettlement({ ...base, expenseAmount: 200 });
    expect(r.finalCash).toBe(500 - 200); // 500 = 2000 - 1500 dividend
  });

  it('full scenario: collect, dividend cash, exchange, expense', () => {
    const r = computeSettlement({
      ...base,
      exchangeAmount: 5000,
      expenseAmount: 1000,
    });
    // gross = 10000, dividend = 1500
    // coin: 5000 + 10000 = 15000 → -5000 exchange → 10000
    // cash: 2000 - 1500 dividend → 500 + 5000 exchange → 5500 - 1000 expense → 4500
    expect(r.finalCoin).toBe(10_000);
    expect(r.finalCash).toBe(4_500);
  });

  it('uses grossRevenueOverride when provided', () => {
    const r = computeSettlement({ ...base, grossRevenueOverride: 8000 });
    expect(r.grossRevenue).toBe(8000);
    expect(r.dividendAmount).toBe(1200); // 8000 × 0.15
  });

  it('handles zero score delta', () => {
    const r = computeSettlement({ ...base, scoreCurrent: 1000 });
    expect(r.grossRevenue).toBe(0);
    expect(r.dividendAmount).toBe(0);
    expect(r.finalCoin).toBe(5000);
    expect(r.finalCash).toBe(2000);
  });

  it('rounds dividend to nearest integer', () => {
    // 10000 × 0.16 = 1600 (exact)
    const r1 = computeSettlement({ ...base, dividendRate: 0.16 });
    expect(r1.dividendAmount).toBe(1600);

    // 333 × 0.15 = 49.95 → 50
    const r2 = computeSettlement({
      ...base,
      grossRevenueOverride: 333,
      dividendRate: 0.15,
    });
    expect(r2.dividendAmount).toBe(50);
  });
});
