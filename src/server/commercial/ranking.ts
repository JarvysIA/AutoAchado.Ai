import type { ProductPreview } from "../discovery/product-preview.js";
import { safePreviewUrl } from "../discovery/product-preview.js";

export const RANKING_VERSION = "commercial-v1";
const DAY = 86400000;
export interface Observation {
  observed_at: string;
  price: number | null;
  currency: string;
  seller_id: string | null;
  comparable: boolean;
  trusted: boolean;
  position: number | null;
}
export interface CommercialRank {
  version: string;
  state: "APPROVED" | "OBSERVING" | "REJECTED";
  score: number;
  group: string;
  reasons: string[];
  evidence: string[];
  reference_price: number | null;
  historical_discount_percent: number | null;
  history_days: number;
  seller_count: number;
  demand_days: number;
  checked_at: string;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a,b) => a-b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half]! : (sorted[half-1]! + sorted[half]!) / 2;
};

// Explicit, versioned editorial hypotheses; these are not measured conversion rates.
export function commercialProfile(title: string) {
  const text = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/rastreador|rack de teto|bagageiro|mensalidade|assinatura/.test(text))
    return {group:"especializado", appeal:20, ease:15, reason:"Uso específico ou possível instalação/recorrência; fora do perfil amplo inicial."};
  if (/aspirador/.test(text)) return {group:"aspiracao",appeal:90,ease:85,reason:null};
  if (/compressor|calibrador|inflador/.test(text)) return {group:"pneus",appeal:85,ease:75,reason:null};
  if (/carregador|suporte.*celular|cabo usb/.test(text)) return {group:"celular",appeal:85,ease:85,reason:null};
  if (/organizador|lixeira|protetor solar|quebra.sol/.test(text)) return {group:"organizacao",appeal:75,ease:85,reason:null};
  if (/microfibra|shampoo|cera|limpador|limpeza|vonixx|lavagem/.test(text)) return {group:"limpeza",appeal:65,ease:85,reason:null};
  if (/ferramenta|chave|lanterna|kit.*reparo/.test(text)) return {group:"ferramentas",appeal:75,ease:75,reason:null};
  return {group:"avaliar",appeal:40,ease:40,reason:null};
}

