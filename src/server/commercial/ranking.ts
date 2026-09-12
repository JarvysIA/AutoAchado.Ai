import {commercialProfile} from './profile.js';
export {commercialProfile} from './profile.js';
import {assessAutomotive} from './editorial.js';
import type { ProductPreview } from "../discovery/product-preview.js";
import { safePreviewUrl } from "../discovery/product-preview.js";
import {analyzePriceTruth} from './price-truth.js';

export const RANKING_VERSION = "commercial-v3-pre-home";
const DAY = 86400000;
export interface Observation {
  observed_at: string;
  price: number | null;
  currency: string;
  seller_id: string | null;
  comparable: boolean;
  trusted: boolean;
  position: number | null;
  demand_category?:string;
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
  history_sufficient?: boolean;
  seller_count: number;
  demand_days: number;
  checked_at: string;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a,b) => a-b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half]! : (sorted[half-1]! + sorted[half]!) / 2;
};

// Diversify the visible selection without hiding products or mixing approval states.
export function orderCommercialFamilies<T extends {rank:Pick<CommercialRank,'state'|'group'>}>(entries:T[]):T[] {
 const result:T[]=[];
 for(const state of ['APPROVED','OBSERVING','REJECTED']) {
  const groups=new Map<string,T[]>();
  for(const entry of entries) if(entry.rank.state===state) {
   const group=groups.get(entry.rank.group)??[];group.push(entry);groups.set(entry.rank.group,group);
  }
  while([...groups.values()].some(group=>group.length))
   for(const group of groups.values()) {const next=group.shift();if(next) result.push(next);}
 }
 return result;
}

export function rankProduct(preview: ProductPreview, history: Observation[], feedback: string | null = null, now = Date.now(), context?: {
 profile:{appeal:number;ease:number;reason:string|null};editorial:{state:string;family:string;reason:string}
}): CommercialRank {
  const profile = context?.profile ?? commercialProfile(preview.title);
  const editorial=context?.editorial ?? assessAutomotive(preview);
  const reasons: string[] = [], evidence: string[] = [];
  let rejected = false;
  const fail = (text: string, hard = false) => { reasons.push(text); rejected ||= hard; };
  const currentTime = Date.parse(preview.priceCheckedAt ?? "");
  const complete = !!preview.title.trim() && !/^MLBU?\d+$/.test(preview.title.trim())
    && !!safePreviewUrl(preview.image, true) && !!safePreviewUrl(preview.url)
    && typeof preview.price === "number" && Number.isFinite(preview.price) && preview.price > 0 && preview.currency === "BRL";
  if (preview.priceLinkVerified!==true) fail("Preço de compra e anúncio correspondente ainda não confirmados.");
  if (!complete) fail("Faltam título, foto, preço em BRL ou link utilizável.");
  if (!(currentTime <= now && currentTime >= now - DAY)) fail("Preço precisa ser consultado novamente (validade de 24 horas).");
  if (preview.status === "UNAVAILABLE") fail("Oferta indisponível.", true);
  if (!preview.comparable) fail("Identidade, condição, variação ou contexto de preço ainda não confirmados.");
  if (!preview.seller_trusted) fail("Reputação do vendedor ainda não confirmada.");
  if (preview.seller_level && !["5_green", "4_light_green"].includes(preview.seller_level)) fail("Reputação do vendedor abaixo do mínimo.", true);
  if(editorial.state!=='ELIGIBLE') fail(editorial.reason,editorial.state==='EXCLUDE');
  if (profile.reason) fail(profile.reason, true);
  if (feedback === "NOT_RELEVANT") fail("Você marcou este produto como inadequado para o público.", true);

  const truth=analyzePriceTruth(preview,history,now);
  const coverage=truth.campaign?.sufficient && (!truth.rolling.sufficient || truth.campaign.price! <= truth.rolling.price!) ? truth.campaign : truth.rolling;
  const reference=truth.reference_price;
  const discount=reference!==null&&preview.price!==null?(reference-preview.price)/reference*100:null;
  const sufficient=truth.rolling.sufficient || truth.campaign?.sufficient===true;
  if (!sufficient) fail("Histórico insuficiente: exigimos 20 dias observados, janela de 27 dias e 2 vendedores na referência de 30 dias ou de setembro.");
  else if (discount === null || discount < 10) fail("Desconto histórico inferior a 10%.", true);
  else evidence.push(Math.round(discount) + "% abaixo da mediana dos melhores preços diários observados.");

  // Rankings are category-relative signals, never fabricated sales counts.
  const dimensions = new Map<string,Map<string,number>>();
  for (const observation of history) {
    const time = Date.parse(observation.observed_at);
    if (time <= now && time >= now - 14 * DAY && Number.isInteger(observation.position) && observation.position! >= 1 && observation.position! <= 20) {
      const day = observation.observed_at.slice(0,10);
      const dimension=observation.demand_category??'legacy';
      const demand=dimensions.get(dimension)??new Map<string,number>();
      demand.set(day, Math.min(demand.get(day) ?? 21, observation.position!));
      dimensions.set(dimension,demand);
    }
  }
  const demand=[...dimensions.values()].sort((a,b)=>Number(b.size>=7&&median([...b.values()])<=10)-Number(a.size>=7&&median([...a.values()])<=10)||b.size-a.size)[0]??new Map<string,number>();
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
    group:editorial.family,reasons,evidence,reference_price:reference,historical_discount_percent:sufficient && discount !== null ? Math.round(discount) : null,
    history_days:coverage.days,history_sufficient:sufficient,seller_count:coverage.sellers,demand_days:demand.size,checked_at:new Date(now).toISOString()};
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
