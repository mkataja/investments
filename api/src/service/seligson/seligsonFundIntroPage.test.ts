import { describe, expect, it } from "vitest";
import {
  isSeligsonFundViewerUrl,
  parseSeligsonFundIntroHtml,
  resolveRahastonSijoituksetTableUrl,
} from "./seligsonFundIntroPage.js";

describe("parseSeligsonFundIntroHtml", () => {
  it("parses fid and csv href from intro page HTML", () => {
    const html = `
      <a href="/luotain/FundViewer.php?task=intro&fid=5555&view=40&lang=0">Holdings</a>
      <span><a href="/graafit/pohjoisamerikka_exc.csv">Arvohistoria csv-muodossa</a></span>
    `;
    const out = parseSeligsonFundIntroHtml(
      html,
      "https://www.seligson.fi/suomi/rahastot/rahes_pam.htm",
    );
    expect(out.fid).toBe(5555);
    expect(out.priceHistoryCsvUrl).toBe(
      "https://www.seligson.fi/graafit/pohjoisamerikka_exc.csv",
    );
  });
});

describe("resolveRahastonSijoituksetTableUrl", () => {
  it("resolves absolute href from Rahaston sijoitukset link text", () => {
    const html = `
      <nav>
        <a href="/sco/suomi/rahastot/foo-taulukko/">Rahaston sijoitukset</a>
      </nav>
    `;
    const u = resolveRahastonSijoituksetTableUrl(
      html,
      "https://www.seligson.fi/suomi/rahastot/rahes_pharos.htm",
    );
    expect(u).toBe("https://www.seligson.fi/sco/suomi/rahastot/foo-taulukko/");
  });

  it("returns null when the link is missing", () => {
    expect(
      resolveRahastonSijoituksetTableUrl(
        "<p>No allocation</p>",
        "https://www.seligson.fi/suomi/rahastot/rahes_pam.htm",
      ),
    ).toBeNull();
  });

  it("resolves FundViewer href for typical equity fund intro pages", () => {
    const html = `
      <span><a href="/luotain/FundViewer.php?task=intro&fid=795&view=40&lang=0">Rahaston sijoitukset</a></span>
    `;
    const expectedTable =
      "https://www.seligson.fi/luotain/FundViewer.php?task=intro&fid=795&view=40&lang=0";
    const u = resolveRahastonSijoituksetTableUrl(
      html,
      "https://www.seligson.fi/suomi/rahastot/rahes_brands.htm",
    );
    expect(u).toBe(expectedTable);
    expect(isSeligsonFundViewerUrl(expectedTable)).toBe(true);
  });
});

describe("isSeligsonFundViewerUrl", () => {
  it("is true for luotain FundViewer paths", () => {
    expect(
      isSeligsonFundViewerUrl(
        "https://www.seligson.fi/luotain/FundViewer.php?fid=1&view=40",
      ),
    ).toBe(true);
  });

  it("is false for static allocation table paths (e.g. Pharos)", () => {
    expect(
      isSeligsonFundViewerUrl(
        "https://www.seligson.fi/sco/suomi/rahastot/varainhoitorahasto-pharoksen-sijoitukset-taulukko/",
      ),
    ).toBe(false);
  });

  it("is false for invalid URLs", () => {
    expect(isSeligsonFundViewerUrl("not a url")).toBe(false);
  });
});
