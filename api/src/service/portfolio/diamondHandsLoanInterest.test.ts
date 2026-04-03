import { describe, expect, it } from "vitest";
import {
  calendarDaysApartUtc,
  closestObservationRateForDate,
} from "./diamondHandsLoanInterest.js";

describe("calendarDaysApartUtc", () => {
  it("counts across month boundary", () => {
    expect(calendarDaysApartUtc("2024-01-31", "2024-02-01")).toBe(1);
  });
});

describe("closestObservationRateForDate", () => {
  const obs = [
    { date: "2024-01-01", rate: 0.01 },
    { date: "2024-01-10", rate: 0.02 },
    { date: "2024-01-20", rate: 0.03 },
  ];

  it("picks exact match", () => {
    expect(closestObservationRateForDate(obs, "2024-01-10")).toBe(0.02);
  });

  it("picks nearest", () => {
    expect(closestObservationRateForDate(obs, "2024-01-14")).toBe(0.02);
    expect(closestObservationRateForDate(obs, "2024-01-16")).toBe(0.03);
  });

  it("midpoint tie prefers earlier fixing", () => {
    expect(closestObservationRateForDate(obs, "2024-01-15")).toBe(0.02);
  });

  it("tie-breaks to earlier observation", () => {
    const tie = [
      { date: "2024-01-10", rate: 0.02 },
      { date: "2024-01-20", rate: 0.03 },
    ];
    expect(closestObservationRateForDate(tie, "2024-01-15")).toBe(0.02);
  });

  it("returns 0 when empty", () => {
    expect(closestObservationRateForDate([], "2024-01-01")).toBe(0);
  });
});
