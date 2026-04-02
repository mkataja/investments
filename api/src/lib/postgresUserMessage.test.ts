import { describe, expect, it } from "vitest";
import {
  duplicateSeligsonFundInstrumentMessage,
  userFacingMessageFromDbError,
} from "./postgresUserMessage.js";

describe("userFacingMessageFromDbError", () => {
  it("maps seligson_distribution_cache_html_source_ck", () => {
    const err = Object.assign(new Error("violates check constraint"), {
      code: "23514",
      constraint: "seligson_distribution_cache_html_source_ck",
    });
    expect(userFacingMessageFromDbError(err)).toMatch(/Seligson HTML cache/);
  });

  it("maps from message substring when constraint field missing", () => {
    const err = new Error(
      'new row for relation "seligson_distribution_cache" violates check constraint "seligson_distribution_cache_html_source_ck"',
    );
    expect(userFacingMessageFromDbError(err)).toMatch(/Seligson HTML cache/);
  });

  it("returns null for unrelated errors", () => {
    expect(userFacingMessageFromDbError(new Error("other"))).toBeNull();
  });
});

describe("duplicateSeligsonFundInstrumentMessage", () => {
  it("maps instruments_seligson_fund_id_uidx", () => {
    const err = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "instruments_seligson_fund_id_uidx",
    });
    expect(duplicateSeligsonFundInstrumentMessage(err)).toMatch(
      /already exists/,
    );
  });
});
