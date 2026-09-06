import type {SupabaseClient} from '@supabase/supabase-js';
import {configuredProductPreview,safePreviewUrl,type ProductPreview} from '../discovery/product-preview.js';
import {commercialProfile} from './ranking.js';

export function admissionDecision(p:ProductPreview, attempts:number) {
 const group=commercialProfile(p.title).group;
 if(group==='especializado' || p.status==='UNAVAILABLE') return {state:'REJECTED',reason:'UNSUITABLE_OR_UNAVAILABLE'};
 if(p.comparable && p.seller_trusted && p.currency==='BRL' && typeof p.price==='number' && Number.isFinite(p.price) && p.price>0
  && safePreviewUrl(p.image,true) && safePreviewUrl(p.url) && group!=='avaliar')
  return {state:'QUALIFIED',reason:null};
 return attempts>=3 ? {state:'REJECTED',reason:'INSUFFICIENT_ACCESS_OR_COMMERCIAL_PROFILE'}
  : {state:'RETRY',reason:'INCOMPLETE_EVIDENCE'};
}
function checked<T>(r:{data:T;error:unknown}):T {if(r.error) throw new Error('ADMISSION_STORAGE_FAILED');return r.data;}

// Called under the collector's database lock, after its reserved history budget.
export async function exploreCandidates(client:SupabaseClient, deadline:number) {
 const rows=checked(await client.from('commercial_candidate_queue').select('*')
  .in('state',['PENDING','RETRY']).lte('next_check_at',new Date().toISOString())
  .order('next_check_at').order('best_position').order('first_seen_at').order('source_key').limit(24));
 let evaluated=0,failed=0;
 const queue=[...(rows??[])];
 async function worker() {
  while(queue.length && Date.now()<deadline) {
   const row=queue.shift()!;
   const attempts=row.attempts+1;
   try {
    const p=await configuredProductPreview(client,row.product_id,row.type);
    const decision=admissionDecision(p,attempts);
    const identity=p.comparable && p.catalog_product_id ? 'catalog:'+p.catalog_product_id+':new:BRL:public' : row.source_key;
    // Ignore conflicts: an existing historical watch must never be reset by exploration.
    checked(await client.from('commercial_watchlist').upsert({source_key:row.source_key,product_id:row.product_id,
     type:row.type,category_id:row.category_id,snapshot:row.snapshot,identity_key:identity,preview:p,monitor:false},
     {onConflict:'source_key',ignoreDuplicates:true}));
    checked(await client.from('commercial_watchlist').update({preview:p,identity_key:identity}).eq('source_key',row.source_key).eq('monitor',false));
    checked(await client.from('commercial_candidate_queue').update({...decision,attempts,evaluated_at:new Date().toISOString(),
     next_check_at:new Date(Date.now()+86400000*Math.min(attempts,3)).toISOString()}).eq('source_key',row.source_key));
    evaluated++;
   } catch {
    failed++;
    checked(await client.from('commercial_candidate_queue').update({state:'RETRY',reason:'UPSTREAM_OR_STORAGE_FAILURE',attempts,
     next_check_at:new Date(Date.now()+86400000).toISOString()}).eq('source_key',row.source_key));
   }
  }
 }
 await Promise.all([worker(),worker()]);
 const promoted=checked(await client.rpc('promote_commercial_candidates'));
 return {evaluated,failed,promoted,deferred:queue.length};
}
