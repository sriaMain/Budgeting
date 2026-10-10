// Validated categorical palette (fixed hue order — never cycle/reassign).
// See dataviz skill: light-mode worst adjacent CVD ΔE 24.2, all slots pass lightness/chroma.
export const CHART_CATEGORICAL = [
  '#2a78d6', // 1 blue
  '#1baf7a', // 2 aqua
  '#eda100', // 3 yellow
  '#008300', // 4 green
  '#4a3aa7', // 5 violet
  '#e34948', // 6 red
  '#e87ba4', // 7 magenta
  '#eb6834', // 8 orange
] as const;

export const CHART_CHROME = {
  grid: '#e1e0d9',
  axis: '#898781',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e1e0d9',
  tooltipText: '#0b0b0b',
  sliceStroke: '#ffffff',
};

// Same roles, re-tuned for a dark chart canvas: grid/axis lines lighten just
// enough to read against gray-900 card backgrounds without glowing, and the
// tooltip becomes a dark surface instead of recharts' default white popup.
export const CHART_CHROME_DARK = {
  grid: '#30333d',
  axis: '#8a90a2',
  textPrimary: '#f5f7fa',
  textSecondary: '#a5adbd',
  tooltipBg: '#1a1d27',
  tooltipBorder: '#30333d',
  tooltipText: '#f5f7fa',
  sliceStroke: '#111318',
};

/** Pass the current `useTheme()` value so chart chrome (grid/axis/tooltip)
 * flips instantly with the rest of the app instead of staying light-mode-only. */
export function getChartChrome(theme: 'light' | 'dark') {
  return theme === 'dark' ? CHART_CHROME_DARK : CHART_CHROME;
}

export const CHART_STATUS = {
  good: '#0ca30c',
  critical: '#d03b3b',
};

export function seriesColor(index: number): string {
  return CHART_CATEGORICAL[index % CHART_CATEGORICAL.length];
}
