import { describe, expect, it } from "vitest";
import { parseFundValuesTable } from "./seligsonFundValues.js";

const SAMPLE_HTML = `<table class="rahasto">
<tr><th>Rahasto</th><th>Pvm</th><th>Arvo</th></tr>
<tr><td colspan="11" class="separator">Indeksirahastot</td></tr>
<tr>
  <td><a href="/x">Eurooppa</a></td>
  <td data-label="Pvm">30.03.2026</td>
  <td data-label="Arvo">5,589 €</td>
</tr>
</table>`;

describe("parseFundValuesTable", () => {
  it("parses NAV cell", () => {
    const rows = parseFundValuesTable(SAMPLE_HTML);
    expect(rows.length).toBe(1);
    expect(rows[0]?.fundLabel).toBe("Eurooppa");
    expect(rows[0]?.value).toBeCloseTo(5589, 3);
    expect(rows[0]?.currency).toBe("EUR");
  });
});
