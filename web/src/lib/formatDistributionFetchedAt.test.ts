import { describe, expect, it } from "vitest";
import { formatDistributionFetchedAt } from "./formatDistributionFetchedAt";

describe("formatDistributionFetchedAt", () => {
  it("formats date-only strings as a local date", () => {
    expect(formatDistributionFetchedAt("2024-06-15")).toMatch(/2024/);
    expect(formatDistributionFetchedAt("2024-06-15")).toMatch(/15/);
  });

  it("shows date only when local time is midnight", () => {
    const s = "2026-03-30T00:00:00";
    const out = formatDistributionFetchedAt(s);
    expect(out).not.toMatch(/:/);
  });

  it("shows date and time when local time is not midnight", () => {
    const s = "2026-03-30T14:30:00";
    const out = formatDistributionFetchedAt(s);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns trimmed input when not parseable as a date", () => {
    expect(formatDistributionFetchedAt("not-a-date")).toBe("not-a-date");
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(formatDistributionFetchedAt("")).toBe("");
    expect(formatDistributionFetchedAt("   ")).toBe("");
  });
});
