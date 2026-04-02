import { describe, expect, it } from "vitest";
import { parseSeligsonArvohistoriaCsv } from "./seligsonArvohistoriaCsv.js";

describe("parseSeligsonArvohistoriaCsv", () => {
  it("parses d.m.yyyy;comma-decimal lines", () => {
    const text = `29.12.2006;10,0000
02.01.2007;9,9280
`;
    expect(parseSeligsonArvohistoriaCsv(text)).toEqual([
      { priceDate: "2006-12-29", quotedPrice: "10.0000" },
      { priceDate: "2007-01-02", quotedPrice: "9.9280" },
    ]);
  });

  it("strips BOM and skips blank lines", () => {
    const text = "\uFEFF\n\n15.06.1998;1,6819\n";
    expect(parseSeligsonArvohistoriaCsv(text)).toEqual([
      { priceDate: "1998-06-15", quotedPrice: "1.6819" },
    ]);
  });
});
