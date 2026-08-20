import { DEFAULT_CLIENT_ID, DEFAULT_REDIRECT_URI } from "../config.js";
import type { CatalogProductDiscoveryResult } from "../probe/catalog-products.js";

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function renderCatalogProductReport(result: CatalogProductDiscoveryResult): string {
  return `# 0A-LIVE-D — Catalog PRODUCT Discovery

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

${json(result.highlightAttempts.map((attempt) => ({ rootId: attempt.rootId, rootName: attempt.rootName, categoryId: attempt.categoryId, categoryName: attempt.categoryName, httpStatus: attempt.httpStatus })))}

## Highlights PRODUCT

- candidatos PRODUCT únicos: ${result.productCandidates.length}
- categorias com PRODUCT: ${result.repeatability.categoriesWithProducts}
- candidatos: ${json(result.productCandidates)}

## PRODUCT detail

- HTTP 200: ${result.repeatability.productDetailsPass}/${result.products.length}
- dados: ${json(result.products.map((product) => ({
    productId: product.productId, sourceCategoryIds: product.sourceCategoryIds, httpStatus: product.httpStatus,
    status: product.status, name: product.name, domainId: product.domainId, familyName: product.familyName,
    attributeCount: product.attributeCount, soldQuantity: product.soldQuantity, parentId: product.parentId,
    childrenIds: product.childrenIds, permalink: product.permalink, classification: product.classification,
  })))}

## Official PRODUCT → OFFER path

${json(result.officialOfferPath)}

- endpoint documentado: sim
- resultados HTTP: ${json(result.products.slice(0, 5).map((product) => ({ productId: product.productId, httpStatus: product.offerPathHttpStatus, total: product.offerPagingTotal, classification: product.classification })))}

## Offers/Listings

- ofertas associadas: ${result.repeatability.associatedOffers}
- dados: ${json(result.offers)}

## Third-party

- user autenticado: ${result.authenticatedUserId}
- ofertas de terceiros: ${result.repeatability.thirdPartyOffers}
- sellers distintos: ${new Set(result.offers.flatMap((offer) => offer.thirdParty && offer.sellerId !== null ? [offer.sellerId] : [])).size}

## Item detail

${json(result.items)}

## sale_price

- preços atuais válidos: ${result.repeatability.currentPrices}/${result.prices.length}
- regular_amount disponível: ${result.prices.filter((row) => typeof row.data?.regular_amount === "number").length}/${result.prices.length}
- dados: ${json(result.prices)}

## Seller reputation

- sellers com reputação pública: ${result.repeatability.sellersWithReputation}/${result.sellers.length}
- dados: ${json(result.sellers)}

## Buy box / competition

${result.buyBox}

O campo buy_box_winner de GET /products/{PRODUCT_ID} e GET /products/{PRODUCT_ID}/items são recursos oficiais documentados. O primeiro identifica a publicação ganhadora; o segundo lista as publicações que competem na PDP.

## Repetibilidade

${json(result.repeatability)}

## Compliance

- somente OAuth e endpoints oficiais documentados
- PRODUCT aceito somente com type=PRODUCT e ID /^MLB\\d+$/
- ITEM e USER_PRODUCT não foram tratados como PRODUCT
- sem /sites/MLB/search, scraping, HTML, browser automation, endpoint privado ou bypass de 403
- expansão interrompida após 429: ${result.stoppedOnRateLimit}
- headers de rate limit: ${json(result.rateLimitHeaders)}

## Limitações

${result.errors.length ? result.errors.map((error) => `- ${error}`).join("\n") : "Nenhuma limitação adicional registrada nesta execução."}

## Conclusão técnica

${result.formalStatus}

Este status se limita à ramificação Catalog PRODUCT Discovery e não altera automaticamente a decisão global do AutoAchado.AI.

## Próximo passo recomendado

Usar a evidência live para decidir se PRODUCT → oferta → preço → seller fecha de forma oficial e repetível em produção.
`;
}
