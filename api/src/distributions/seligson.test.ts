import { describe, expect, it } from "vitest";
import {
  parseSeligsonHoldingsDistributions,
  parseSeligsonHoldingsRows,
} from "./seligson.js";

const MINIMAL_HOLDINGS_TABLE = `<div id="content"><h1>Test Fund - Salkun tiedot</h1>
<table class="fundprobe company"><thead><tr class="darkheader">
<td class="big"><b>Yritys</b></td><td class="small"><b>Maa</b></td><td class="small"><b>Toimiala</b></td>
<td class="small right"><b>Osuus EUR</b></td><td class="tiny right"><b>Osuus %</b></td>
</tr></thead><tbody>
<tr><td class="big">ACME CORP</td><td data-label="Maa">Yhdysvallat</td><td data-label="Toimiala">Teknologia</td>
<td class="right">100 000</td><td class="tiny right">10,0</td></tr>
</tbody></table></div>`;

describe("parseSeligsonHoldingsRows", () => {
  it("parses company, country, sector, and weight from holdings table", () => {
    const { rows, notes } = parseSeligsonHoldingsRows(MINIMAL_HOLDINGS_TABLE);
    expect(notes.length).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.companyName).toBe("ACME CORP");
    expect(rows[0]?.countryFi).toBe("Yhdysvallat");
    expect(rows[0]?.toimialaFi).toBe("Teknologia");
    expect(rows[0]?.weight).toBeCloseTo(0.1, 5);
    expect(rows[0]?.isin).toBeNull();
  });
});

describe("parseSeligsonHoldingsDistributions", () => {
  it("maps Finnish Maa/Toimiala to ISO and canonical sectors", () => {
    const { payload } = parseSeligsonHoldingsDistributions(
      MINIMAL_HOLDINGS_TABLE,
    );
    expect(payload.countries.US).toBeCloseTo(0.1, 5);
    expect(payload.sectors.technology).toBeCloseTo(0.1, 5);
  });

  it("attributes cash rows to sectors.cash and skips countries", () => {
    const html = `${MINIMAL_HOLDINGS_TABLE.replace(
      "</tbody>",
      `<tr>
<td class="big">KÄTEINEN JA LYHYET KOROT</td><td data-label="Maa">–</td><td data-label="Toimiala">–</td>
<td class="right">1</td><td class="tiny right">5,0</td></tr>
</tbody>`,
    )}`;
    const { payload } = parseSeligsonHoldingsDistributions(html);
    expect(payload.sectors.cash).toBeCloseTo(0.05, 5);
    expect(payload.countries.US).toBeCloseTo(0.1, 5);
    expect(payload.sectors.technology).toBeCloseTo(0.1, 5);
  });
});
