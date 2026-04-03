import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseSveaBankPaste,
  parseSveaBookingDateDdMmYy,
  parseSveaSummaEuroaLine,
} from "./sveaTransactions.js";

describe("parseSveaBookingDateDdMmYy", () => {
  it("maps two-digit year 70–99 to 19xx and lower to 20xx", () => {
    expect(parseSveaBookingDateDdMmYy("11.11.20")).toBe("2020-11-11");
    expect(parseSveaBookingDateDdMmYy("01.01.99")).toBe("1999-01-01");
    expect(parseSveaBookingDateDdMmYy("7.3.26")).toBe("2026-03-07");
  });

  it("returns null for invalid input", () => {
    expect(parseSveaBookingDateDdMmYy("2026-03-07")).toBeNull();
    expect(parseSveaBookingDateDdMmYy("")).toBeNull();
  });
});

describe("parseSveaSummaEuroaLine", () => {
  it("parses spaced thousands and unicode minus", () => {
    expect(parseSveaSummaEuroaLine("\t\u22121 024,50 euroa")).toBe("-1024.50");
    expect(parseSveaSummaEuroaLine("2 000,00 euroa")).toBe("2000.00");
  });

  it("returns null without euroa suffix", () => {
    expect(parseSveaSummaEuroaLine("2 000,00")).toBeNull();
  });
});

describe("parseSveaBankPaste", () => {
  it("parses date, optional note, summa, saldo", () => {
    const text = `Tilitapahtumat
07.03.26
\t\u22121 024,50 euroa
15 000,00 euroa
28.02.26
Avslut av konto
\t5 024,50 euroa
14 024,50 euroa
`;
    const r = parseSveaBankPaste(text);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      tradeDate: "2026-02-28",
      side: "buy",
      quantity: "5024.50",
      unitPrice: "1",
      currency: "EUR",
    });
    expect(r.rows[1]).toMatchObject({
      tradeDate: "2026-03-07",
      side: "sell",
      quantity: "1024.50",
    });
  });

  it("allows last transaction without saldo line", () => {
    const text = `01.01.26
\t100,00 euroa
`;
    const r = parseSveaBankPaste(text);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.side).toBe("buy");
  });

  it("errors when a second date appears before Summa", () => {
    const text = `01.01.26
02.01.26
\t100,00 euroa
`;
    const r = parseSveaBankPaste(text);
    expect(r.ok).toBe(false);
    if (r.ok) {
      return;
    }
    expect(r.errors.some((e) => /another date/i.test(e))).toBe(true);
  });

  it("disambiguates duplicate date, amount, and note via externalId seq", () => {
    const text = `01.01.26
note
\t100,00 euroa
200,00 euroa
01.01.26
note
\t100,00 euroa
200,00 euroa
`;
    const r = parseSveaBankPaste(text);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]?.externalId).not.toBe(r.rows[1]?.externalId);
  });
});

const repoSveaPath = join(process.cwd(), "..", "svea.txt");

describe("parseSveaBankPaste (repo svea.txt)", () => {
  it("parses the checked-in sample export when present", () => {
    if (!existsSync(repoSveaPath)) {
      return;
    }
    const raw = readFileSync(repoSveaPath, "utf8");
    const r = parseSveaBankPaste(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.rows).toHaveLength(55);
  });
});
