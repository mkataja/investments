import { rgbaFromHex } from "../../../lib/chart/rgbaFromHex";

/** Filled-area color under history lines (line datasets with `fill: true`). Legend uses point colors; see asset mix / sector hooks. */
export function historyLineAreaFill(stacked: boolean, hexFill: string): string {
  return stacked ? hexFill : rgbaFromHex(hexFill, 0.12);
}

/** Shared by Asset mix over time and Sector distribution over time line charts. */
export const HISTORY_LINE_LEGEND_LABELS = {
  boxWidth: 12,
  boxHeight: 12,
  padding: 14,
  font: { size: 14 },
  usePointStyle: true,
  pointStyle: "rectRounded" as const,
};
