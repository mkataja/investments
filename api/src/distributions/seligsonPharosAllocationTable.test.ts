import { describe, expect, it } from "vitest";
import {
  parseSeligsonPharosAllocationTable,
  parseSeligsonPublicPageFundName,
  parseSeligsonTilanneDate,
} from "./seligsonPharosAllocationTable.js";

const SAMPLE_HTML = `
<html><body>
<p><strong>Tilanne 27.2.2026</strong></p>
<table>
<tr><td>Seligson &amp; Co Eurooppa Indeksirahasto</td><td>27,6 %</td><td>17,6 %</td></tr>
<tr><td>Seligson &amp; Co Pohjois-Amerikka Indeksirahasto</td><td>25,8 %</td><td>16,4 %</td></tr>
<tr><td><strong>YHTEENSÄ</strong></td><td>100,0 %</td><td>63,7 %</td></tr>
</table>
</body></html>
`;

describe("parseSeligsonPharosAllocationTable", () => {
  it("parses fund share column and skips totals", () => {
    const { rows, asOfDate } = parseSeligsonPharosAllocationTable(SAMPLE_HTML);
    expect(asOfDate).toBe("2026-02-27");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.rawLabel).toContain("Eurooppa");
    expect(rows[0]?.pctOfFund).toBeCloseTo(0.176 / (0.176 + 0.164), 5);
    expect(rows[1]?.rawLabel).toContain("Pohjois-Amerikka");
  });
});

describe("parseSeligsonPublicPageFundName", () => {
  it("prefers h1 over title when both present", () => {
    expect(
      parseSeligsonPublicPageFundName(
        "<html><head><title>Varainhoitorahasto Pharoksen sijoitukset – Seligson</title></head><body><h1>Varainhoitorahasto Pharoksen sijoitukset</h1></body></html>",
      ),
    ).toBe("Varainhoitorahasto Pharoksen sijoitukset");
  });

  it("parses title before pipe or dash when no h1", () => {
    expect(
      parseSeligsonPublicPageFundName(
        "<html><head><title>Seligson &amp; Co Pharos (A) | Seligson</title></head><body></body></html>",
      ),
    ).toContain("Pharos");
    expect(
      parseSeligsonPublicPageFundName(
        "<html><head><title>Foo – Bar – Site</title></head><body></body></html>",
      ),
    ).toBe("Foo");
  });

  it("uses trimmed h1 when no title", () => {
    expect(
      parseSeligsonPublicPageFundName(
        "<html><body><h1>  My fund name  </h1></body></html>",
      ),
    ).toBe("My fund name");
  });
});

describe("parseSeligsonTilanneDate", () => {
  it("extracts ISO date from heading", () => {
    expect(parseSeligsonTilanneDate("<p>Tilanne 1.3.2026</p>")).toBe(
      "2026-03-01",
    );
  });
});
