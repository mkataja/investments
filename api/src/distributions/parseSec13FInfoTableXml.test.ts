import { describe, expect, it } from "vitest";
import { parseSec13FInfoTableXml } from "./parseSec13FInfoTableXml.js";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<informationTable>
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>61960000</value>
    <sshPrnamt>100</sshPrnamt>
    <sshPrnamtType>SH</sshPrnamtType>
  </infoTable>
  <infoTable>
    <nameOfIssuer>OPTION TEST</nameOfIssuer>
    <cusip>111111111</cusip>
    <value>1000</value>
    <putCall>Put</putCall>
  </infoTable>
</informationTable>`;

describe("parseSec13FInfoTableXml", () => {
  it("parses rows and drops options", () => {
    const rows = parseSec13FInfoTableXml(SAMPLE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cusip).toBe("037833100");
    expect(rows[0]?.valueRaw).toBe(61960000);
  });
});
