import { DEFAULT_CLIENT_ID, DEFAULT_REDIRECT_URI } from "../config.js";
import type { DirectItemDiscoveryResult } from "../probe/direct-items.js";

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function renderDirectItemReport(result: DirectItemDiscoveryResult): string {
  return `# 0A-LIVE-C — Direct ITEM Discovery

## Status formal

${result.formalStatus}

## Ambiente

- data/hora: ${result.generatedAt}
- runtime: ${process.env.VERCEL ? "Vercel" : "Node.js local"}
- Client ID: ${DEFAULT_CLIENT_ID}
- Redirect URI: ${DEFAULT_REDIRECT_URI}
- requests aproximadas: ${result.requestCount}

## OAuth

${result.oauth}

- authenticated_user_id: ${result.authenticatedUserId}

## Categorias testadas

${json(result.highlightAttempts.map((attempt) => ({
    rootId: attempt.rootId,
    rootName: attempt.rootName,
    categoryId: attempt.categoryId,
    categoryName: attempt.categoryName,
    httpStatus: attempt.httpStatus,
  })))}

## Highlights

- ITEM: ${result.highlightTypeCounts.ITEM}
- PRODUCT: ${result.highlightTypeCounts.PRODUCT}
- USER_PRODUCT: ${result.highlightTypeCounts.USER_PRODUCT}
- outros: ${result.highlightTypeCounts.OTHER}
- tentativas: ${json(result.highlightAttempts)}

## Direct ITEM candidates

- candidatos únicos: ${result.candidates.length}
- dados: ${json(result.candidates)}

## Item detail

- PASS_ITEM_DETAIL: ${result.repeatability.itemDetailsPass}/${result.itemDetails.length}
- dados: ${json(result.itemDetails)}

## Third-party confirmation

- user autenticado: ${result.authenticatedUserId}
- itens de terceiros: ${result.repeatability.thirdPartyItems}
- sellers distintos: ${new Set(
    result.itemDetails.flatMap((row) => (row.thirdParty && row.data?.seller_id ? [row.data.seller_id] : [])),
  ).size}

## sale_price

- CURRENT_PRICE_PASS: ${result.repeatability.currentPrices}/${result.prices.length}
- regular_amount disponível: ${result.prices.filter((row) => typeof row.salePrice.data?.regular_amount === "number").length}/${result.prices.length}
- dados: ${json(result.prices.map((row) => ({ itemId: row.itemId, salePrice: row.salePrice })))}

## prices

Recurso adicional e não bloqueante.

${json(result.prices.map((row) => ({ itemId: row.itemId, prices: row.prices })))}

## Seller reputation

- sellers com indicador público: ${result.repeatability.sellersWithReputation}/${result.sellers.length}
- dados: ${json(result.sellers)}

## Repetibilidade

${json(result.repeatability)}

## PRODUCT observations

${json(result.productObservations)}

## Compliance

- somente OAuth e APIs oficiais documentadas
- PRODUCT e USER_PRODUCT não foram tratados como ITEM
- sem scraping, browser automation, endpoint privado ou bypass de 403
- expansão interrompida após 429: ${result.stoppedOnRateLimit}
- headers de rate limit: ${json(result.rateLimitHeaders)}

## Limitações

${result.errors.length > 0 ? result.errors.map((error) => `- ${error}`).join("\n") : "Nenhuma limitação adicional registrada nesta execução."}

## Conclusão técnica

${result.formalStatus}

Este status se limita à ramificação Direct ITEM Discovery e não altera automaticamente a decisão global do AutoAchado.AI.

## Próximo passo recomendado

Usar a evidência desta execução para decidir se a ramificação direta é repetível ou se a observação PRODUCT deve ser estudada separadamente em um eventual 0A-LIVE-D.
`;
}
