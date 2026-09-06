import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogOfferPreview, configuredMeliReader, configuredProductPreview, type ProductPreview } from "../discovery/product-preview.js";
import { affiliateIntelligence } from "../affiliate/coupon-service.js";
import { commercialProfile, rankProduct, selectDiverse, type Observation } from "./ranking.js";
import {exploreCandidates} from './admission.js';

type Watch = {source_key:string; product_id:string; type:string; category_id:string; snapshot:Record<string,unknown>;
  identity_key:string; preview:ProductPreview; last_collected_at:string|null; monitor:boolean; unavailable_attempts:number};
function checked<T>(result: {data:T; error:unknown}): T {
  if (result.error) throw new Error("COMMERCIAL_STORAGE_UNAVAILABLE");
  return result.data;
}
export function productIdentity(id: string, type: string, preview: ProductPreview): string {
  return preview.comparable && preview.catalog_product_id
    ? "catalog:" + preview.catalog_product_id + ":new:BRL:public"
    : type + ":" + id;
}
export async function saveObservation(client:SupabaseClient, id:string, type:string, preview:ProductPreview, position:number|null) {
  const observed = preview.priceCheckedAt ?? new Date().toISOString();
  checked(await client.from("commercial_observations").upsert({
    identity_key:productIdentity(id,type,preview),source_key:type+":"+id,
    observed_at:observed,observed_day:observed.slice(0,10),price:preview.price,currency:preview.currency,
    seller_id:preview.seller_id ?? null,comparable:preview.comparable === true,trusted:preview.seller_trusted === true,position,
  },{onConflict:"source_key,observed_at",ignoreDuplicates:true}));
}

export async function collectCommercialEvidence(client:SupabaseClient) {
  const runId = checked(await client.rpc("begin_commercial_collection")) as string|null;
  if (!runId) return {status:"BUSY",collected:0,failed:0};
  let collected=0,failed=0;
  const started=Date.now();
  try {
    checked(await client.rpc("seed_commercial_watchlist"));
    const candidates = checked(await client.from("commercial_watchlist").select("*").eq("monitor",true)
      .order("last_collected_at",{ascending:true,nullsFirst:true}).order("source_key").limit(48)) as Watch[];
    const liveRankings = new Map<string,Promise<Map<string,number>>>();
    const memberships=checked(await client.rpc('commercial_candidate_categories',{keys:candidates.map(c=>c.source_key)})) as {source_key:string;category_id:string}[];
    const positions = (category:string) => {
      if (!liveRankings.has(category)) liveRankings.set(category,(async () => {
        try {
          const categoryRead = await configuredMeliReader(client);
          const data = await categoryRead('/highlights/MLB/category/'+category);
          const values = new Map<string,number>();
          for(const entry of Array.isArray(data.content) ? data.content : []) {
            if (typeof entry.id === 'string' && Number.isInteger(entry.position) && entry.position>=1 && entry.position<=20)
              values.set(entry.type+':'+entry.id,entry.position);
          }
          return values;
        } catch { return new Map<string,number>(); }
      })());
      return liveRankings.get(category)!;
    };
    const queue=[...candidates];
    async function worker() {
      while(queue.length && Date.now()-started < 120000) {
        const row=queue.shift()!;
        try {
          const preview=await configuredProductPreview(client,row.product_id,row.type);
          const position=(await positions(row.category_id)).get(row.source_key) ?? null;
          await saveObservation(client,row.product_id,row.type,preview,position);
          const dimensions=[...new Set([row.category_id,...memberships.filter(m=>m.source_key===row.source_key).map(m=>m.category_id)])];
          for(const category of dimensions) {
            if(Date.now()-started>=120000) break;
            const rank=(await positions(category)).get(row.source_key);
            if(rank) checked(await client.from('commercial_rank_observations').upsert({identity_key:productIdentity(row.product_id,row.type,preview),
              category_id:category,observed_at:new Date().toISOString(),position:rank}));
          }
          // Observe additional offers for the same catalog, never merge by title.
          if(preview.comparable && preview.catalog_product_id && Date.now()-started < 120000) {
            try {
              const read=await configuredMeliReader(client);
              const offers=await read('/products/'+preview.catalog_product_id+'/items?limit=3');
              for (const offer of (Array.isArray(offers.results)?offers.results:[]).slice(0,3)) {
                if(typeof offer.item_id !== 'string' || !/^MLB\d+$/.test(offer.item_id)) continue;
                const extra=await catalogOfferPreview(preview.catalog_product_id,preview,offer,read);
                if(extra?.catalog_product_id === preview.catalog_product_id && extra.comparable)
                  await saveObservation(client,offer.item_id,'ITEM',extra,null);
              }
            } catch { /* Insufficient seller coverage remains visible in the ranking. */ }
          }
          const profile=commercialProfile(preview.title);
          const priceDrop=preview.comparable&&preview.seller_trusted&&position!==null&&position<=10&&profile.group!=='avaliar'
            &&preview.price!==null&&row.preview.price!==null&&preview.price<=row.preview.price*.95;
          const unavailable = !preview.price && preview.title === row.product_id ? (row.unavailable_attempts ?? 0) + 1 : 0;
          checked(await client.from('commercial_watchlist').update({preview,identity_key:productIdentity(row.product_id,row.type,preview),
            last_collected_at:new Date().toISOString(),unavailable_attempts:unavailable,monitor:profile.group !== 'especializado' && unavailable < 3,
            ...(priceDrop?{priority_until:new Date(Date.now()+8*3600000).toISOString(),next_priority_check:new Date().toISOString(),priority_reason:'OBSERVED_PRICE_DROP'}:{})}).eq('source_key',row.source_key));
          collected++;
        } catch { failed++; }
      }
    }
    await Promise.all([worker(),worker(),worker()]);
    failed+=queue.length;
    const exploration=await exploreCandidates(client,started+210000);
    const status=failed || exploration.failed || exploration.deferred ? 'PARTIAL' : 'COMPLETED';
    checked(await client.from('commercial_collection_runs').update({status,collected,failed,explored:exploration.evaluated,
      exploration_failed:exploration.failed,finished_at:new Date().toISOString()}).eq('id',runId));
    return {status,collected,failed,exploration};
  } catch(error) {
    await client.from('commercial_collection_runs').update({status:'FAILED',collected,failed,finished_at:new Date().toISOString()}).eq('id',runId);
    throw error;
  }
}

