import { describe, expect, it } from "vitest";
import { parseSeligsonDistributions } from "./seligson.js";

describe("parseSeligsonDistributions", () => {
  it("does not use macro fallback when country table is empty", () => {
    const other = `<div id="shares"><table class="fundprobe overflow"><tr class="darkheader"><td colspan="6">Sektori</td></tr>
      <tr><td>Teollisuus</td><td></td><td></td><td></td><td></td><td>10,0 %</td></tr>
      </table></div>`;
    const country = `<table class="fundprobe"><tr class="darkheader"><td colspan="2">Maajakauma</td></tr></table>`;
    const { payload, notes } = parseSeligsonDistributions(other, country);
    expect(Object.keys(payload.countries).length).toBe(0);
    expect(notes.some((n) => n.includes("Maajakauma"))).toBe(true);
    expect(payload.sectors.industrials).toBeCloseTo(0.1, 5);
  });

  it("skips Yhteensä and maps unknown first-column labels to other", () => {
    const other = `<div id="shares"><table class="fundprobe overflow"><tr class="darkheader"><td colspan="6">Sektori</td></tr>
      <tr><td>Yhteensä</td><td></td><td></td><td></td><td></td><td>100,0 %</td></tr>
      <tr><td>Tuntematon rivi</td><td></td><td></td><td></td><td></td><td>5,0 %</td></tr>
      </table></div>`;
    const country = `<table class="fundprobe"><tr class="darkheader"><td colspan="2">Maajakauma</td></tr></table>`;
    const { payload } = parseSeligsonDistributions(other, country);
    expect(payload.sectors.other).toBeCloseTo(0.05, 5);
    expect(payload.sectors.industrials).toBeUndefined();
  });
});
