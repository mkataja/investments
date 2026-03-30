import { describe, expect, it } from "vitest";
import {
  formatDateTimeLocalInputValue,
  formatInstantForDisplay,
} from "./dateTimeFormat";

describe("formatDateTimeLocalInputValue", () => {
  it("formats local date and time with zero padding", () => {
    const d = new Date(2026, 2, 9, 8, 5, 0, 0);
    expect(formatDateTimeLocalInputValue(d)).toBe("2026-03-09T08:05");
  });
});

describe("formatInstantForDisplay", () => {
  it("shows YYYY-MM-DD only for UTC midnight (calendar-day storage)", () => {
    expect(formatInstantForDisplay("2024-06-15T00:00:00.000Z")).toBe(
      "2024-06-15",
    );
  });

  it("shows YYYY-MM-DD only for plain YYYY-MM-DD", () => {
    expect(formatInstantForDisplay("2024-06-15")).toBe("2024-06-15");
  });

  it("shows YYYY-MM-DD HH:mm in local time when UTC time is not midnight", () => {
    const out = formatInstantForDisplay("2026-03-25T15:39:00.000Z");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("returns non-parseable input unchanged", () => {
    expect(formatInstantForDisplay("not a date")).toBe("not a date");
  });
});
