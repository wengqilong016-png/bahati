// ============================================================
// Settlement balance projection — pure calculation functions
// ============================================================

export interface SettlementCalcInput {
  scoreBefore: number;
  scoreCurrent: number;
  dividendRate: number;         // e.g. 0.15
  dividendMethod: 'cash' | 'retained';
  exchangeAmount: number;       // coins → cash
  expenseAmount: number;
  openingCoinBalance: number;
  openingCashBalance: number;
  /** Override gross_revenue if pre-computed by server */
  grossRevenueOverride?: number;
}

export interface SettlementCalcResult {
  grossRevenue: number;
  dividendAmount: number;
  afterCollectCoin: number;
  afterCollectCash: number;
  afterDividendCoin: number;
  afterDividendCash: number;
  afterExchangeCoin: number;
  afterExchangeCash: number;
  finalCoin: number;
  finalCash: number;
}

/**
 * Pure function: compute the full settlement balance projection.
 * All amounts are integers (TZS, no decimals).
 */
export function computeSettlement(input: SettlementCalcInput): SettlementCalcResult {
  const grossRevenue = input.grossRevenueOverride
    ?? (input.scoreCurrent - input.scoreBefore) * 200;

  const dividendAmount = Math.round(grossRevenue * input.dividendRate);

  const afterCollectCoin = input.openingCoinBalance + grossRevenue;
  const afterCollectCash = input.openingCashBalance;

  const afterDividendCoin = afterCollectCoin;
  const afterDividendCash = input.dividendMethod === 'cash'
    ? afterCollectCash - dividendAmount
    : afterCollectCash;

  const afterExchangeCoin = afterDividendCoin - input.exchangeAmount;
  const afterExchangeCash = afterDividendCash + input.exchangeAmount;

  const finalCoin = afterExchangeCoin;
  const finalCash = afterExchangeCash - input.expenseAmount;

  return {
    grossRevenue,
    dividendAmount,
    afterCollectCoin,
    afterCollectCash,
    afterDividendCoin,
    afterDividendCash,
    afterExchangeCoin,
    afterExchangeCash,
    finalCoin,
    finalCash,
  };
}
