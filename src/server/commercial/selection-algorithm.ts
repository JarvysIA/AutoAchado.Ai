import type {ProductPreview} from '../discovery/product-preview.js';
import {safePreviewUrl} from '../discovery/product-preview.js';
import {commercialProfile} from './profile.js';
import {assessAutomotive} from './editorial.js';

export const SELECTION_VERSION='automotive-potential-v1-simulation';
const DAY=86400000;
const median=(v:number[])=>{const a=[...v].sort((a,b)=>a-b);return a.length%2?a[Math.floor(a.length/2)]!:(a[a.length/2-1]!+a[a.length/2]!)/2;};
export interface RankSignal {category:string;observed_at:string;position:number}
export interface SelectionCandidate {source_key:string;identity_key:string;preview?:ProductPreview;monitor:boolean;protected:boolean;feedback?:string;monitor_since?:string;ranks:RankSignal[]}

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

export function scoreCandidate(c:SelectionCandidate,now=Date.now()) {
 const p=c.preview,demand=demandPotential(c.ranks,now),profile=commercialProfile(p?.title??''),editorial=assessAutomotive({title:p?.title??'',description:p?.description??null});
 const checked=Date.parse(p?.priceCheckedAt??'');
 const complete=!!p&&!!p.title.trim()&&!/^MLBU?\d+$/.test(p.title.trim())&&!!safePreviewUrl(p.image,true)&&!!safePreviewUrl(p.url)
  &&typeof p.price==='number'&&Number.isFinite(p.price)&&p.price>0&&p.currency==='BRL'
  &&p.comparable===true&&p.seller_trusted===true&&!!p.seller_id&&p.status!=='UNAVAILABLE'&&checked<=now&&checked>=now-DAY;
 const components={demand:Math.round(demand.score*100)/100,utility:profile.appeal*.20,ease:profile.ease*.15,
  seller:p?.seller_trusted?10:0,ticket:p?.price&&p.price>0&&p.price<=150?5:p?.price&&p.price<=300?3:0};
 const score=Math.round(Object.values(components).reduce((a,b)=>a+b,0));
 const reasons:string[]=[];
 if(!complete) reasons.push('Faltam dados atuais completos e comparáveis.');
 if(editorial.state!=='ELIGIBLE') reasons.push(editorial.reason);
 if(demand.days<3) reasons.push('Menos de três dias de presença no mesmo ranking.');
 if(c.feedback==='NOT_RELEVANT') reasons.push('Produto marcado como inadequado pelo operador.');
 if(score<60) reasons.push('Potencial abaixo do mínimo experimental de 60 pontos.');
 return {...c,score,components,family:editorial.family,demand,eligible:reasons.length===0,reasons,
  confidence:demand.days>=10?'MEDIUM':demand.days>=3?'LOW':'INSUFFICIENT',
  explanation:`${demand.days} dias no mesmo ranking; posição mediana ${demand.median_position??'indisponível'}. Utilidade e facilidade são hipóteses editoriais, não conversões medidas.`};
}

export function simulateSelection(candidates:SelectionCandidate[],now=Date.now(),capacity=100,familyLimit=25) {
 const identities=new Map<string,SelectionCandidate[]>();
 for(const c of candidates) {const list=identities.get(c.identity_key)??[];list.push(c);identities.set(c.identity_key,list);}
 const evaluated=candidates.map(c=>{
  const siblings=identities.get(c.identity_key)!;
  return scoreCandidate({...c,ranks:siblings.flatMap(s=>s.ranks),monitor:siblings.some(s=>s.monitor),protected:siblings.some(s=>s.protected),
   ...(siblings.some(s=>s.feedback==='NOT_RELEVANT')?{feedback:'NOT_RELEVANT'}:{})},now);
 }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score||a.identity_key.localeCompare(b.identity_key)||a.source_key.localeCompare(b.source_key));
 const unique=evaluated.filter((c,i,all)=>all.findIndex(x=>x.identity_key===c.identity_key)===i);
 // Preserve protected incumbent identities even when another source has a better preview.
 const protectedIds=new Set(candidates.filter(c=>c.monitor&&c.protected).map(c=>c.identity_key));
 const currentIds=new Set(candidates.filter(c=>c.monitor).map(c=>c.identity_key));
 const selected=unique.filter(c=>protectedIds.has(c.identity_key));
 const families=new Map<string,number>();for(const c of selected) families.set(c.family,(families.get(c.family)??0)+1);
 for(const c of unique) {
  if(selected.length>=capacity) break;
  if(!c.eligible||protectedIds.has(c.identity_key)||(families.get(c.family)??0)>=familyLimit) continue;
  selected.push(c);families.set(c.family,(families.get(c.family)??0)+1);
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
 return {version:SELECTION_VERSION,mode:'SIMULATION_ONLY',applied:false,capacity,familyLimit,current:currentIds.size,
  selectedCount:selected.length,protectedRetained:protectedIds.size,unfilled:Math.max(0,capacity-selected.length),
  overlap:selected.filter(c=>currentIds.has(c.identity_key)).length,newcomers:newcomers.length,
  proposedReplacements:replacements,selected,reserve,evaluated:unique,
  warning:'As notas não estimam unidades vendidas ou probabilidade de conversão. Não são ofertas aprovadas nem substituições executadas.'};
}
