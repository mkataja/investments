import { describe, expect, it } from "vitest";
import {
  bloombergExchCodeToYahooSuffixes,
  openfigiRowToYahooSymbols,
} from "./openFigi.js";

describe("bloombergExchCodeToYahooSuffixes", () => {
  it("maps Xetra / German codes to .de", () => {
    expect(bloombergExchCodeToYahooSuffixes("GR", "IE00B5BMR087")).toEqual([
      "de",
    ]);
    expect(bloombergExchCodeToYahooSuffixes("GT", "IE00B5BMR087")).toEqual([
      "de",
    ]);
  });

  it("maps London to .l", () => {
    expect(bloombergExchCodeToYahooSuffixes("LN", "IE00BKM4GZ66")).toEqual([
      "l",
    ]);
  });

  it("maps NA for UCITS ISIN to .as", () => {
    expect(bloombergExchCodeToYahooSuffixes("NA", "IE00B4K48X80")).toEqual([
      "as",
    ]);
  });

  it("maps NA for US ISIN to .us", () => {
    expect(bloombergExchCodeToYahooSuffixes("NA", "US0378331005")).toEqual([
      "us",
    ]);
  });
});

describe("openfigiRowToYahooSymbols", () => {
  it("builds Yahoo symbol from ticker and exchange", () => {
    expect(
      openfigiRowToYahooSymbols(
        { ticker: "SXR8", exchCode: "GR" },
        "IE00B5BMR087",
      ),
    ).toEqual(["SXR8.de"]);
    expect(
      openfigiRowToYahooSymbols(
        { ticker: "EIMI", exchCode: "LN" },
        "IE00BKM4GZ66",
      ),
    ).toEqual(["EIMI.l"]);
  });
});
