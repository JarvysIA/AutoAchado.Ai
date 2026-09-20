import type {ProductPreview} from '../discovery/product-preview.js';
import {safePreviewUrl} from '../discovery/product-preview.js';
import {commercialProfile} from './profile.js';
import {assessAutomotive} from './editorial.js';
import {brandOf,duplicateKeyOf,resolveCategory,type AutomotiveFamilyKey} from './automotive-families.js';

export const SELECTION_VERSION='automotive-potential-v2-category-families';
const DAY=86400000;
// A portfolio of 100 with 29 cleaning products, 20 of them one brand, is not a portfolio.
export const TYPE_LIMIT=3;
export const FAMILY_LIMIT=15;
export const BRAND_LIMIT=4;
const median=(v:number[])=>{const a=[...v].sort((a,b)=>a-b);return a.length%2?a[Math.floor(a.length/2)]!:(a[a.length/2-1]!+a[a.length/2]!)/2;};
export interface RankSignal {category:string;observed_at:string;position:number}
export interface SelectionCandidate {source_key:string;identity_key:string;preview?:ProductPreview;monitor:boolean;protected:boolean;feedback?:string;monitor_since?:string;category_id?:string|null;ranks:RankSignal[]}

// Positive appearances only. Missing rankings are not fabricated zero sales.
export function demandPotential(signals:RankSignal[],now=Date.now()) {
 const dimensions=new Map<string,Map<string,number>>();
 for(const r of signals) {
  const time=Date.parse(r.observed_at);
  if(!Number.isFinite(time)||time>now||time<now-14*DAY||!Number.isInteger(r.position)||r.position<1||r.position>20) continue;
  const days=dimensions.get(r.category)??new Map<string,number>();const day=new Date(time).toISOString().slice(0,10);
  days.set(day,Math.min(days.get(day)??21,r.position));dimensions.set(r.category,days);
 }
 const results=[...dimensions].map(([category,days])=>{
  const ordered=[...days].sort(([a],[b])=>a.localeCompare(b)),values=ordered.map(([,p])=>p),mid=median(values);
  const recurrence=25*Math.min(1,days.size/14),position=15*(21-mid)/20;
  const spread=median(values.map(v=>Math.abs(v-mid)));
  const stability=days.size>=3?5*Math.max(0,1-spread/10):0;
  // Neutral movement receives zero bonus; only independent days on both sides establish improvement.
  const half=Math.floor(values.length/2);
  const improvement=values.length>=6?median(values.slice(0,half))-median(values.slice(half)):0;
  const trend=values.length>=6?5*Math.max(0,Math.min(1,improvement/5)):0;
  return {category,days:days.size,median_position:mid,improvement,score:recurrence+position+stability+trend};
 }).sort((a,b)=>b.score-a.score||a.category.localeCompare(b.category));
 return results[0]??{category:null,days:0,median_position:null,improvement:0,score:0};
}

/** Categories seen in the ranking window, most specific first; drives family and type. */
export function candidateCategory(c:Pick<SelectionCandidate,'ranks'|'category_id'>,now=Date.now()):string|null {
 const recent=c.ranks.filter(r=>{const t=Date.parse(r.observed_at);return Number.isFinite(t)&&t<=now&&t>=now-14*DAY;}).map(r=>r.category);
 return resolveCategory(recent,c.category_id);
}

export function scoreCandidate(c:SelectionCandidate,now=Date.now()) {
 const p=c.preview,demand=demandPotential(c.ranks,now),profile=commercialProfile(p?.title??'');
 const categoryId=candidateCategory(c,now);
 const editorial=assessAutomotive({title:p?.title??'',description:p?.description??null},categoryId);
 const checked=Date.parse(p?.priceCheckedAt??'');
 const complete=!!p&&!!p.title.trim()&&!/^MLBU?\d+$/.test(p.title.trim())&&!!safePreviewUrl(p.image,true)&&!!safePreviewUrl(p.url)
  &&typeof p.price==='number'&&Number.isFinite(p.price)&&p.price>0&&p.currency==='BRL'
  &&p.comparable===true&&p.seller_trusted===true&&!!p.seller_id&&p.status!=='UNAVAILABLE'&&checked<=now&&checked>=now-DAY;
 const components={demand:Math.round(demand.score*100)/100,utility:profile.appeal*.20,ease:profile.ease*.15,
  seller:p?.seller_trusted?10:0,ticket:p?.price&&p.price>0&&p.price<=150?5:p?.price&&p.price<=300?3:0};
 const score=Math.round(Object.values(components).reduce((a,b)=>a+b,0));
 const reasons:string[]=[];const reasonCodes:string[]=[];
 if(editorial.family===null) reasonCodes.push('UNKNOWN_CATEGORY');
 else if(editorial.family==='EXCLUDED') reasonCodes.push('EXCLUDED_CATEGORY');
 if(!complete) reasons.push('Faltam dados atuais completos e comparáveis.');
 if(editorial.state!=='ELIGIBLE') reasons.push(editorial.reason);
 if(demand.days<3) reasons.push('Menos de três dias de presença no mesmo ranking.');
 if(c.feedback==='NOT_RELEVANT') reasons.push('Produto marcado como inadequado pelo operador.');
 if(score<60) reasons.push('Potencial abaixo do mínimo experimental de 60 pontos.');
 return {...c,score,components,family:editorial.family,category_id:categoryId,
  brand:brandOf(p?.description),duplicate_key:duplicateKeyOf(p?.description),
  demand,eligible:reasons.length===0,reasons,reasonCodes,
  confidence:demand.days>=10?'MEDIUM':demand.days>=3?'LOW':'INSUFFICIENT',
  explanation:`${demand.days} dias no mesmo ranking; posição mediana ${demand.median_position??'indisponível'}. Utilidade e facilidade são hipóteses editoriais, não conversões medidas.`};
}

