import type { BucketTopHolding } from "../../pages/home/types";

/** Row shape for regions / sectors / countries bar charts (tooltip reads holdings). */
export type DistributionBarChartRow = {
  name: string;
  tooltipHeading?: string;
  topHoldings?: BucketTopHolding[];
  topHoldingsPrimary?: BucketTopHolding[];
  topHoldingsCompare?: BucketTopHolding[];
};

/** One bar series at the hovered bucket (label + weight + bar colors). */
export type DistributionChartWeightRow = {
  label: string;
  /** Bucket weight 0–1 */
  value: number;
  backgroundColor: string;
  borderColor: string;
};

/** Props for {@link DistributionChartTooltip} — domain data only. */
export type DistributionChartTooltipProps = {
  heading: string;
  weights: DistributionChartWeightRow[];
  row: DistributionBarChartRow;
  showCompare: boolean;
  primaryLabel: string;
  compareLabel: string;
  maxInnerWidthPx: number;
};
