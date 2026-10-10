export function formatCurrency(amount: number | string | null | undefined): string {
  const value = parseFloat(String(amount ?? 0)) || 0;
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCurrencyCompact(amount: number | string | null | undefined): string {
  const value = parseFloat(String(amount ?? 0)) || 0;
  const abs = Math.abs(value);
  if (abs >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return formatCurrency(value);
}
