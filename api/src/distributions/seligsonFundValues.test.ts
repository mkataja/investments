import { describe, expect, it } from "vitest";
import {
  fundValuesRowMatchesDbName,
  parseFundValuesTable,
} from "./seligsonFundValues.js";

/** Minimal table row for exercising NAV parsing */
function rowHtml(label: string, arvo: string) {
  return `<tr>
  <td><a href="/x">${label}</a></td>
  <td data-label="Pvm">30.03.2026</td>
  <td data-label="Arvo">${arvo}</td>
</tr>`;
}

const SAMPLE_HTML = `<table class="rahasto">
<tr><th>Rahasto</th><th>Pvm</th><th>Arvo</th></tr>
<tr><td colspan="11" class="separator">Indeksirahastot</td></tr>
<tr>
  <td><a href="/x">Eurooppa</a></td>
  <td data-label="Pvm">30.03.2026</td>
  <td data-label="Arvo">5,589 €</td>
</tr>
</table>`;

describe("fundValuesRowMatchesDbName", () => {
  it("maps FundValues short label Global Brands to Global Top 25 Brands", () => {
    expect(
      fundValuesRowMatchesDbName(
        "Global Brands",
        "Seligson & Co Global Top 25 Brands",
      ),
    ).toBe(true);
  });
});

describe("parseFundValuesTable", () => {
  it("parses NAV cell (comma is decimal, not thousands)", () => {
    const rows = parseFundValuesTable(SAMPLE_HTML);
    expect(rows.length).toBe(1);
    expect(rows[0]?.fundLabel).toBe("Eurooppa");
    expect(rows[0]?.value).toBeCloseTo(5.589, 6);
    expect(rows[0]?.currency).toBe("EUR");
  });

  it("parses multi-digit fractional part (live FundValues shape)", () => {
    const html = `<table class="rahasto"><tr><th>R</th><th>P</th><th>A</th></tr>
${rowHtml("Pharma", "2,7224 €")}
</table>`;
    const rows = parseFundValuesTable(html);
    expect(rows[0]?.value).toBeCloseTo(2.7224, 6);
  });

  it("parses two fractional digits", () => {
    const html = `<table class="rahasto"><tr><th>R</th><th>P</th><th>A</th></tr>
${rowHtml("X", "89,21 €")}
</table>`;
    expect(parseFundValuesTable(html)[0]?.value).toBeCloseTo(89.21, 4);
  });
});
