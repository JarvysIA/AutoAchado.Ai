import type {SupabaseClient} from '@supabase/supabase-js';
import {configuredProductPreview,safePreviewUrl} from '../discovery/product-preview.js';
import {affiliateIntelligence} from '../affiliate/coupon-service.js';
import {productIdentity} from './service.js';
import {rankProduct,type Observation} from './ranking.js';
import {priceHistoryStart} from './price-truth.js';
function checked<T>(r:{data:T;error:unknown}):T {if(r.error) throw new Error('REVALIDATION_STORAGE_FAILED');return r.data;}
export async function revalidateProduct(client:SupabaseClient,id:string,type:string) {
 const preview=await configuredProductPreview(client,id,type,true);
 const identity=productIdentity(id,type,preview);
 const rows:Observation[]=[];
 for(const table of ['commercial_observations','commercial_rank_observations']) for(let page=0;;page++) {
  const data=checked(await client.from(table).select('*').eq('identity_key',identity)
   .gte('observed_at',new Date(priceHistoryStart(Date.now())).toISOString())
   .order('observed_at').order(table==='commercial_observations'?'source_key':'category_id').range(page*1000,page*1000+999));
  rows.push(...(data??[]).map(row=>table==='commercial_observations'?{...row,position:null}:
   {...row,demand_category:row.category_id,price:null,currency:'BRL',seller_id:null,comparable:false,trusted:false}));
  if(!data||data.length<1000) break;
  if(page>=99) throw new Error('REVALIDATION_HISTORY_LIMIT');
 }
 const feedback=checked(await client.from('commercial_vertical_feedback').select('action').eq('vertical_key','AUTOMOTIVE').eq('identity_key',identity).maybeSingle());
 const commercial=rankProduct(preview,rows,feedback?.action??null);
 checked(await client.from('commercial_watchlist').update({preview,identity_key:identity}).eq('source_key',type+':'+id));
 const ready=preview.priceLinkVerified===true&&preview.status!=='UNAVAILABLE'&&!!preview.title&&preview.title!==id&&!!safePreviewUrl(preview.image,true)
  &&!!safePreviewUrl(preview.url)&&!!preview.price&&preview.currency==='BRL'&&Date.parse(preview.priceCheckedAt??'')>=Date.now()-60000;
 return {ready,preview:{...preview,...affiliateIntelligence(preview),commercial}};
}