export async function commercialOpportunities(client:SupabaseClient, view:string, offset=0) {
  const watches:Watch[]=[];
  for(let page=0;;page++) {
    const rows=checked(await client.from('commercial_watchlist').select('*').order('source_key').range(page*500,page*500+499)) as Watch[];
    watches.push(...rows);if(rows.length<500) break;
    if(page>=19) throw new Error('COMMERCIAL_WATCHLIST_LIMIT');
  }
  const feedback:{identity_key:string;action:string}[]=[];
  for(let page=0;;page++) {
    const rows=checked(await client.from('commercial_feedback').select('identity_key,action').order('identity_key').range(page*500,page*500+499));
    feedback.push(...(rows??[]));if(!rows||rows.length<500) break;
    if(page>=19) throw new Error('COMMERCIAL_FEEDBACK_LIMIT');
  }
  const now=Date.now(), history: (Observation & {identity_key:string})[]=[];
  // Explicit pagination: the Supabase default row limit must not truncate the history.
  const identities=[...new Set(watches.map(w=>w.identity_key))];
  for(let start=0;start<identities.length;start+=100) for(let page=0;;page++) {
    const rows=checked(await client.from('commercial_observations').select('identity_key,observed_at,price,currency,seller_id,comparable,trusted,position')
      .in('identity_key',identities.slice(start,start+100)).gte('observed_at',new Date(now-30*86400000).toISOString())
      .order('source_key').order('observed_at').range(page*1000,page*1000+999)) as (Observation & {identity_key:string})[];
    history.push(...rows.map(row=>({...row,position:null}))); if(rows.length<1000) break;
    if(page>=99) throw new Error('COMMERCIAL_HISTORY_LIMIT');
  }
  for(let start=0;start<identities.length;start+=100) for(let page=0;;page++) {
    const rows=checked(await client.from('commercial_rank_observations').select('identity_key,category_id,observed_at,position')
      .in('identity_key',identities.slice(start,start+100)).gte('observed_at',new Date(now-14*86400000).toISOString())
      .order('identity_key').order('category_id').order('observed_at').range(page*1000,page*1000+999));
    history.push(...(rows??[]).map(row=>({...row,demand_category:row.category_id,price:null,currency:'BRL',seller_id:null,comparable:false,trusted:false})));
    if(!rows || rows.length<1000) break;
    if(page>=99) throw new Error('COMMERCIAL_RANK_HISTORY_LIMIT');
  }
  const historyByIdentity=new Map<string,Observation[]>();
  for(const observation of history) {
    const list=historyByIdentity.get(observation.identity_key)??[];list.push(observation);historyByIdentity.set(observation.identity_key,list);
  }
  const feedbackByIdentity=new Map(feedback.map(f=>[f.identity_key,f.action]));
  const allEvaluated=watches.filter(w=>w.preview?.title).map(w=>{
    const action=feedbackByIdentity.get(w.identity_key) ?? null;
    return {identity_key:w.identity_key,snapshot:w.snapshot,preview:{...w.preview,...affiliateIntelligence(w.preview)},
      feedback:action,rank:rankProduct(w.preview,historyByIdentity.get(w.identity_key)??[],action,now)};
  });
  const order={APPROVED:0,OBSERVING:1,REJECTED:2};
  const sorted=allEvaluated.sort((a,b)=>order[a.rank.state]-order[b.rank.state] || b.rank.score-a.rank.score || (a.preview.price??Infinity)-(b.preview.price??Infinity));
  const evaluated=sorted.filter((entry,index,rows)=>rows.findIndex(e=>e.identity_key===entry.identity_key)===index);
  const approved=selectDiverse(evaluated);
  const eligible=evaluated.filter(e=>e.rank.state===view).sort((a,b)=>b.rank.score-a.rank.score || a.identity_key.localeCompare(b.identity_key));
  const unique=eligible.filter((e,i,rows)=>rows.findIndex(r=>r.identity_key===e.identity_key)===i);
  const selected=view==='APPROVED'?approved:unique;
  const runs=checked(await client.from('commercial_collection_runs').select('status,started_at,finished_at,collected,failed,explored,exploration_failed')
    .eq('kind','HISTORY').order('started_at',{ascending:false}).limit(1));
  return {entries:selected.slice(offset,offset+12),total:selected.length,offset,hasMore:offset+12<selected.length,
    counts:{approved:approved.length,observing:new Set(evaluated.filter(e=>e.rank.state==='OBSERVING').map(e=>e.identity_key)).size,
      rejected:new Set(evaluated.filter(e=>e.rank.state==='REJECTED').map(e=>e.identity_key)).size,monitored:watches.filter(w=>w.monitor).length},
    coverage:checked(await client.rpc('commercial_coverage')),
    lastCollection:runs?.[0] ?? null,checkedAt:new Date(now).toISOString(),historyPolicy:'20 dias observados em 30, janela mínima de 27 dias, 2 vendedores; desconto mínimo de 10%.'};
}

export async function saveCommercialFeedback(client:SupabaseClient,id:string,type:string,action:string) {
  const row=checked(await client.from('commercial_watchlist').select('identity_key').eq('source_key',type+':'+id).maybeSingle());
  if(!row) throw new Error('COMMERCIAL_PRODUCT_NOT_FOUND');
  checked(await client.from('commercial_feedback').upsert({identity_key:row.identity_key,action,updated_at:new Date().toISOString()}));
  if(action==='INTERESTED' || action==='RESET') checked(await client.from('commercial_watchlist').update({monitor:true,unavailable_attempts:0}).eq('identity_key',row.identity_key));
  if(action==='NOT_RELEVANT') checked(await client.from('commercial_watchlist').update({monitor:false}).eq('identity_key',row.identity_key));
  return {saved:true};
}
