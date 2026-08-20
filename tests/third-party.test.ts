import { describe, expect, it } from "vitest";
import { isThirdPartyItem } from "../src/probe/items";

describe("item de terceiro", () => {
  it("só confirma terceiro quando seller_id é conhecido e diferente", () => {
    expect(isThirdPartyItem({ seller_id: 200 }, 100)).toBe(true);
    expect(isThirdPartyItem({ seller_id: 100 }, 100)).toBe(false);
    expect(isThirdPartyItem({}, 100)).toBe(false);
  });
});
