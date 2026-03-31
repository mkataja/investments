import { describe, expect, it } from "vitest";
import {
  parseSeligsonBondFundDistributions,
  parseSeligsonFundName,
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

describe("parseSeligsonFundName", () => {
  it("strips Salkun and Arvopaperi view suffixes from h1", () => {
    expect(
      parseSeligsonFundName(
        `<div id="content"><h1>Seligson &amp; Co Euro Corporate Bond&nbsp;&nbsp;- Arvopaperien listaus</h1></div>`,
      ),
    ).toBe("Seligson & Co Euro Corporate Bond");
    expect(
      parseSeligsonFundName(
        `<div id="content"><h1>Test Fund - Salkun jakaumat</h1></div>`,
      ),
    ).toBe("Test Fund");
  });
});

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

const BOND_ALLOCATION_HTML = `<div id="content"><h1>Test Bond - Salkun jakaumat</h1>
  <table class="fundprobe">
	<tr class="darkheader">
		<td class="td-80"><b>Allokaatio</b></td>
		<td class="td-20 right"><b>Osuus %</b></td>
	</tr>
	<tr style="background-color: #FFFFFF;">
		<td class="td-80">Korkosijoitukset</td>
		<td class="td-20 right">97,41</td>
	</tr><tr style="background-color: #DDDDDD;">
		<td class="td-80">Käteinen / tilisijoitukset</td>
		<td class="td-20 right">2,59</td>
	</tr>
  </table>
  <table class="fundprobe">
	<tr class="darkheader">
		<td class="td-80"><b>Korkosijoitusten jakauma</b></td>
		<td class="td-20 right"><b>Osuus %</b></td>
	</tr>
	<tr style="background-color: #FFFFFF;">
		<td class="td-80">Pitkät korot (yrityslainat)</td>
		<td class="td-20 right">97,85</td>
	</tr><tr style="background-color: #DDDDDD;">
		<td class="td-80">Pitkät korot (valtionlainat)</td>
		<td class="td-20 right">2,15</td>
	</tr><tr style="background-color: #FFFFFF;">
		<td class="td-80">Lyhyet korot</td>
		<td class="td-20 right">0,00</td>
	</tr>
  </table></div>`;

const BOND_COUNTRY_HTML = `<div id="content">
  <table class="fundprobe">
	<tr class="darkheader">
		<td class="big"><b>Pitkien korkosijoitusten maajakauma &ndash; Test</b></td>
		<td class="medium right"><b>Osuus %</b></td>
	</tr>
	<tr><td class="big">Ranska</td><td class="medium right">50,0</td></tr>
	<tr><td class="big">Saksa</td><td class="medium right">50,0</td></tr>
  </table></div>`;

describe("parseSeligsonBondFundDistributions", () => {
  it("combines allocation, bond-type split, and long-bond countries", () => {
    const { payload } = parseSeligsonBondFundDistributions(
      BOND_ALLOCATION_HTML,
      BOND_COUNTRY_HTML,
    );
    expect(payload.sectors.cash).toBeCloseTo(0.0259, 4);
    expect(payload.sectors.long_corporate_bonds).toBeCloseTo(
      0.9741 * 0.9785,
      4,
    );
    expect(payload.sectors.long_government_bonds).toBeCloseTo(
      0.9741 * 0.0215,
      4,
    );
    expect(payload.sectors.short_bonds).toBeCloseTo(0, 5);
    expect(payload.countries.FR).toBeCloseTo(0.5, 5);
    expect(payload.countries.DE).toBeCloseTo(0.5, 5);
  });
});
