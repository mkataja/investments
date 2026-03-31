import { describe, expect, it } from "vitest";
import {
  SELIGSON_TSV_HEADER,
  SELIGSON_TSV_HEADER_SV,
  buildSeligsonExternalId,
  normalizeSeligsonFundNameForMatch,
  parseSeligsonTradeDateDMY,
  parseSeligsonTransactionsTsv,
} from "./seligsonTransactions.js";

const HEADER_LINE = SELIGSON_TSV_HEADER.join("\t");
const HEADER_LINE_SV = SELIGSON_TSV_HEADER_SV.join("\t");

describe("parseSeligsonTradeDateDMY", () => {
  it("parses variable-width d.m.yyyy", () => {
    expect(parseSeligsonTradeDateDMY("13.1.2026")).toBe("2026-01-13");
    expect(parseSeligsonTradeDateDMY("8.10.2025")).toBe("2025-10-08");
    expect(parseSeligsonTradeDateDMY("29.4.2025")).toBe("2025-04-29");
  });

  it("returns null for invalid input", () => {
    expect(parseSeligsonTradeDateDMY("2026-01-13")).toBeNull();
    expect(parseSeligsonTradeDateDMY("")).toBeNull();
  });
});

describe("normalizeSeligsonFundNameForMatch", () => {
  it("strips trailing Acc/Dst (A)/(B) for DB matching", () => {
    expect(normalizeSeligsonFundNameForMatch("Seligson & Co Aasia (A)")).toBe(
      "Seligson & Co Aasia",
    );
    expect(normalizeSeligsonFundNameForMatch("Fund (B)")).toBe("Fund");
    expect(normalizeSeligsonFundNameForMatch("Fund (a)")).toBe("Fund");
  });

  it("leaves names without that suffix unchanged", () => {
    expect(normalizeSeligsonFundNameForMatch("Seligson & Co Aasia")).toBe(
      "Seligson & Co Aasia",
    );
  });
});

describe("buildSeligsonExternalId", () => {
  it("is stable for the same logical row", () => {
    const a = buildSeligsonExternalId(
      "2026-01-13",
      "Merkintä",
      "Seligson & Co Perheyhtiöt (A)",
      "9.4179",
    );
    const b = buildSeligsonExternalId(
      "2026-01-13",
      "Merkintä",
      "Seligson & Co Perheyhtiöt (A)",
      "9.4179",
    );
    expect(a).toBe(b);
    expect(a).toContain("2026-01-13");
    expect(a).toContain("Merkintä");
  });
});

describe("parseSeligsonTransactionsTsv", () => {
  it("parses a minimal 8-column block with empty Tyyppi and infers buy/sell from Summa", () => {
    const tsv = `${HEADER_LINE}
24605	13.1.2026		Seligson & Co Perheyhtiöt (A)	53,0900	9,4179	0,00	500,00
24605	29.4.2025		Seligson & Co Suomi Indeksirahasto (A)	11,6920	42,5434	0,50	-496,92`;

    const out = parseSeligsonTransactionsTsv(tsv);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.rows).toHaveLength(2);

    const buy = out.rows.find((r) => r.side === "buy");
    expect(buy?.fundName).toBe("Seligson & Co Perheyhtiöt (A)");
    expect(buy?.quantity).toBe("9.4179");
    expect(buy?.unitPrice).toBe("53.0900");
    expect(buy?.currency).toBe("EUR");

    const sell = out.rows.find((r) => r.side === "sell");
    expect(sell?.fundName).toBe("Seligson & Co Suomi Indeksirahasto (A)");
    expect(sell?.quantity).toBe("42.5434");
  });

  it("ignores a junk first line and parses a valid eight-column row", () => {
    const tsv = "Salkku\tWrong\t...\n24605\t13.1.2026\t\tX\t1\t1\t0\t1";
    const out = parseSeligsonTransactionsTsv(tsv);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.fundName).toBe("X");
  });

  it("returns an error when no line looks like a transaction", () => {
    const tsv = "Notes\nRandom text\nNo account column here";
    const out = parseSeligsonTransactionsTsv(tsv);
    expect(out.ok).toBe(false);
    if (out.ok) {
      return;
    }
    expect(out.errors[0]).toMatch(/Could not find a Seligson transaction row/i);
  });

  it("strips BOM and ignores blank lines", () => {
    const body =
      "24605	13.1.2026		Seligson & Co Pharos (A)	32,5760	15,3487	0,00	500,00";
    const tsv = `\uFEFF${HEADER_LINE}\n\n${body}\n`;
    const out = parseSeligsonTransactionsTsv(tsv);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.fundName).toBe("Seligson & Co Pharos (A)");
  });

  it("accepts explicit Merkintä / Lunastus when Tyyppi is set", () => {
    const tsv = `${HEADER_LINE}
24605	1.1.2026	Merkintä	Seligson & Co Pharos (A)	10	5	0	50,00
24605	2.1.2026	Lunastus	Seligson & Co Pharos (A)	10	5	0	-50,00`;

    const out = parseSeligsonTransactionsTsv(tsv);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.rows.map((r) => r.side)).toEqual(["buy", "sell"]);
  });

  it("parses Swedish header (9 columns), Teckning/Inlösning, messy rows, and Totalt belopp footer", () => {
    const tsv = `${HEADER_LINE_SV}
24605	13.1.2026	Teckning	

Seligson & Co Familjebolag (A)
	53,0900	9,4179	0,00	500,00	
24605	8.10.2025	Teckning	

Seligson & Co Pharos (A)
	32,5760	15,3487	0,00	500,00	
24605	29.4.2025	Inlösning	

Seligson & Co Finland Indexfond (A)
	11,6920	42,5434	0,50	-496,92	
Totalt belopp						0,50	503,08	`;

    const out = parseSeligsonTransactionsTsv(tsv);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.rows).toHaveLength(3);
    expect(out.rows.filter((r) => r.side === "buy")).toHaveLength(2);
    expect(out.rows.filter((r) => r.side === "sell")).toHaveLength(1);
    expect(out.rows.find((r) => r.side === "sell")?.fundName).toBe(
      "Seligson & Co Finland Indexfond (A)",
    );
  });

  it("parses Swedish nine-column single-line rows in legacy mode", () => {
    const tsv = `${HEADER_LINE_SV}
24605	29.4.2025	Inlösning	Seligson & Co Finland Indexfond (A)	11,6920	42,5434	0,50	-496,92	`;

    const out = parseSeligsonTransactionsTsv(tsv);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.side).toBe("sell");
  });
});