export type ScoredCandidate=ReturnType<typeof scoreCandidate>;

/** Which diversity rule a member breaks, most serious first; null when it fits. */
export function diversityViolation(c:ScoredCandidate,counts:{types:Map<string,number>;families:Map<string,number>;brands:Map<string,number>;duplicates:Set<string>}):string|null {
 if(c.family===null) return 'UNKNOWN_CATEGORY';
 if(c.family==='EXCLUDED') return 'EXCLUDED_CATEGORY';
 if(c.duplicate_key!==null&&counts.duplicates.has(c.duplicate_key)) return 'DUPLICATE';
 if(c.brand!==null&&(counts.brands.get(c.brand)??0)>=BRAND_LIMIT) return 'BRAND_LIMIT';
 if(c.category_id!==null&&(counts.types.get(c.category_id)??0)>=TYPE_LIMIT) return 'TYPE_LIMIT';
 if((counts.families.get(c.family)??0)>=FAMILY_LIMIT) return 'FAMILY_LIMIT';
 return null;
}

function emptyCounts() {
 return {types:new Map<string,number>(),families:new Map<string,number>(),brands:new Map<string,number>(),duplicates:new Set<string>()};
}
function count(c:ScoredCandidate,counts:ReturnType<typeof emptyCounts>) {
 if(c.category_id!==null) counts.types.set(c.category_id,(counts.types.get(c.category_id)??0)+1);
 if(c.family!==null&&c.family!=='EXCLUDED') counts.families.set(c.family,(counts.families.get(c.family)??0)+1);
 if(c.brand!==null) counts.brands.set(c.brand,(counts.brands.get(c.brand)??0)+1);
 if(c.duplicate_key!==null) counts.duplicates.add(c.duplicate_key);
}

export function simulateSelection(candidates:SelectionCandidate[],now=Date.now(),capacity=100) {
 const identities=new Map<string,SelectionCandidate[]>();
 for(const c of candidates) {const list=identities.get(c.identity_key)??[];list.push(c);identities.set(c.identity_key,list);}
 const evaluated=candidates.map(c=>{
  const siblings=identities.get(c.identity_key)!;
  return scoreCandidate({...c,ranks:siblings.flatMap(s=>s.ranks),monitor:siblings.some(s=>s.monitor),protected:siblings.some(s=>s.protected),
   category_id:c.category_id??siblings.find(s=>s.category_id)?.category_id??null,
   ...(siblings.some(s=>s.feedback==='NOT_RELEVANT')?{feedback:'NOT_RELEVANT'}:{})},now);
 }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score||a.identity_key.localeCompare(b.identity_key)||a.source_key.localeCompare(b.source_key));
 const unique=evaluated.filter((c,i,all)=>all.findIndex(x=>x.identity_key===c.identity_key)===i);
 // Preserve protected incumbent identities even when another source has a better preview.
 const protectedIds=new Set(candidates.filter(c=>c.monitor&&c.protected).map(c=>c.identity_key));
 const currentIds=new Set(candidates.filter(c=>c.monitor).map(c=>c.identity_key));
 const selected=unique.filter(c=>protectedIds.has(c.identity_key));
 // Protected members are kept whatever they look like, and still consume their diversity slots.
 const counts=emptyCounts();for(const c of selected) count(c,counts);
 for(const c of unique) {
  if(selected.length>=capacity) break;
  if(!c.eligible||protectedIds.has(c.identity_key)||diversityViolation(c,counts)!==null) continue;
  selected.push(c);count(c,counts);
 }
 const selectedIds=new Set(selected.map(c=>c.identity_key));
 const reserve=unique.filter(c=>c.eligible&&!selectedIds.has(c.identity_key));
 const newcomers=selected.filter(c=>!currentIds.has(c.identity_key));
 const displaced=unique.filter(c=>currentIds.has(c.identity_key)&&!selectedIds.has(c.identity_key)&&!protectedIds.has(c.identity_key)).sort((a,b)=>a.score-b.score);
 const replacements:{from:string;to:string;advantage:number}[]=[];
 for(const next of newcomers) {
  if(replacements.length>=5||next.demand.days<7) continue;
  const victim=displaced.find(c=>!replacements.some(r=>r.from===c.identity_key)&&next.score-c.score>=10
   &&Number.isFinite(Date.parse(c.monitor_since??''))&&Date.parse(c.monitor_since!)<=now-7*DAY);
  if(victim) replacements.push({from:victim.identity_key,to:next.identity_key,advantage:next.score-victim.score});
 }
 return {version:SELECTION_VERSION,mode:'SIMULATION_ONLY',applied:false,capacity,
  familyLimit:FAMILY_LIMIT,typeLimit:TYPE_LIMIT,brandLimit:BRAND_LIMIT,current:currentIds.size,
  selectedCount:selected.length,protectedRetained:protectedIds.size,unfilled:Math.max(0,capacity-selected.length),
  overlap:selected.filter(c=>currentIds.has(c.identity_key)).length,newcomers:newcomers.length,
  proposedReplacements:replacements,selected,reserve,evaluated:unique,protectedIds,currentIds,
  warning:'As notas não estimam unidades vendidas ou probabilidade de conversão. Não são ofertas aprovadas nem substituições executadas.'};
}

export type SelectionResult=ReturnType<typeof simulateSelection>;
export type {AutomotiveFamilyKey};
