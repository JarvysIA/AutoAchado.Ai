import { describe, expect, it } from "vitest";
import { MeliApiError } from "../src/meli/client.js";
import {
  classifyAlternativeStatus,
  classifyUserProduct,
  deduplicateUserProducts,
  httpStatusOf,
  isThirdPartySeller,
  isValidItemId,
  isValidUserProductId,
  selectPreferredCategory,
  type AlternativeHighlightRow,
} from "../src/probe/alternative.js";
import { normalizeSalePrice } from "../src/probe/prices.js";
import { reportContainsSecret, sanitizeForReport } from "../src/report/redaction.js";

const highlight = (id: string, categoryId: string, type = "USER_PRODUCT"): AlternativeHighlightRow => ({
  id,
  type,
  categoryId,
  categoryName: categoryId,
  httpStatus: 200,
  position: 1,
});

describe("0A-LIVE-B alternative discovery", () => {
  it("seleciona categoria comercial relevante e evita Outros", () => {
    expect(
      selectPreferredCategory(
        [
          { id: "MLB1", name: "Outros" },
          { id: "MLB2", name: "Pneus para Carros" },
          { id: "MLB3", name: "Acessórios" },
        ],
        ["pneu"],
      ),
    ).toEqual({ id: "MLB2", name: "Pneus para Carros" });
  });

  it("deduplica MLBU preservando categorias de origem", () => {
    expect(deduplicateUserProducts([highlight("MLBU1", "MLB10"), highlight("MLBU1", "MLB20")])).toEqual([
      { id: "MLBU1", sourceCategories: ["MLB10", "MLB20"] },
    ]);
  });

  it("valida estritamente USER_PRODUCT ID", () => {
    expect(isValidUserProductId("MLBU3065974040")).toBe(true);
    expect(isValidUserProductId("MLB3065974040")).toBe(false);
    expect(isValidUserProductId("MLBU1<script>")).toBe(false);
  });

  it("valida estritamente item ID MLB", () => {
    expect(isValidItemId("MLB664681522")).toBe(true);
    expect(isValidItemId("MLBU664681522")).toBe(false);
  });

  it("compara seller terceiro sem coerção numérica insegura", () => {
    expect(isThirdPartySeller("296984475", 296984475)).toBe(false);
    expect(isThirdPartySeller("296984476", 296984475)).toBe(true);
    expect(isThirdPartySeller(null, 296984475)).toBe(false);
  });

  it("classifica todas as formas de USER_PRODUCT", () => {
    expect(classifyUserProduct(true, "1", ["MLB1"])).toBe("USER_PRODUCT_WITH_SELLER_AND_ITEM");
    expect(classifyUserProduct(true, "1", [])).toBe("USER_PRODUCT_WITH_SELLER_NO_ITEM");
    expect(classifyUserProduct(true, null, ["MLB1"])).toBe("USER_PRODUCT_WITH_ITEM_NO_SELLER");
    expect(classifyUserProduct(true, null, [])).toBe("USER_PRODUCT_METADATA_ONLY");
    expect(classifyUserProduct(false, null, [])).toBe("USER_PRODUCT_FETCH_FAILED");
  });

  it("sanitiza estruturas do relatório", () => {
    const safe = sanitizeForReport({ id: "MLBU1", access_token: "APP_USR-secret", nested: { cookie: "secret" } });
    expect(safe).toEqual({ id: "MLBU1", nested: {} });
  });

  it("detecta ausência de secrets no relatório", () => {
    expect(reportContainsSecret("MLBU1 MLB1 seller 123 preço 10")).toBe(false);
    expect(reportContainsSecret("Authorization: Bearer secret-value")).toBe(true);
  });

  it("faz fallback formal quando MLBU não resolve item", () => {
    expect(
      classifyAlternativeStatus({
        highlightCount: 5,
        readableUserProducts: 5,
        resolvedUserProducts: 0,
        itemCount: 0,
        thirdPartyCount: 0,
        currentPriceCount: 0,
        completeCategoryCount: 0,
        sellersWithReputation: 0,
      }),
    ).toBe("BLOCKED_0A_LIVE_USER_PRODUCT_TO_ITEM");
  });

  it("aceita sale_price sem regular_amount", () => {
    expect(normalizeSalePrice({ amount: 99, regular_amount: null, currency_id: "BRL" })).toMatchObject({
      amount: 99,
      regular_amount: null,
    });
  });

  it("não torna /prices bloqueante quando sale_price fecha a cadeia", () => {
    expect(
      classifyAlternativeStatus({
        highlightCount: 3,
        readableUserProducts: 3,
        resolvedUserProducts: 3,
        itemCount: 3,
        thirdPartyCount: 3,
        currentPriceCount: 3,
        completeCategoryCount: 3,
        sellersWithReputation: 1,
      }),
    ).toBe("PASS_0A_LIVE_ALTERNATIVE_DISCOVERY");
  });

  it("trata 403, 404 e 429 como evidência sem crash", () => {
    for (const status of [403, 404, 429]) expect(httpStatusOf(new MeliApiError("erro", status))).toBe(status);
  });

  it("emite somente statuses formais permitidos", () => {
    const base = {
      highlightCount: 1,
      readableUserProducts: 1,
      resolvedUserProducts: 1,
      itemCount: 1,
      thirdPartyCount: 1,
      currentPriceCount: 1,
      completeCategoryCount: 1,
      sellersWithReputation: 0,
    };
    expect(classifyAlternativeStatus(base)).toBe("PARTIAL_0A_LIVE_ALTERNATIVE_DISCOVERY");
    expect(classifyAlternativeStatus({ ...base, highlightCount: 0 })).toBe("BLOCKED_0A_LIVE_ALTERNATIVE_DISCOVERY");
    expect(classifyAlternativeStatus({ ...base, currentPriceCount: 0 })).toBe("BLOCKED_0A_LIVE_THIRD_PARTY_PRICE");
  });
});
