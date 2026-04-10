/**
 * Diverging compare heatmap: cool = deep blue–violet; center ≈ slate-50; warm = rose (blend of saturated vs soft ends).
 * Shared by {@link WorldCountryChoropleth} color scale and {@link CompareMapDivergingLegend} swatches.
 */
export const DIVERGING_RGB_STOPS: readonly {
  t: number;
  r: number;
  g: number;
  b: number;
}[] = [
  { t: 0, r: 71, g: 76, b: 213 },
  { t: 0.24, r: 115, g: 155, b: 230 },
  { t: 0.36, r: 162, g: 200, b: 242 },
  { t: 0.46, r: 214, g: 232, b: 252 },
  { t: 0.5, r: 248, g: 250, b: 252 },
  { t: 0.56, r: 255, g: 251, b: 238 },
  { t: 0.68, r: 255, g: 240, b: 210 },
  { t: 0.8, r: 255, g: 202, b: 180 },
  { t: 1, r: 239, g: 108, b: 122 },
];

export function divergingCompareSpectrumEndRgb(): {
  cool: string;
  warm: string;
} {
  const a = DIVERGING_RGB_STOPS[0];
  const b = DIVERGING_RGB_STOPS[DIVERGING_RGB_STOPS.length - 1];
  if (a === undefined || b === undefined) {
    return { cool: "rgb(128, 128, 128)", warm: "rgb(128, 128, 128)" };
  }
  return {
    cool: `rgb(${a.r},${a.g},${a.b})`,
    warm: `rgb(${b.r},${b.g},${b.b})`,
  };
}
