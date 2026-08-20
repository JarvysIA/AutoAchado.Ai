import { describe, expect, it } from "vitest";
import {
  classifyDirectItemStatus,
  deduplicateDirectItems,
  hasDirectSellerReputation,
  isCurrentPricePass,
  isDirectItemHighlight,
  isDirectThirdParty,
  isItemDetailPass,
  isValidDirectItemId,
  shouldStopDirectExpansion,
  shouldTryNextLeaf,
  type DirectHighlightAttempt,
  type DirectItemDetailEvidence,
  type DirectSellerEvidence,
} from "../src/probe/direct-items.js";
import { normalizeSalePrice } from "../src/probe/prices.js";
import { Availability } from "../src/report/availability.js";
import { reportContainsSecret, sanitizeForReport } from "../src/report/redaction.js";

const attempt = (content: DirectHighlightAttempt["content"], categoryId = "MLB10"): DirectHighlightAttempt => ({
  rootId: "MLB1",
  rootName: "Família",
  categoryId,
  categoryName: "Folha",
  httpStatus: 200,
  content,
});

const detail = (httpStatus: number, sellerId?: number): DirectItemDetailEvidence => ({
  itemId: "MLB1013100916",
  sourceCategoryIds: ["MLB10"],
  httpStatus,
  data: sellerId === undefined ? null : { id: "MLB1013100916", seller_id: sellerId },
  thirdParty: sellerId !== undefined && sellerId !== 296984475,
});

describe("0A-LIVE-C direct ITEM discovery", () => {
  it("identifica corretamente type ITEM", () => {
    expect(isDirectItemHighlight({ id: "MLB1013100916", type: "ITEM" })).toBe(true);
  });

  it("não trata PRODUCT como ITEM", () => {
    expect(isDirectItemHighlight({ id: "MLB26380332", type: "PRODUCT" })).toBe(false);
  });

  it("não trata USER_PRODUCT como ITEM", () => {
    expect(isDirectItemHighlight({ id: "MLBU3065974040", type: "USER_PRODUCT" })).toBe(false);
  });

  it("deduplica ITEM preservando categorias e posições", () => {
    const result = deduplicateDirectItems([
      attempt([{ id: "MLB1013100916", type: "ITEM", position: 1 }], "MLB10"),
      attempt([{ id: "MLB1013100916", type: "ITEM", position: 2 }], "MLB20"),
    ]);
    expect(result).toEqual([{ itemId: "MLB1013100916", sourceCategoryIds: ["MLB10", "MLB20"], positions: [1, 2] }]);
  });

  it("valida estritamente /^MLB\\d+$/", () => {
    expect(isValidDirectItemId("MLB2179812537")).toBe(true);
    expect(isValidDirectItemId("MLBU2179812537")).toBe(false);
    expect(isValidDirectItemId("MLB1<script>")).toBe(false);
  });

  it("confirma third-party por seller_id", () => {
    expect(isDirectThirdParty(296984475, 296984475)).toBe(false);
    expect(isDirectThirdParty(296984476, 296984475)).toBe(true);
  });

  it("classifica item detail HTTP 200 com seller", () => {
    expect(isItemDetailPass(detail(200, 123))).toBe(true);
  });

  it("trata item detail 403 e 404 como falha factual", () => {
    expect(isItemDetailPass(detail(403))).toBe(false);
    expect(isItemDetailPass(detail(404))).toBe(false);
  });

  it("aceita sale_price amount válido", () => {
    expect(
      isCurrentPricePass({
        itemId: "MLB1",
        salePrice: { httpStatus: 200, availability: Availability.AVAILABLE, data: normalizeSalePrice({ amount: 10 }) },
        prices: { httpStatus: 404, availability: Availability.NOT_FOUND, data: [] },
      }),
    ).toBe(true);
  });

  it("não exige regular_amount", () => {
    expect(normalizeSalePrice({ amount: 10, regular_amount: null })).toMatchObject({ amount: 10, regular_amount: null });
  });

  it("aceita reputação parcial confiável", () => {
    const seller: DirectSellerEvidence = {
      sellerId: 1,
      httpStatus: 200,
      nickname: null,
      levelId: null,
      powerSellerStatus: null,
      transactionsCompleted: 5,
      ratings: null,
      siteStatus: "active",
    };
    expect(hasDirectSellerReputation(seller)).toBe(true);
  });

  it("considera Highlights 404 elegível para fallback", () => {
    expect(shouldTryNextLeaf(404)).toBe(true);
  });

  it("tenta segunda e terceira folha até encontrar HTTP 200", () => {
    const attempted: number[] = [];
    for (const status of [404, 404, 200]) {
      attempted.push(status);
      if (!shouldTryNextLeaf(status)) break;
    }
    expect(attempted).toEqual([404, 404, 200]);
  });

  it("interrompe expansão em 429", () => {
    expect(shouldStopDirectExpansion(429)).toBe(true);
    expect(shouldTryNextLeaf(429)).toBe(false);
  });

  it("classifica todos os resultados formais", () => {
    const base = {
      highlights200Categories: 2,
      directItemCandidates: 3,
      itemDetailsPass: 3,
      thirdPartyItems: 3,
      currentPrices: 3,
      sellersWithReputation: 1,
    };
    expect(classifyDirectItemStatus(base)).toBe("PASS_0A_LIVE_DIRECT_ITEM_DISCOVERY");
    expect(classifyDirectItemStatus({ ...base, directItemCandidates: 2 })).toBe("BLOCKED_0A_LIVE_NO_DIRECT_ITEMS");
    expect(classifyDirectItemStatus({ ...base, itemDetailsPass: 0 })).toBe("BLOCKED_0A_LIVE_DIRECT_ITEM_DETAIL");
    expect(classifyDirectItemStatus({ ...base, currentPrices: 0 })).toBe("BLOCKED_0A_LIVE_DIRECT_ITEM_PRICE");
    expect(classifyDirectItemStatus({ ...base, sellersWithReputation: 0 })).toBe("PARTIAL_0A_LIVE_DIRECT_ITEM_DISCOVERY");
  });

  it("sanitiza secrets antes do relatório", () => {
    const safe = sanitizeForReport({ item: "MLB1", access_token: "APP_USR-fake-secret", cookie: "fake" });
    expect(safe).toEqual({ item: "MLB1" });
    expect(reportContainsSecret(JSON.stringify(safe))).toBe(false);
  });
});
