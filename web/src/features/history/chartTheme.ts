/**
 * Chart palette: dataviz-skill reference palette, dark-mode steps, validated
 * with validate_palette.js against the card surface (#262626): lightness band,
 * chroma floor, contrast all PASS; adjacent CVD in floor band → multi-series
 * charts always carry a legend and direct labels, never color alone.
 */
export const chart = {
  series1: '#3987e5', // blue — primary/single series
  series2: '#199e70', // aqua
  series3: '#c98500', // yellow
  series4: '#008300', // green
  grid: '#3f3f3f',
  text: '#a3a3a3',
  textMuted: '#737373',
  /** Sequential blue ramp (ordinal-safe from step 250) for heatmap cells. */
  sequential: ['#86b6ef', '#5598e7', '#3987e5', '#256abf', '#184f95'],
  cellEmpty: '#333333',
} as const;

export const axisProps = {
  stroke: chart.grid,
  tick: { fill: chart.text, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: chart.grid },
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: '#262626',
    border: '1px solid #404040',
    borderRadius: 8,
    color: '#e5e5e5',
    fontSize: 12,
  },
  labelStyle: { color: '#a3a3a3' },
} as const;
