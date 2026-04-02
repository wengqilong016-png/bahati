export function fmtCurrency(n: number): string {
  return `TZS ${n.toLocaleString('en-TZ')}`;
}

export function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
