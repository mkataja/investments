import { describe, expect, it } from "vitest";
import { pickDistributionRowForAssetMixHistory } from "./latestPriceDistribution.js";

type DistRow = Parameters<
  typeof pickDistributionRowForAssetMixHistory
>[0][number];

function distRow(snapshotDate: string, fetchedAtIso: string): DistRow {
  const fetchedAt = new Date(fetchedAtIso);
  return {
    instrumentId: 1,
    snapshotDate,
    fetchedAt,
    source: "test",
    payload: { countries: {}, sectors: {} },
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
  };
}

describe("pickDistributionRowForAssetMixHistory", () => {
  it("returns undefined for empty rows", () => {
    expect(
      pickDistributionRowForAssetMixHistory([], "2026-03-20"),
    ).toBeUndefined();
  });

  it("picks later snapshot when as-of is strictly between two dates", () => {
    const newer = distRow("2026-04-01", "2026-04-01T12:00:00.000Z");
    const older = distRow("2026-03-15", "2026-03-15T12:00:00.000Z");
    const rows: DistRow[] = [newer, older];
    const picked = pickDistributionRowForAssetMixHistory(rows, "2026-03-20");
    expect(picked?.snapshotDate).toBe("2026-04-01");
  });

  it("picks earlier snapshot when as-of equals that date", () => {
    const newer = distRow("2026-04-01", "2026-04-01T12:00:00.000Z");
    const older = distRow("2026-03-15", "2026-03-15T12:00:00.000Z");
    const rows: DistRow[] = [newer, older];
    expect(
      pickDistributionRowForAssetMixHistory(rows, "2026-03-15")?.snapshotDate,
    ).toBe("2026-03-15");
  });

  it("uses earliest snapshot when as-of is before all", () => {
    const newer = distRow("2026-04-01", "2026-04-01T12:00:00.000Z");
    const older = distRow("2026-03-15", "2026-03-15T12:00:00.000Z");
    const rows: DistRow[] = [newer, older];
    expect(
      pickDistributionRowForAssetMixHistory(rows, "2020-01-01")?.snapshotDate,
    ).toBe("2026-03-15");
  });

  it("uses newest snapshot when as-of is after all", () => {
    const newer = distRow("2026-04-01", "2026-04-01T12:00:00.000Z");
    const older = distRow("2026-03-15", "2026-03-15T12:00:00.000Z");
    const rows: DistRow[] = [newer, older];
    expect(
      pickDistributionRowForAssetMixHistory(rows, "2026-06-01")?.snapshotDate,
    ).toBe("2026-04-01");
  });

  it("same snapshot_date: prefers row first in desc fetched_at order", () => {
    const a = distRow("2026-04-01", "2026-04-01T14:00:00.000Z");
    const b = distRow("2026-04-01", "2026-04-01T10:00:00.000Z");
    const rows: DistRow[] = [a, b];
    const picked = pickDistributionRowForAssetMixHistory(rows, "2026-04-01");
    expect(picked?.fetchedAt.toISOString()).toBe(a.fetchedAt.toISOString());
  });
});
