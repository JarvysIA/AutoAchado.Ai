import type { ProbeResult } from "../probe/runner.js";
import type { AlternativeDiscoveryResult } from "../probe/alternative.js";
import type { DirectItemDiscoveryResult } from "../probe/direct-items.js";
import type { CatalogProductDiscoveryResult } from "../probe/catalog-products.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function layout(content: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoAchado API Probe</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;color:#17202a}h1{margin-bottom:4px}a,button{display:inline-block;background:#1769aa;color:#fff;border:0;border-radius:8px;padding:12px 16px;text-decoration:none;font-weight:650;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7f9;padding:16px;border-radius:8px}section{margin:28px 0}.muted{color:#667}</style></head><body>${content}</body></html>`;
}

export function homePage(connected: boolean, userLabel?: string): string {
  return layout(`<h1>AutoAchado.AI</h1><p class="muted">API Feasibility Probe</p>${connected ? `<section><p>Mercado Livre conectado ✅</p><p>${escapeHtml(userLabel ?? "Usuário autenticado")}</p><form method="post" action="/probe"><button type="submit">Executar 0A-LIVE</button></form><form method="post" action="/probe/alternative"><button type="submit">Executar 0A-LIVE-B</button></form><form method="post" action="/probe/direct-items"><button type="submit">Executar 0A-LIVE-C</button></form><form method="post" action="/probe/catalog-products"><button type="submit">Executar 0A-LIVE-D</button></form></section>` : `<section><a href="/auth/start">Conectar Mercado Livre</a></section>`}`);
}

function icon(status: string): string {
  return status === "PASS" || status === "AVAILABLE" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
}

export function probePage(result: ProbeResult, markdown: string): string {
  const priceOk = result.prices.some((row) => typeof row.salePrice.data?.amount === "number");
  const reputationOk = result.sellers.some((row) => typeof row.level_id === "string");
  const highlightsOk = result.highlights.some((row) => row.content.length > 0);
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  return layout(`<h1>AutoAchado.AI — resultado 0A-LIVE</h1><section><p><strong>${escapeHtml(result.formalStatus)}</strong></p><p>OAuth ${icon(result.oauth.status)}</p><p>Categorias ${icon(result.categories?.status ?? "FAIL")}</p><p>Busca de terceiros ${icon(result.search?.status ?? "FAIL")}</p><p>Preço ${priceOk ? "✅" : "⚠️"}</p><p>Reputação ${reputationOk ? "✅" : "⚠️"}</p><p>Highlights ${highlightsOk ? "✅" : "⚠️"}</p></section><section><a download="0A-LIVE-report.md" href="${escapeHtml(dataUrl)}">Baixar relatório</a></section><details><summary>Ver relatório</summary><pre>${escapeHtml(markdown)}</pre></details>`);
}

export function alternativeProbePage(result: AlternativeDiscoveryResult, markdown: string): string {
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  return layout(`<h1>AutoAchado.AI — resultado 0A-LIVE-B</h1><section><p><strong>${escapeHtml(result.formalStatus)}</strong></p><p>Categorias ${result.categories.length >= 5 ? "✅" : "⚠️"}</p><p>Highlights ${result.highlights.some((row) => row.type === "USER_PRODUCT") ? "✅" : "⚠️"}</p><p>MLBU → MLB ${result.userProducts.some((row) => row.itemIds.length > 0) ? "✅" : "⚠️"}</p><p>Terceiros ${result.repeatability.thirdPartyProducts >= 3 ? "✅" : "⚠️"}</p><p>Preço ${result.repeatability.currentPrices >= 3 ? "✅" : "⚠️"}</p><p>Reputação ${result.repeatability.sellersWithReputation > 0 ? "✅" : "⚠️"}</p></section><section><a download="0A-LIVE-B-report.md" href="${escapeHtml(dataUrl)}">Baixar relatório</a></section><details><summary>Ver relatório</summary><pre>${escapeHtml(markdown)}</pre></details>`);
}

export function directItemProbePage(result: DirectItemDiscoveryResult, markdown: string): string {
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  return layout(`<h1>AutoAchado.AI — resultado 0A-LIVE-C</h1><section><p><strong>${escapeHtml(result.formalStatus)}</strong></p><p>Highlights 200 ${result.repeatability.highlights200Categories >= 2 ? "✅" : "⚠️"}</p><p>ITEM direto ${result.repeatability.directItemCandidates >= 3 ? "✅" : "⚠️"}</p><p>Detalhes ${result.repeatability.itemDetailsPass >= 3 ? "✅" : "⚠️"}</p><p>Terceiros ${result.repeatability.thirdPartyItems >= 3 ? "✅" : "⚠️"}</p><p>Preço ${result.repeatability.currentPrices >= 3 ? "✅" : "⚠️"}</p><p>Reputação ${result.repeatability.sellersWithReputation > 0 ? "✅" : "⚠️"}</p></section><section><a download="0A-LIVE-C-report.md" href="${escapeHtml(dataUrl)}">Baixar relatório</a></section><details><summary>Ver relatório</summary><pre>${escapeHtml(markdown)}</pre></details>`);
}

export function catalogProductProbePage(result: CatalogProductDiscoveryResult, markdown: string): string {
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  return layout(`<h1>AutoAchado.AI — resultado 0A-LIVE-D</h1><section><p><strong>${escapeHtml(result.formalStatus)}</strong></p><p>PRODUCT ${result.repeatability.productDetailsPass >= 3 ? "✅" : "⚠️"}</p><p>PRODUCT → ofertas ${result.repeatability.associatedOffers >= 3 ? "✅" : "⚠️"}</p><p>Terceiros ${result.repeatability.thirdPartyOffers >= 3 ? "✅" : "⚠️"}</p><p>Preço ${result.repeatability.currentPrices >= 3 ? "✅" : "⚠️"}</p><p>Reputação ${result.repeatability.sellersWithReputation > 0 ? "✅" : "⚠️"}</p><p>Buy box ${result.buyBox === "BUY_BOX_AVAILABLE" ? "✅" : "⚠️"}</p></section><section><a download="0A-LIVE-D-report.md" href="${escapeHtml(dataUrl)}">Baixar relatório</a></section><details><summary>Ver relatório</summary><pre>${escapeHtml(markdown)}</pre></details>`);
}

export function errorPage(title: string, message: string): string {
  return layout(`<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/">Voltar</a></p>`);
}
