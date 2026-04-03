import { describe, expect, it } from "vitest";
import {
  formatDateTimeLocalInputValue,
  formatInstantForDisplay,
  formatLocalDateTimeYmdHm,
  parseLocalDateTimeYmdHm,
} from "./dateTimeFormat";
import { APP_LOCALE } from "./locale";

describe("formatDateTimeLocalInputValue", () => {
  it("formats local date and time with zero padding", () => {
    const d = new Date(2026, 2, 9, 8, 5, 0, 0);
    expect(formatDateTimeLocalInputValue(d)).toBe("2026-03-09T08:05");
  });
});

describe("formatLocalDateTimeYmdHm / parseLocalDateTimeYmdHm", () => {
  it("formats with a space between date and time", () => {
    const d = new Date(2026, 2, 9, 8, 5, 0, 0);
    expect(formatLocalDateTimeYmdHm(d)).toBe("2026-03-09 08:05");
  });

  it("round-trips space-separated local date/time", () => {
    const d0 = new Date(2026, 2, 30, 14, 7, 0, 0);
    const s = formatLocalDateTimeYmdHm(d0);
    const d1 = parseLocalDateTimeYmdHm(s);
    expect(d1).not.toBeNull();
    expect(d1?.getTime()).toBe(d0.getTime());
  });

  it("accepts T as separator like datetime-local", () => {
    const d = parseLocalDateTimeYmdHm("2026-03-09T08:05");
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(9);
    expect(d?.getHours()).toBe(8);
    expect(d?.getMinutes()).toBe(5);
  });

  it("returns null for invalid calendar dates and bad strings", () => {
    expect(parseLocalDateTimeYmdHm("2026-02-30 12:00")).toBeNull();
    expect(parseLocalDateTimeYmdHm("")).toBeNull();
    expect(parseLocalDateTimeYmdHm("nope")).toBeNull();
  });
});

describe("formatInstantForDisplay", () => {
  const dateOnlyFormatterUtc = new Intl.DateTimeFormat(APP_LOCALE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
  const dateTimeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  it("shows YYYY-MM-DD only for UTC midnight (calendar-day storage)", () => {
    expect(formatInstantForDisplay("2024-06-15T00:00:00.000Z")).toBe(
      dateOnlyFormatterUtc.format(new Date("2024-06-15T00:00:00.000Z")),
    );
  });

  it("shows YYYY-MM-DD only for plain YYYY-MM-DD", () => {
    expect(formatInstantForDisplay("2024-06-15")).toBe(
      dateOnlyFormatterUtc.format(new Date(Date.UTC(2024, 5, 15))),
    );
  });

  it("shows localized date and time when UTC time is not midnight", () => {
    const raw = "2026-03-25T15:39:00.000Z";
    const out = formatInstantForDisplay(raw);
    expect(out).toBe(dateTimeFormatter.format(new Date(raw)));
  });

  it("returns non-parseable input unchanged", () => {
    expect(formatInstantForDisplay("not a date")).toBe("not a date");
  });
});
