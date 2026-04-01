export type PortfolioPieTooltipProps =
  | {
      kind: "assetMix";
      sliceLabel: string;
      valueEur: number;
      shareOfPortfolio: number;
      maxInnerWidthPx: number;
    }
  | {
      kind: "bondMix";
      sliceLabel: string;
      /** Weight of this slice within the bond mix (0–1). */
      weight: number;
      maxInnerWidthPx: number;
    };
