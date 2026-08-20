import { DEFAULT_CLIENT_ID, DEFAULT_REDIRECT_URI } from "../config.js";
import type { AlternativeDiscoveryResult } from "../probe/alternative.js";

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function renderAlternativeReport(result: AlternativeDiscoveryResult): string {
  const salePrice = result.prices.map((row) => ({ itemId: row.itemId, salePrice: row.salePrice }));
  const prices = result.prices.map((row) => ({ itemId: row.itemId, prices: row.prices }));
  return `# 0A-LIVE-B — Alternative Discovery

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

${json(result.categories)}

- erros de seleção: ${json(result.categoryErrors)}

## Highlights

- USER_PRODUCT válidos: ${result.highlights.filter((row) => row.type === "USER_PRODUCT" && row.id.startsWith("MLBU")).length}
- dados: ${json(result.highlights)}

## USER_PRODUCT

- legíveis: ${result.repeatability.readableUserProducts}
- dados sanitizados: ${json(result.userProducts)}

## USER_PRODUCT → ITEM

- caminho oficial testado: ${result.officialPath}
- MLBU com item MLB: ${result.userProducts.filter((row) => row.itemIds.length > 0).length}
- sem resolução: ${result.userProducts.filter((row) => row.httpStatus === 200 && row.itemIds.length === 0).length}

## Item detail

- itens retornados: ${result.items.length}
- dados: ${json(result.items)}

## Third-party confirmation

- user autenticado: ${result.authenticatedUserId}
- itens de terceiros: ${result.repeatability.thirdPartyProducts}
- sellers distintos: ${new Set(result.items.filter((item) => item.thirdParty).map((item) => item.seller_id)).size}

## sale_price

- amount disponível: ${result.repeatability.currentPrices}/${result.prices.length}
- regular_amount disponível: ${result.prices.filter((row) => typeof row.salePrice.data?.regular_amount === "number").length}/${result.prices.length}
- dados: ${json(salePrice)}

## prices

Capacidade adicional e não bloqueante.

${json(prices)}

## Seller reputation

- sellers com indicador: ${result.repeatability.sellersWithReputation}/${result.sellers.length}
- dados: ${json(result.sellers)}

## Repetibilidade

${json(result.repeatability)}

## Compliance

- somente endpoints oficiais documentados
- sem scraping, browser automation, cookies de navegador ou bypass de 403
- expansão interrompida em 429: ${result.stoppedOnRateLimit}
- headers de rate limit observados: ${json(result.rateLimitHeaders)}

## Limitações

${result.errors.length > 0 ? result.errors.map((error) => `- ${error}`).join("\n") : "Nenhuma limitação adicional registrada nesta execução."}

## Conclusão técnica

${result.formalStatus}

O status se limita à cadeia alternativa oficial testada e não declara automaticamente a viabilidade geral do projeto.

## Próximo passo recomendado

Executar novamente apenas se a amostra tiver sido interrompida por erro transitório; caso contrário, decidir o próximo BUILD a partir da evidência acima.
`;
}
