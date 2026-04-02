import { normalizeIsinForStorage } from "@investments/lib/isin";

/** Expand ISIN body (letters A–Z → two-digit values 10–35) per ISO 6166. */
function expandIsinBodyToDigitString(body11: string): string {
  let out = "";
  for (const c of body11.toUpperCase()) {
    if (c >= "0" && c <= "9") {
      out += c;
    } else if (c >= "A" && c <= "Z") {
      const n = c.charCodeAt(0) - 55;
      out += String(n);
    }
  }
  return out;
}

/** Luhn (mod 10) check digit for the expanded digit string (ISO 6166 ISIN). */
function luhnCheckDigitFromExpandedDigits(expanded: string): string {
  const digits = expanded.split("").map((d) => Number.parseInt(d, 10));
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let v = digits[i] ?? 0;
    if (i % 2 === 0) {
      v *= 2;
      if (v > 9) {
        v = Math.floor(v / 10) + (v % 10);
      }
    }
    sum += v;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Build a US ISIN from a 9-character CUSIP (no OpenFIGI ISIN required).
 * Returns null if the CUSIP is not a plausible 9-char alphanumeric.
 */
export function computeUsIsinFromCusip9(cusip: string): string | null {
  const c = cusip.replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-Z]{9}$/.test(c)) {
    return null;
  }
  const body = `US${c}`;
  const expanded = expandIsinBodyToDigitString(body);
  const check = luhnCheckDigitFromExpandedDigits(expanded);
  const full = `${body}${check}`;
  return normalizeIsinForStorage(full);
}
