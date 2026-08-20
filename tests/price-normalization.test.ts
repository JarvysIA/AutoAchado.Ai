import { describe, expect, it } from "vitest";
import { normalizePrices, normalizeSalePrice } from "../src/probe/prices";

describe("normalização de preços", () => {
  it("normaliza sale_price sem inventar campos", () => {
    expect(normalizeSalePrice({ amount: 99.9, regular_amount: null, currency_id: "BRL", metadata: { promotion: true } })).toEqual({
      amount: 99.9,
      regular_amount: null,
      currency_id: "BRL",
      reference_date: null,
      metadata_shape: ["promotion"],
    });
  });

  it("normaliza prices e condições de vigência", () => {
    expect(normalizePrices({ prices: [{ type: "promotion", amount: 80, regular_amount: 100, conditions: { start_time: "a", end_time: "b" }, last_updated: "c" }] })).toEqual([
      { type: "promotion", amount: 80, regular_amount: 100, start_time: "a", end_time: "b", last_updated: "c" },
    ]);
  });
});
