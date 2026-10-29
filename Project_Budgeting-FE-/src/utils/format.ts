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

/**
 * Money in the app's en-IN grouping, in the given currency (₹ for INR). Whole amounts drop the
 * ".00"; `maxDecimals` 2 shows paise when there are any.
 */
export const formatMoney = (value: number | string | null | undefined, currency = 'INR', maxDecimals = 0) => {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? 0)) || 0;
  const digits = { minimumFractionDigits: Number.isInteger(amount) ? 0 : maxDecimals, maximumFractionDigits: maxDecimals };
  try {
    return amount.toLocaleString('en-IN', { style: 'currency', currency: currency || 'INR', ...digits });
  } catch {
    return `${currency} ${amount.toLocaleString('en-IN', digits)}`;
  }
};