export function rankProduct(preview: ProductPreview, history: Observation[], feedback: string | null = null, now = Date.now()): CommercialRank {
  const profile = commercialProfile(preview.title);
  const reasons: string[] = [], evidence: string[] = [];
  let rejected = false;
  const fail = (text: string, hard = false) => { reasons.push(text); rejected ||= hard; };
  const currentTime = Date.parse(preview.priceCheckedAt ?? "");
  const complete = !!preview.title.trim() && !/^MLBU?\d+$/.test(preview.title.trim())
    && !!safePreviewUrl(preview.image, true) && !!safePreviewUrl(preview.url)
    && typeof preview.price === "number" && Number.isFinite(preview.price) && preview.price > 0 && preview.currency === "BRL";
  if (!complete) fail("Faltam título, foto, preço em BRL ou link utilizável.");
  if (!(currentTime <= now && currentTime >= now - DAY)) fail("Preço precisa ser consultado novamente (validade de 24 horas).");
  if (preview.status === "UNAVAILABLE") fail("Oferta indisponível.", true);
  if (!preview.comparable) fail("Identidade, condição, variação ou contexto de preço ainda não confirmados.");
  if (!preview.seller_trusted) fail("Reputação do vendedor ainda não confirmada.");
  if (preview.seller_level && !["5_green", "4_light_green"].includes(preview.seller_level)) fail("Reputação do vendedor abaixo do mínimo.", true);
  if (profile.reason) fail(profile.reason, true);
  if (profile.group === "avaliar") fail("Utilidade e compatibilidade ampla precisam de avaliação editorial.");
  if (feedback === "NOT_RELEVANT") fail("Você marcou este produto como inadequado para o público.", true);

  const today = new Date(now).toISOString().slice(0,10);
  const historical = history.filter(o => {
    const time = Date.parse(o.observed_at);
    return o.comparable && o.trusted && o.currency === preview.currency && o.seller_id
      && typeof o.price === "number" && Number.isFinite(o.price) && o.price > 0
      && time >= now - 30 * DAY && time < Date.parse(today);
  });
  const daily = new Map<string, number>();
  for (const observation of historical) {
    const day = observation.observed_at.slice(0,10);
    daily.set(day, Math.min(daily.get(day) ?? Infinity, observation.price!));
  }
  const sellers = new Set(historical.map(o => o.seller_id));
  const span = historical.length ? (now - Math.min(...historical.map(o => Date.parse(o.observed_at)))) / DAY : 0;
  const reference = daily.size ? median([...daily.values()]) : null;
  const discount = reference && preview.price ? (reference - preview.price) / reference * 100 : null;
  const sufficient = daily.size >= 20 && span >= 27 && sellers.size >= 2;
  if (!sufficient) fail("Histórico insuficiente: exigimos 20 dias observados, janela de 27 dias e 2 vendedores em até 30 dias.");
  else if (discount === null || discount < 10) fail("Desconto histórico inferior a 10%.", true);
  else evidence.push(Math.round(discount) + "% abaixo da mediana dos melhores preços diários observados.");

  // Rankings are category-relative signals, never fabricated sales counts.
  const demand = new Map<string, number>();
  for (const observation of history) {
    const time = Date.parse(observation.observed_at);
    if (time <= now && time >= now - 14 * DAY && Number.isInteger(observation.position) && observation.position! >= 1 && observation.position! <= 20) {
      const day = observation.observed_at.slice(0,10);
      demand.set(day, Math.min(demand.get(day) ?? 21, observation.position!));
    }
  }
  const strongDemand = demand.size >= 7 && median([...demand.values()]) <= 10;
  if (!strongDemand) fail("Demanda não confirmada: exigimos presença em 7 dias de ranking em 14 dias, com posição mediana até 10.");
  else evidence.push("Presença recorrente entre mais vendidos em " + demand.size + " dias; indício de demanda, sem volume de vendas comprovado.");
  if (Number.isSafeInteger(preview.sales_total_reported) && preview.sales_total_reported! >= 0) evidence.push("Vendas acumuladas informadas pela API: " + preview.sales_total_reported + (preview.sales_source === "CATALOG" ? " (produto de catálogo)." : " (anúncio).") + " Não representa vendas recentes.");
  if (preview.seller_trusted) evidence.push("Vendedor com reputação verde confirmada.");
  evidence.push("Preço do produto sem frete; confira entrega, pagamento e compatibilidade antes de divulgar.");
  const demandScore = strongDemand ? Math.min(100, 60 + demand.size * 2) : 0;
  const discountScore = sufficient && discount !== null ? Math.max(0, Math.min(100, discount * 3)) : 0;
  const commercial = preview.price && preview.price <= 150 ? 80 : preview.price && preview.price <= 300 ? 60 : 30;
  const score = Math.round(demandScore * .30 + discountScore * .25 + profile.appeal * .15
    + profile.ease * .15 + (preview.seller_trusted ? 100 : 0) * .10 + commercial * .05);
  return {version:RANKING_VERSION,state:rejected ? "REJECTED" : reasons.length ? "OBSERVING" : "APPROVED",score,
    group:profile.group,reasons,evidence,reference_price:reference,historical_discount_percent:sufficient && discount !== null ? Math.round(discount) : null,
    history_days:daily.size,seller_count:sellers.size,demand_days:demand.size,checked_at:new Date(now).toISOString()};
}

export function selectDiverse<T extends {identity_key:string; rank:CommercialRank}>(entries: T[], limit = 20): T[] {
  const selected: T[] = [], groups = new Map<string,number>(), identities = new Set<string>();
  for (const entry of [...entries].sort((a,b) => b.rank.score - a.rank.score || a.identity_key.localeCompare(b.identity_key))) {
    if (entry.rank.state !== "APPROVED" || identities.has(entry.identity_key) || (groups.get(entry.rank.group) ?? 0) >= 3) continue;
    identities.add(entry.identity_key); groups.set(entry.rank.group,(groups.get(entry.rank.group) ?? 0)+1); selected.push(entry);
    if (selected.length >= limit) break;
  }
  return selected;
}
