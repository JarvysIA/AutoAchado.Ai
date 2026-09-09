import type {ProductPreview} from '../discovery/product-preview.js';
import type {Observation} from './ranking.js';
const DAY=86400000;
const median=(v:number[])=>{const a=[...v].sort((a,b)=>a-b);return a.length%2?a[Math.floor(a.length/2)]!:(a[a.length/2-1]!+a[a.length/2]!)/2;};
export function priceHistoryStart(now:number) {
 const d=new Date(now);return d.getUTCMonth()>=8?Math.min(now-30*DAY,Date.UTC(d.getUTCFullYear(),8,1)):now-30*DAY;
}
function reference(history:Observation[],start:number,end:number) {
 const days=new Map<string,number>(),sellers=new Set<string>();
 for(const o of history) {
  const t=Date.parse(o.observed_at);
  if(t<start||t>=end||!Number.isFinite(t)||!o.comparable||!o.trusted||o.currency!=='BRL'||!o.seller_id||typeof o.price!=='number'||!Number.isFinite(o.price)||o.price<=0) continue;
  const day=new Date(t).toISOString().slice(0,10);days.set(day,Math.min(days.get(day)??Infinity,o.price));sellers.add(o.seller_id);
 }
 const first=days.size?Math.min(...[...days.keys()].map(Date.parse)):end;
 return {price:days.size?median([...days.values()]):null,days:days.size,sellers:sellers.size,sufficient:days.size>=20&&end-first>=27*DAY&&sellers.size>=2};
}
export function analyzePriceTruth(p:ProductPreview,history:Observation[],now=Date.now()) {
 const date=new Date(now),today=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
 const rolling=reference(history,now-30*DAY,today);
 const campaignStart=Date.UTC(date.getUTCFullYear(),8,1),campaignEnd=Date.UTC(date.getUTCFullYear(),9,1);
 const campaign=date.getUTCMonth()>=9?reference(history,campaignStart,campaignEnd):null;
 const usable=[rolling,...(campaign?[campaign]:[])].filter(r=>r.sufficient&&r.price!==null);
 const baseline=usable.length?Math.min(...usable.map(r=>r.price!)):null;
 const checked=Date.parse(p.priceCheckedAt??'');
 const valid=p.comparable&&p.seller_trusted&&p.status!=='UNAVAILABLE'&&p.currency==='BRL'&&typeof p.price==='number'&&Number.isFinite(p.price)&&p.price>0&&checked<=now&&checked>=now-DAY;
 const actual=valid&&baseline!==null?(baseline-p.price!)/baseline*100:null;
 const advertised=valid&&typeof p.original_price==='number'&&Number.isFinite(p.original_price)&&p.original_price>p.price!?(p.original_price-p.price!)/p.original_price*100:null;
 const inflated=actual!==null&&advertised!==null&&advertised>=5&&advertised-actual>5;
 const state=!valid?'CURRENT_PRICE_UNVERIFIED':actual===null?'INSUFFICIENT_HISTORY':inflated?'ANNOUNCED_NOT_CONFIRMED':actual>=10?'HISTORICAL_DISCOUNT':'USUAL_OR_HIGHER_PRICE';
 return {version:'price-truth-v1',state,reference_price:baseline,historical_discount_percent:actual===null?null:Math.round(actual),
  advertised_discount_percent:advertised===null?null:Math.round(advertised),historical_discount_confirmed:actual!==null&&actual>=10,
  rolling,campaign:campaign?{...campaign,start:new Date(campaignStart).toISOString(),endExclusive:new Date(campaignEnd).toISOString()}:null,
  policy:'Mediana dos mínimos diários observados. Quando suficiente, setembro fixa a janela pré-campanha; usamos a menor referência suficiente. Não inclui frete e não prova fraude.'};
}
