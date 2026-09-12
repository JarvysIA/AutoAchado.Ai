import type {SupabaseClient} from '@supabase/supabase-js';
import {configuredMeliReader,resolveProductPreview,catalogOfferPreview,safePreviewUrl,type ProductPreview,type PreviewReader} from '../discovery/product-preview.js';
import {HOME_CATEGORIES} from './home-config.js';
import {assessHome} from './home-editorial.js';
import {rankProduct,type Observation} from './ranking.js';
import {demandPotential} from './selection-algorithm.js';
import {affiliateIntelligence} from '../affiliate/coupon-service.js';
import {priceTimeline,timelineStart} from './price-timeline.js';
import {analyzePriceTruth,priceHistoryStart} from './price-truth.js';

function checked<T>(r:{data:T;error:unknown}):T {if(r.error) throw new Error('HOME_STORAGE_UNAVAILABLE');return r.data;}
const identity=(id:string)=>'catalog:'+id+':new:BRL:public';
export function homeContext(title:string,category:string) {
 const e=assessHome(title,category);
 return {profile:{appeal:e.state==='CANDIDATE'?80:40,ease:e.state==='CANDIDATE'?85:35,reason:null},
  editorial:{state:e.state==='CANDIDATE'?'ELIGIBLE':e.state,family:e.family,reason:e.reasons.join(' ')}};
}
export function homeEligible(p:ProductPreview,category:string) {
 return assessHome(p.title,category).state==='CANDIDATE'&&p.status!=='UNAVAILABLE'&&p.comparable===true&&p.seller_trusted===true
  &&p.currency==='BRL'&&typeof p.price==='number'&&Number.isFinite(p.price)&&p.price>0&&!!safePreviewUrl(p.image,true)&&!!safePreviewUrl(p.url);
}
async function enabled(client:SupabaseClient) {
 const row=checked(await client.from('commercial_verticals').select('enabled,executor_ready').eq('vertical_key','HOME').single());
 if(!row?.enabled||!row.executor_ready) throw new Error('HOME_DISABLED');
}
async function history(client:SupabaseClient,ids:string[]) {
 const result:(Observation&{identity_key:string;category_id?:string})[]=[];
 if(!ids.length)return result;
 const start=new Date(Math.min(priceHistoryStart(Date.now()),timelineStart(Date.now()))).toISOString();
 for(let startIndex=0;startIndex<ids.length;startIndex+=100) for(const table of ['home_observations','home_rank_observations']) for(let page=0;;page++) {
  const rows=checked(await client.from(table).select('*').in('identity_key',ids.slice(startIndex,startIndex+100)).gte('observed_at',start)
   .order('observed_at').order('identity_key').order(table==='home_observations'?'source_key':'category_id').range(page*1000,page*1000+999));
  result.push(...(rows??[]).map(r=>table==='home_observations'?{...r,price:r.price===null?null:Number(r.price),position:null}:
   {...r,price:null,currency:'BRL',seller_id:null,comparable:false,trusted:false,demand_category:r.category_id}));
  if(!rows||rows.length<1000)break;if(page>=99)throw new Error('HOME_HISTORY_LIMIT');
 }return result;
}
async function savePrice(client:SupabaseClient,id:string,source:string,p:ProductPreview) {
 if(!p.priceCheckedAt||!p.comparable||p.catalog_product_id!==id||!p.price)return;
 checked(await client.from('home_observations').upsert({identity_key:identity(id),source_key:source,observed_at:p.priceCheckedAt,
  price:p.price,currency:p.currency,seller_id:p.seller_id??null,comparable:true,trusted:p.seller_trusted===true},{onConflict:'identity_key,source_key,observed_at',ignoreDuplicates:true}));
}
async function observe(client:SupabaseClient,id:string,category:string,read:PreviewReader,p:ProductPreview) {
 if(p.catalog_product_id!==id)return;
 await savePrice(client,id,'PRODUCT:'+id,p);
 if(p.comparable)try {
  const offers=await read('/products/'+id+'/items?limit=3');
  for(const offer of (Array.isArray(offers.results)?offers.results:[]).slice(0,3)) {
   const extra=await catalogOfferPreview(id,p,offer,read);
   if(extra)await savePrice(client,id,'ITEM:'+offer.item_id,extra);
  }
 }catch {/* Keep the real evidence already collected; never invent another seller. */}
}
async function assessStored(client:SupabaseClient,rows:any[]) {
 const observations=await history(client,rows.map(r=>r.identity_key));
 for(const row of rows) {
  const own=observations.filter(o=>o.identity_key===row.identity_key);
  const demand=demandPotential(own.filter(o=>o.position!==null).map(o=>({category:o.demand_category!,position:o.position!,observed_at:o.observed_at})));
  const context=homeContext(row.preview.title??'',row.category_id);
  // During initial seeding one observed ranking admits a candidate, not an approved offer.
  const score=Math.round(demand.score+context.profile.appeal*.20+context.profile.ease*.15+(row.preview.seller_trusted?10:0)+(row.preview.price<=150?5:3));
  const e=assessHome(row.preview.title??'',row.category_id);
  checked(await client.from('home_candidates').update({score,assessment:{...e,eligible:homeEligible(row.preview,row.category_id)&&demand.days>0,
   demand,assessed_at:new Date().toISOString(),components:{demand:demand.score,utility:context.profile.appeal*.20,ease:context.profile.ease*.15,seller:row.preview.seller_trusted?10:0,ticket:row.preview.price<=150?5:3}}}).eq('source_key',row.source_key));
 }
}
async function allCandidates(client:SupabaseClient) {
 const rows:any[]=[];for(let page=0;;page++) {
  const batch=checked(await client.from('home_candidates').select('*').order('source_key').range(page*500,page*500+499));rows.push(...(batch??[]));
  if(!batch||batch.length<500)break;if(page>=19)throw new Error('HOME_CANDIDATE_LIMIT');
 }return rows;
}
export async function runHome(client:SupabaseClient,kind:'DISCOVERY'|'HISTORY') {
 await enabled(client);const run=checked(await client.rpc('begin_home_run',{run_kind:kind}));
 if(!run)return {status:'BUSY',collected:0,failed:0};
 let collected=0,failed=0;const deadline=Date.now()+200000;
 try {
  const read=await configuredMeliReader(client);
  if(kind==='DISCOVERY') {
   const checks=checked(await client.from('home_category_checks').select('*'))??[];
   const categories=[...HOME_CATEGORIES].sort((a,b)=>String(checks.find(c=>c.category_id===a.id)?.checked_at??'').localeCompare(String(checks.find(c=>c.category_id===b.id)?.checked_at??'')));
   const seen=new Set<string>();
   for(const category of categories) {
    if(Date.now()>=deadline)break;
    try {
     const c=await read('/categories/'+category.id);
     if(c.id!==category.id||!c.path_from_root?.some((p:any)=>p.id==='MLB1574'))throw new Error('HOME_ANCESTRY');
     const ranking=await read('/highlights/MLB/category/'+category.id);
     let complete=true;
     const pending=[...(Array.isArray(ranking.content)?ranking.content:[])];
     const workers=await Promise.allSettled(Array.from({length:3},async()=>{
     while(pending.length) {
      const entry=pending.shift();
      if(Date.now()>=deadline){complete=false;break;}
      if(entry.type!=='PRODUCT'||!/^MLB\d+$/.test(entry.id)||!Number.isInteger(entry.position)||entry.position<1||entry.position>20)continue;
      checked(await client.from('home_rank_observations').upsert({identity_key:identity(entry.id),category_id:category.id,position:entry.position,observed_at:new Date().toISOString()}));
      if(seen.has(entry.id))continue;seen.add(entry.id);
      const p=await resolveProductPreview(entry.id,'PRODUCT',read);
      const e=assessHome(p.title,category.id);
      checked(await client.from('home_candidates').upsert({source_key:'PRODUCT:'+entry.id,product_id:entry.id,identity_key:identity(entry.id),category_id:category.id,family:category.family,preview:p},
       {onConflict:'source_key',ignoreDuplicates:true}));
      // Preserve established category, feedback and monitoring decisions.
      checked(await client.from('home_candidates').update({preview:p}).eq('source_key','PRODUCT:'+entry.id));
      if(e.state==='CANDIDATE')await observe(client,entry.id,category.id,read,p);
      collected++;
     }
     }));
     if(workers.some(w=>w.status==='rejected'))throw new Error('HOME_CATEGORY_PARTIAL');
     if(complete)checked(await client.from('home_category_checks').upsert({category_id:category.id,checked_at:new Date().toISOString(),status:200}));
    }catch {failed++;checked(await client.from('home_category_checks').upsert({category_id:category.id,checked_at:new Date().toISOString(),status:503}));}
   }
  }else {
   const rows=checked(await client.from('home_candidates').select('*').eq('monitor',true).lte('next_check',new Date().toISOString()).order('next_check').order('source_key').limit(25))??[];
   const rankings=new Map<string,any[]>();
   for(const row of rows) {
    if(Date.now()>=deadline)break;
    checked(await client.from('home_candidates').update({last_attempt:new Date().toISOString(),next_check:new Date(Date.now()+3600000).toISOString()}).eq('source_key',row.source_key));
    try {
     const p=await resolveProductPreview(row.product_id,'PRODUCT',read);
     await observe(client,row.product_id,row.category_id,read,p);
     if(!rankings.has(row.category_id)){const r=await read('/highlights/MLB/category/'+row.category_id);rankings.set(row.category_id,Array.isArray(r.content)?r.content:[]);}
     const rank=rankings.get(row.category_id)!.find(r=>r.type==='PRODUCT'&&r.id===row.product_id);
     if(rank&&Number.isInteger(rank.position)&&rank.position>=1&&rank.position<=20)checked(await client.from('home_rank_observations').upsert({identity_key:row.identity_key,category_id:row.category_id,position:rank.position,observed_at:new Date().toISOString()}));
     checked(await client.from('home_candidates').update({preview:p,next_check:new Date(Date.now()+(homeEligible(p,row.category_id)?12:1)*3600000).toISOString()}).eq('source_key',row.source_key));collected++;
    }catch {failed++;}
   }
  }
  await assessStored(client,await allCandidates(client));
  const admitted=checked(await client.rpc('renew_home_candidates'));
  checked(await client.from('home_runs').update({status:'COMPLETED',finished_at:new Date().toISOString(),collected,failed}).eq('id',run));
  return {status:'COMPLETED',collected,failed,admitted};
 }catch(error){await client.from('home_runs').update({status:'FAILED',finished_at:new Date().toISOString(),collected,failed}).eq('id',run);throw error;}
}

