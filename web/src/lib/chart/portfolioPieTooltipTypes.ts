export type PortfolioPieTooltipProps =
  | {
      kind: "assetMix";
      sliceLabel: string;
      maxInnerWidthPx: number;
      valueEur: number;
      shareOfPortfolio: number;
    }
  | {
      kind: "assetMix";
      sliceLabel: string;
      maxInnerWidthPx: number;
      comparison: {
        primaryLabel: string;
        compareLabel: string;
        primaryValueEur: number;
        primaryShareOfPortfolio: number;
        compareValueEur: number;
        compareShareOfPortfolio: number;
      };
    }
  | {
      kind: "bondMix";
      sliceLabel: string;
      maxInnerWidthPx: number;
      /** Weight of this slice within the bond mix (0–1). */
      weight: number;
    }
  | {
      kind: "bondMix";
      sliceLabel: string;
      maxInnerWidthPx: number;
      comparison: {
        primaryLabel: string;
        compareLabel: string;
        primaryWeight: number;
        compareWeight: number;
      };
    };
