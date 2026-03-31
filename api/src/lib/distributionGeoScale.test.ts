import { describe, expect, it } from "vitest";
import { distributionGeoScaleForCountryMerge } from "./distributionGeoScale.js";

describe("distributionGeoScaleForCountryMerge", () => {
  it("uses long govt + long corp when bond sleeve keys are present", () => {
    expect(
      distributionGeoScaleForCountryMerge(
        {
          countries: {},
          sectors: {
            cash: 0.0259,
            long_corporate_bonds: 0.95,
            long_government_bonds: 0.02,
            short_bonds: 0.0041,
          },
        },
        0.0259,
      ),
    ).toBeCloseTo(0.97, 5);
  });

  it("falls back to 1 - cash for equity-style payloads", () => {
    expect(
      distributionGeoScaleForCountryMerge(
        {
          countries: {},
          sectors: { technology: 0.9, cash: 0.1 },
        },
        0.1,
      ),
    ).toBeCloseTo(0.9, 5);
  });
});