export async function homeOpportunities(client:SupabaseClient,view:string,offset:number) {
 await enabled(client);const rows=await allCandidates(client);
 const sent=checked(await client.from('commercial_sent_products').select('identity_key,sent_at').eq('vertical_key','HOME'))??[];
 const watches=rows.filter(r=>r.monitor||sent.some(s=>s.identity_key===r.identity_key&&s.sent_at));
 const observations=await history(client,watches.map(w=>w.identity_key));
 const entries=watches.map(w=>{
  const own=observations.filter(o=>o.identity_key===w.identity_key),p=w.preview;
  return {identity_key:w.identity_key,monitor:w.monitor,feedback:w.feedback,sent_at:sent.find(s=>s.identity_key===w.identity_key)?.sent_at??null,
   snapshot:{product_id:w.product_id,type:'PRODUCT',category_id:w.category_id,vertical_key:'HOME'},preview:{...p,...affiliateIntelligence(p)},
   selection:{...w.assessment,score:w.score,assessed_at:w.assessment.assessed_at,reasons:w.assessment.reasons??[]},
   rank:rankProduct(p,own,w.feedback,Date.now(),homeContext(p.title,w.category_id)),price_analysis:analyzePriceTruth(p,own),price_timeline:priceTimeline(p,own)};
 });
 entries.sort((a,b)=>Number(b.rank.state==='APPROVED')-Number(a.rank.state==='APPROVED')||b.selection.score-a.selection.score||a.identity_key.localeCompare(b.identity_key));
 const monitored=entries.filter(e=>e.monitor),approved=monitored.filter(e=>e.rank.state==='APPROVED'&&!e.sent_at),published=entries.filter(e=>e.sent_at);
 const selected=view==='ALL'?monitored:view==='SENT'?published:view==='APPROVED'?approved:monitored.filter(e=>e.rank.state===view);
 const runs=checked(await client.from('home_runs').select('*').order('started_at',{ascending:false}).limit(1));
 return {entries:selected.slice(offset,offset+50),total:selected.length,hasMore:offset+50<selected.length,capacity:100,
  counts:{monitored:monitored.length,approved:approved.length,sent:published.length},lastCollection:runs?.[0]??null};
}
export async function revalidateHome(client:SupabaseClient,id:string,type:string) {
 await enabled(client);if(type!=='PRODUCT')throw new Error('HOME_PRODUCT_TYPE');
 const row=checked(await client.from('home_candidates').select('*').eq('product_id',id).maybeSingle());
 if(!row)throw new Error('HOME_PRODUCT_NOT_FOUND');
 const p=await resolveProductPreview(id,type,await configuredMeliReader(client));
 checked(await client.from('home_candidates').update({preview:p}).eq('product_id',id));
 const own=await history(client,[row.identity_key]);
 return {ready:p.status!=='UNAVAILABLE'&&!!p.title&&p.title!==id&&!!p.price&&p.currency==='BRL'&&!!safePreviewUrl(p.image,true)&&!!safePreviewUrl(p.url)&&Date.parse(p.priceCheckedAt??'')>=Date.now()-60000,
  preview:{...p,...affiliateIntelligence(p),commercial:rankProduct(p,own,row.feedback,Date.now(),homeContext(p.title,row.category_id))}};
}
export async function homeAction(client:SupabaseClient,id:string,type:string,action:string,sent?:boolean) {
 await enabled(client);if(type!=='PRODUCT')throw new Error('HOME_PRODUCT_TYPE');
 const row=checked(await client.from('home_candidates').select('identity_key').eq('product_id',id).maybeSingle());if(!row)throw new Error('HOME_PRODUCT_NOT_FOUND');
 if(action==='sent')checked(await client.from('commercial_sent_products').upsert({vertical_key:'HOME',identity_key:row.identity_key,sent_at:sent?new Date().toISOString():null,updated_at:new Date().toISOString()}));
 else checked(await client.from('home_candidates').update({feedback:action,...(action==='NOT_RELEVANT'?{monitor:false}: {})}).eq('product_id',id));
 return {saved:true};
}
