import type {ProductPreview} from '../discovery/product-preview.js';
import type {Observation} from './ranking.js';
const DAY=86400000;
export function timelineStart(now:number) {
  const d=new Date(now);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-90*DAY;
}
/** Only comparable, trusted public BRL observations of this exact identity. */
export function priceTimeline(preview:ProductPreview, history:Observation[], now=Date.now()) {
  const start=timelineStart(now), today=start+90*DAY;
  const daily=new Map<string,number>();
  for(const o of history) {
    const t=Date.parse(o.observed_at);
    if(!Number.isFinite(t)||t<start||t>now||!o.comparable||!o.trusted||!o.seller_id||o.currency!=='BRL'||typeof o.price!=='number'||!Number.isFinite(o.price)||o.price<=0) continue;
    const day=new Date(t).toISOString().slice(0,10);
    daily.set(day,Math.min(daily.get(day)??Infinity,o.price));
  }
  const days=[...daily.keys()].sort(), groups=new Map<string,number[]>();
  for(const day of days) {const month=day.slice(0,7), values=groups.get(month)??[];values.push(daily.get(day)!);groups.set(month,values);}
  const months=[...groups].map(([month,values])=>{
    values.sort((a,b)=>a-b);const n=values.length;
    return {month,days:n,typical:n%2?values[Math.floor(n/2)]!:(values[n/2-1]!+values[n/2]!)/2,minimum:values[0]!};
  });
  const prior=[...daily].filter(([day])=>Date.parse(day)<today);
  const checked=Date.parse(preview.priceCheckedAt??'');
  const currentValid=preview.comparable&&preview.seller_trusted&&!!preview.seller_id&&preview.status!=='UNAVAILABLE'&&preview.currency==='BRL'&&typeof preview.price==='number'&&Number.isFinite(preview.price)&&preview.price>0&&checked<=now&&checked>=now-DAY;
  const minimum=prior.length?Math.min(...prior.map(([,price])=>price)):null;
  return {months,days:days.length,first_day:days[0]??null,last_day:days.at(-1)??null,
    start:new Date(start).toISOString(),end:new Date(now).toISOString(),
    complete_90_days:prior.length===90,current_verified:!!currentValid,
    lowest_observed:!!currentValid&&minimum!==null&&preview.price!<=Math.min(...daily.values()),previous_minimum:minimum};
}
