import {
  normalizeUnicodeMinus,
  parseEuropeanDecimalString,
} from "./degiroTransactions.js";

export const SVEA_PASTE_EXTERNAL_SOURCE = "svea_paste" as const;

const EXTERNAL_ID_SEP = "\u001f";

/** Svea copy-paste may use narrow no-break hyphen (U+2011) for negatives. */
function normalizeSveaNumericText(s: string): string {
  return normalizeUnicodeMinus(s.replace(/\u2011/g, "-"));
}

/**
 * `d.m.yy` (two-digit year) → ISO `yyyy-mm-dd`.
 * Years 70–99 → 19xx; 00–69 → 20xx.
 */
export function parseSveaBookingDateDdMmYy(raw: string): string | null {
  const s = normalizeSveaNumericText(raw.trim());
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(s);
  if (!m) {
    return null;
  }
  const g1 = m[1];
  const g2 = m[2];
  const g3 = m[3];
  if (g1 === undefined || g2 === undefined || g3 === undefined) {
    return null;
  }
  const yy = Number.parseInt(g3, 10);
  if (!Number.isFinite(yy)) {
    return null;
  }
  const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
  const dd = g1.padStart(2, "0");
  const mm = g2.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function trimCell(s: string): string {
  return normalizeSveaNumericText(s)
    .replace(/\u00a0/g, " ")
    .trim();
}

function looksLikeSveaBookingDateLine(line: string): boolean {
  return parseSveaBookingDateDdMmYy(line) !== null;
}

function looksLikeSveaEuroAmountLine(line: string): boolean {
  const t = trimCell(line);
  return /\beuroa\s*$/i.test(t);
}

/**
 * Parse a line such as `\\t‑1 024,50 euroa` into a signed decimal string, or null.
 */
export function parseSveaSummaEuroaLine(line: string): string | null {
  const t = trimCell(line);
  if (!looksLikeSveaEuroAmountLine(t)) {
    return null;
  }
  const withoutEuroa = t.replace(/\s+euroa\s*$/i, "").trim();
  const compact = withoutEuroa.replace(/\s+/g, "");
  return parseEuropeanDecimalString(compact);
}

type SveaParsedRow = {
  tradeDate: string;
  side: "buy" | "sell";
  quantity: string;
  unitPrice: string;
  currency: string;
  externalId: string;
};

type ParseSveaPasteResult =
  | { ok: true; rows: SveaParsedRow[] }
  | { ok: false; errors: string[] };

function splitPasteLines(text: string): string[] {
  const normalized = text.replace(/^\uFEFF/, "");
  return normalized.split(/\r?\n/);
}

function buildSveaExternalId(
  tradeDateIso: string,
  amountDot: string,
  note: string,
  seq: number,
): string {
  return [tradeDateIso, amountDot, note, String(seq)].join(EXTERNAL_ID_SEP);
}

/**
 * Parse Svea account “Tilitapahtumat” copy-paste: Kirjauspäivä (`d.m.yy`), optional Huomautus lines,
 * Summa (`… euroa`), then Saldo (ignored).
 */
export function parseSveaBankPaste(text: string): ParseSveaPasteResult {
  const errors: string[] = [];
  const lines = splitPasteLines(text);
  const rows: SveaParsedRow[] = [];
  const dupKeyCounts = new Map<string, number>();

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = trimCell(raw);
    if (line === "") {
      i++;
      continue;
    }

    if (!looksLikeSveaBookingDateLine(line)) {
      i++;
      continue;
    }

    const tradeDate = parseSveaBookingDateDdMmYy(line);
    if (tradeDate === null) {
      errors.push(`Line ${i + 1}: invalid Kirjauspäivä "${raw.trim()}"`);
      i++;
      continue;
    }

    i++;
    const noteParts: string[] = [];
    let noteScanAborted = false;

    while (i < lines.length) {
      const innerRaw = lines[i] ?? "";
      const inner = trimCell(innerRaw);
      if (inner === "") {
        i++;
        continue;
      }
      if (looksLikeSveaBookingDateLine(inner)) {
        errors.push(
          `Line ${i + 1}: expected Summa (euroa) after ${tradeDate}, got another date`,
        );
        noteScanAborted = true;
        break;
      }
      if (looksLikeSveaEuroAmountLine(inner)) {
        break;
      }
      noteParts.push(inner);
      i++;
    }

    if (noteScanAborted) {
      continue;
    }

    if (i >= lines.length) {
      errors.push(
        `After Kirjauspäivä ${tradeDate}: paste ends before Summa (euroa)`,
      );
      break;
    }

    const summaLine = lines[i] ?? "";
    const amountDot = parseSveaSummaEuroaLine(summaLine);
    if (amountDot === null) {
      errors.push(
        `Line ${i + 1}: invalid Summa "${trimCell(summaLine)}" (expected e.g. 1 024,50 euroa)`,
      );
      i++;
      continue;
    }

    const amountNum = Number.parseFloat(amountDot);
    if (!Number.isFinite(amountNum)) {
      errors.push(`Line ${i + 1}: invalid numeric Summa`);
      i++;
      continue;
    }
    if (amountNum === 0) {
      errors.push(`Line ${i + 1}: Summa is zero`);
      i++;
      continue;
    }

    i++;

    while (i < lines.length) {
      const saldoProbe = trimCell(lines[i] ?? "");
      if (saldoProbe === "") {
        i++;
        continue;
      }
      if (looksLikeSveaBookingDateLine(saldoProbe)) {
        break;
      }
      if (looksLikeSveaEuroAmountLine(saldoProbe)) {
        i++;
        break;
      }
      errors.push(
        `Line ${i + 1}: unexpected line after Summa (expected Saldo or next date)`,
      );
      i++;
      break;
    }

    const noteJoined = noteParts.join(" ").trim();
    const dupKey = `${tradeDate}\n${amountDot}\n${noteJoined}`;
    const seq = dupKeyCounts.get(dupKey) ?? 0;
    dupKeyCounts.set(dupKey, seq + 1);

    const side: "buy" | "sell" = amountNum > 0 ? "buy" : "sell";
    const quantityAbs = amountDot.startsWith("-")
      ? amountDot.slice(1)
      : amountDot;

    rows.push({
      tradeDate,
      side,
      quantity: quantityAbs,
      unitPrice: "1",
      currency: "EUR",
      externalId: buildSveaExternalId(tradeDate, amountDot, noteJoined, seq),
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (rows.length === 0) {
    return {
      ok: false,
      errors: [
        "No Svea transactions found. Paste should include Kirjauspäivä (d.m.yy) and Summa (… euroa) lines.",
      ],
    };
  }

  rows.sort((a, b) => {
    const d = a.tradeDate.localeCompare(b.tradeDate);
    if (d !== 0) {
      return d;
    }
    return a.externalId.localeCompare(b.externalId);
  });

  return { ok: true, rows };
}
