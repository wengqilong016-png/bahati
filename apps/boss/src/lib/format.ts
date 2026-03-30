export function fmtCurrency(n: number): string {
  return `IDR ${n.toLocaleString('id-ID')}`;
}

export function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
