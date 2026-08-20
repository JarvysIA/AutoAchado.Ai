import { describe, expect, it } from "vitest";
import { assertOfficialApiUrl } from "../src/meli/endpoints.js";

describe("allowlist oficial", () => {
  it("aceita endpoint oficial permitido", () => {
    expect(assertOfficialApiUrl("/sites/MLB/categories").origin).toBe("https://api.mercadolibre.com");
    expect(assertOfficialApiUrl("/user-products/MLBU3065974040").pathname).toBe("/user-products/MLBU3065974040");
    expect(assertOfficialApiUrl("/users/123/items/search?user_product_id=MLBU3065974040").pathname).toBe(
      "/users/123/items/search",
    );
  });

  it("rejeita host externo e endpoint não permitido", () => {
    expect(() => assertOfficialApiUrl("https://example.com/items/MLB1")).toThrow(/não oficial/);
    expect(() => assertOfficialApiUrl("/internal/reverse-engineered")).toThrow(/não permitido/);
  });
});
