import { describe, expect, it } from "vitest";
import { Availability, classifyAvailability } from "../src/report/availability";

describe("availability", () => {
  it.each([
    [200, true, true, Availability.AVAILABLE],
    [200, true, false, Availability.PARTIAL],
    [200, false, true, Availability.NOT_AVAILABLE_FOR_THIRD_PARTY],
    [403, false, true, Availability.FORBIDDEN],
    [404, false, true, Availability.NOT_FOUND],
    [405, false, true, Availability.UNSUPPORTED],
  ])("classifica HTTP %i", (status, hasData, complete, expected) => {
    expect(classifyAvailability(status, hasData, complete)).toBe(expected);
  });
});
