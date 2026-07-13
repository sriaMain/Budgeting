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
};

export const CHART_STATUS = {
  good: '#0ca30c',
  critical: '#d03b3b',
};

export function seriesColor(index: number): string {
  return CHART_CATEGORICAL[index % CHART_CATEGORICAL.length];
}
