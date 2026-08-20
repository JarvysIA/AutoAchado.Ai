import type { ProbeResult } from "../probe/runner";

function passPartialFail(success: boolean, partial: boolean): "PASS" | "PARTIAL" | "FAIL" {
  return success ? "PASS" : partial ? "PARTIAL" : "FAIL";
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function renderReport(result: ProbeResult): string {
  const saleWithAmount = result.prices.filter((row) => typeof row.salePrice.data?.amount === "number").length;
  const saleWithRegular = result.prices.filter((row) => typeof row.salePrice.data?.regular_amount === "number").length;
  const sellersWithLevel = result.sellers.filter((seller) => typeof seller.level_id === "string").length;
  const highlightsCount = result.highlights.reduce((total, row) => total + row.content.length, 0);
  const pagesOk = result.pagination.filter((page) => page.httpStatus >= 200 && page.httpStatus < 300).length;
  const priceStatus = passPartialFail(saleWithAmount === result.prices.length && result.prices.length >= 5, saleWithAmount > 0);
  const sellerStatus = passPartialFail(sellersWithLevel === result.sellers.length && result.sellers.length > 0, sellersWithLevel > 0);

  return `# AutoAchado.AI — 0A-LIVE API Feasibility

Data/hora: ${result.generatedAt}

Ambiente: ${result.environment}

Client ID: ${result.clientId}

Redirect URI: ${result.redirectUri}

## Status formal

${result.formalStatus}

## OAuth

${result.oauth.status}

- refresh_token_received: ${result.oauth.refreshTokenReceived}

## /users/me

${result.usersMe.status}

- HTTP status: ${result.usersMe.httpStatus}
- user_id: ${result.usersMe.user?.id ?? "não retornado"}
- nickname: ${result.usersMe.user?.nickname ?? "não retornado"}
- site_id: ${result.usersMe.user?.site_id ?? "não retornado"}
- country_id: ${result.usersMe.user?.country_id ?? "não retornado"}

## MLB categories

${result.categories?.httpStatus === 200 ? "PASS" : "FAIL"}

## Automotive root

${result.categories?.root ? "PASS" : "FAIL"}

- id: ${result.categories?.root?.id ?? "não encontrado"}
- name: ${result.categories?.root?.name ?? "não encontrado"}

## Leaf categories

${result.categories?.status ?? "FAIL"}

- quantidade encontrada: ${result.categories?.leaves.length ?? 0}
- amostra: ${json(result.categories?.leaves.slice(0, 10) ?? [])}
- filhos imediatos: ${json(result.categories?.immediateChildren ?? [])}
- dump: ${json(result.categories?.dump ?? { status: "não testado" })}

## Marketplace search

${result.search?.status ?? "FAIL"}

- categorias testadas: ${result.search?.categoriesTested ?? 0}
- candidatos: ${result.search?.candidates.length ?? 0}
- erros: ${json(result.search?.errors ?? [])}

## Third-party discovery

${(result.search?.thirdParty.length ?? 0) >= 5 ? "PASS" : (result.search?.thirdParty.length ?? 0) > 0 ? "PARTIAL" : "FAIL"}

- itens testados: ${result.search?.candidates.length ?? 0}
- itens terceiros confirmados: ${result.search?.thirdParty.length ?? 0}
- amostra sanitizada: ${json(result.search?.thirdParty.slice(0, 10) ?? [])}

## Item detail

${result.items?.status ?? "FAIL"}

- detalhes retornados: ${result.items?.details.length ?? 0}
- dados: ${json(result.items?.details ?? [])}

## Multiget

${result.multiget?.status ?? "FAIL"}

${json(result.multiget ?? { status: "não testado" })}

## sale_price

${priceStatus}

- ${saleWithAmount}/${result.prices.length} itens retornaram amount
- ${saleWithRegular}/${result.prices.length} itens retornaram regular_amount
- dados: ${json(result.prices.map((row) => ({ itemId: row.itemId, salePrice: row.salePrice })))}

## prices

${passPartialFail(result.prices.length > 0 && result.prices.every((row) => row.prices.data.length > 0), result.prices.some((row) => row.prices.data.length > 0))}

- dados: ${json(result.prices.map((row) => ({ itemId: row.itemId, prices: row.prices })))}

## Seller reputation

${sellerStatus}

- ${sellersWithLevel}/${result.sellers.length} sellers com level_id
- dados: ${json(result.sellers)}

## Highlights

${passPartialFail(result.highlights.length >= 3 && highlightsCount > 0, result.highlights.length > 0)}

- quantidade total retornada: ${highlightsCount}
- dados: ${json(result.highlights)}

## Pagination

${passPartialFail(pagesOk === 3, pagesOk > 0)}

- páginas válidas: ${pagesOk}/${result.pagination.length}
- dados: ${json(result.pagination)}

## Rate-limit indicators

${result.rateLimitHeaders.length > 0 ? "observados" : "não observados"}

${json(result.rateLimitHeaders)}

## Erros relevantes

${result.errors.length > 0 ? result.errors.map((error) => `- ${error}`).join("\n") : "Nenhum erro relevante registrado."}
`;
}
