import { describe, expect, it } from "vitest";
import { assertOfficialApiUrl } from "../src/meli/endpoints.js";
import {
  catalogProductMatchesItem,
  classifyCatalogProduct,
  classifyCatalogProductStatus,
  deduplicateCatalogProducts,
  hasCatalogSellerReputation,
  isCatalogProductHighlight,
  isCatalogThirdParty,
  isValidCatalogProductId,
  type CatalogHighlightAttempt,
} from "../src/probe/catalog-products.js";
import { normalizeSalePrice } from "../src/probe/prices.js";
import { reportContainsSecret, sanitizeForReport } from "../src/report/redaction.js";

const attempt = (content: CatalogHighlightAttempt["content"], categoryId = "MLB10"): CatalogHighlightAttempt => ({
  rootId: "MLB1", rootName: "Família", categoryId, categoryName: "Folha", httpStatus: 200, content,
});

describe("0A-LIVE-D catalog PRODUCT discovery", () => {
  it("identifica PRODUCT corretamente", () => {
    expect(isCatalogProductHighlight({ id: "MLB28145944", type: "PRODUCT" })).toBe(true);
  });

  it("não aceita ITEM como PRODUCT", () => {
    expect(isCatalogProductHighlight({ id: "MLB28145944", type: "ITEM" })).toBe(false);
  });

  it("não aceita USER_PRODUCT", () => {
    expect(isCatalogProductHighlight({ id: "MLBU28145944", type: "USER_PRODUCT" })).toBe(false);
  });

  it("valida ID PRODUCT estritamente", () => {
    expect(isValidCatalogProductId("MLB40310740")).toBe(true);
    expect(isValidCatalogProductId("MLBU40310740")).toBe(false);
  });

  it("deduplica PRODUCT preservando origem", () => {
    expect(deduplicateCatalogProducts([
      attempt([{ id: "MLB28145944", type: "PRODUCT", position: 1 }], "MLB10"),
      attempt([{ id: "MLB28145944", type: "PRODUCT", position: 2 }], "MLB20"),
    ])).toEqual([{ productId: "MLB28145944", sourceCategoryIds: ["MLB10", "MLB20"], positions: [1, 2] }]);
  });

  it("classifica product detail 200 com ofertas", () => {
    expect(classifyCatalogProduct(200, 200, 2)).toBe("PRODUCT_WITH_OFFERS");
  });

  it("classifica product detail 403 e 404 como fetch failed", () => {
    expect(classifyCatalogProduct(403, 0, 0)).toBe("PRODUCT_FETCH_FAILED");
    expect(classifyCatalogProduct(404, 0, 0)).toBe("PRODUCT_FETCH_FAILED");
  });

  it("classifica rota oficial ausente", () => {
    expect(classifyCatalogProduct(200, 0, 0, false)).toBe("PRODUCT_OFFER_PATH_NOT_DOCUMENTED");
  });

  it("classifica rota oficial restrita", () => {
    expect(classifyCatalogProduct(200, 403, 0)).toBe("PRODUCT_OFFER_PATH_FORBIDDEN");
  });

  it("confirma catalog_product_id match", () => {
    expect(catalogProductMatchesItem("MLB28145944", "MLB28145944")).toBe(true);
    expect(catalogProductMatchesItem("MLB28145944", "MLB999")).toBe(false);
    expect(catalogProductMatchesItem("MLB28145944", null)).toBeNull();
  });

  it("confirma third-party", () => {
    expect(isCatalogThirdParty(296984475, 296984475)).toBe(false);
    expect(isCatalogThirdParty(296984476, 296984475)).toBe(true);
  });

  it("aceita sale_price e regular_amount opcional", () => {
    expect(normalizeSalePrice({ amount: 100, regular_amount: null })).toMatchObject({ amount: 100, regular_amount: null });
  });

  it("aceita reputação parcial", () => {
    expect(hasCatalogSellerReputation({ seller_id: 1, http_status: 200, transactions_completed: 5 })).toBe(true);
  });

  it("registra 429 sem inventar fallback", () => {
    expect(classifyCatalogProduct(200, 429, 0)).toBe("PRODUCT_DETAIL_ONLY");
  });

  it("classifica todos os statuses formais", () => {
    const base = { productCandidates: 3, productDetailsPass: 3, associatedOffers: 3, thirdPartyOffers: 3, currentPrices: 3, sellersWithReputation: 1 };
    expect(classifyCatalogProductStatus(base)).toBe("PASS_0A_LIVE_CATALOG_PRODUCT_DISCOVERY");
    expect(classifyCatalogProductStatus({ ...base, productDetailsPass: 0 })).toBe("BLOCKED_0A_LIVE_PRODUCT_DETAIL");
    expect(classifyCatalogProductStatus({ ...base, associatedOffers: 0, thirdPartyOffers: 0, currentPrices: 0 })).toBe("BLOCKED_0A_LIVE_PRODUCT_TO_OFFER");
    expect(classifyCatalogProductStatus({ ...base, currentPrices: 0 })).toBe("BLOCKED_0A_LIVE_CATALOG_OFFER_PRICE");
    expect(classifyCatalogProductStatus({ ...base, sellersWithReputation: 0 })).toBe("PARTIAL_0A_LIVE_CATALOG_PRODUCT_DISCOVERY");
  });

  it("sanitiza relatório e secrets", () => {
    const safe = sanitizeForReport({ product_id: "MLB1", ["access_" + "token"]: "synthetic-test-value", cookie: "x" });
    expect(safe).toEqual({ product_id: "MLB1" });
    expect(reportContainsSecret(JSON.stringify(safe))).toBe(false);
  });

  it("allowlist contém só as rotas documentadas necessárias", () => {
    expect(assertOfficialApiUrl("/products/MLB28145944").pathname).toBe("/products/MLB28145944");
    expect(assertOfficialApiUrl("/products/MLB28145944/items").pathname).toBe("/products/MLB28145944/items");
    expect(() => assertOfficialApiUrl("/products/MLB28145944/offers")).toThrow("Endpoint não permitido");
  });
});
