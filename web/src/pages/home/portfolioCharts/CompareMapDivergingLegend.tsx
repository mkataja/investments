import type { CSSProperties } from "react";
import {
  COMPARE_MAP_DIVERGING_LEGEND_SWATCH_PX,
  distributionChartLegendRectRoundedStyle,
} from "../../../lib/chart/distributionChartLegendSwatchStyle";
import { divergingCompareSpectrumEndRgb } from "./worldCountryChoroplethDivergingStops";

const swatchStyle = distributionChartLegendRectRoundedStyle(
  COMPARE_MAP_DIVERGING_LEGEND_SWATCH_PX,
);

/** Matches Chart.js distribution bar legend (`rectRounded` point style; see `distributionChartLegendSwatchStyle`). */
export function CompareMapDivergingLegend() {
  const { cool, warm } = divergingCompareSpectrumEndRgb();
  const box: CSSProperties = {
    width: swatchStyle.width,
    height: swatchStyle.height,
    borderRadius: swatchStyle.borderRadius,
  };
  return (
    <div className="flex flex-wrap gap-x-[14px] gap-y-1 text-sm text-slate-600 select-none">
      <span className="inline-flex items-center gap-2">
        <span
          className="inline-block shrink-0"
          style={{ ...box, backgroundColor: cool }}
          aria-hidden
        />
        Relative underexposure
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          className="inline-block shrink-0"
          style={{ ...box, backgroundColor: warm }}
          aria-hidden
        />
        Relative overexposure
      </span>
    </div>
  );
}
