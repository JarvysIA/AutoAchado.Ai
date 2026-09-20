import type {SupabaseClient} from '@supabase/supabase-js';
import {configuredProductPreview,safePreviewUrl,type ProductPreview} from '../discovery/product-preview.js';
import {assessAutomotive} from './editorial.js';
import {familyForCategory} from './automotive-families.js';
import {safeErrorCode} from './health.js';
import {reviewAutomotiveCohort} from './cohort-review.js';
import {renewAutomotiveSelection} from './selection-renewal.js';

// USER_PRODUCT answers 403 on /user-products/* and ITEM almost never qualifies; both were eating the
// admission budget ahead of catalog products. Reversible: add the type back here and in
// seed_commercial_watchlist, and move the parked rows back to PENDING.
export const ADMITTED_TYPES=['PRODUCT'] as const;
const RETRY_AFTER_FAILURE=6*3600000;
export const MAX_UPSTREAM_ATTEMPTS=4;
const BATCH_COMPACT=30,BATCH_FULL=20;

export function admissionDecision(p:ProductPreview, attempts:number, categoryId:string|null|undefined) {
 const editorial=assessAutomotive(p,categoryId);
 if(editorial.state==='EXCLUDE' || p.status==='UNAVAILABLE') return {state:'REJECTED',reason:'UNSUITABLE_OR_UNAVAILABLE'};
 if(p.comparable && p.seller_trusted && p.currency==='BRL' && typeof p.price==='number' && Number.isFinite(p.price) && p.price>0
  && safePreviewUrl(p.image,true) && safePreviewUrl(p.url) && editorial.state==='ELIGIBLE')
  return {state:'QUALIFIED',reason:null};
 return attempts>=3 ? {state:'REJECTED',reason:'INSUFFICIENT_ACCESS_OR_COMMERCIAL_PROFILE'}
  : {state:'RETRY',reason:'INCOMPLETE_EVIDENCE'};
}
function checked<T>(r:{data:T;error:unknown}):T {if(r.error) throw new Error('ADMISSION_STORAGE_FAILED');return r.data;}

/** Out-of-scope categories are decided from the frozen map, with no call to Mercado Livre. */
export function outOfScope(categoryId:string|null|undefined):boolean {
 const family=familyForCategory(categoryId);
 return family===null||family==='EXCLUDED';
}

// Called under the collector's database lock, after its reserved history budget.
export async function exploreCandidates(client:SupabaseClient, deadline:number, compact=false) {
 // Best ranked first, then the most recently seen: a product discovered today is worth more than
 // one that has been waiting at the back of the queue since the sweep started.
 const due=client.from('commercial_candidate_queue').select('*')
  .in('state',['PENDING','RETRY']).lte('next_check_at',new Date().toISOString())
  .eq('type','PRODUCT')
  .order('best_position').order('first_seen_at',{ascending:false}).order('source_key')
  .limit(compact?BATCH_COMPACT:BATCH_FULL);
 const rows=checked(await due)??[];
 let evaluated=0,failed=0,skipped=0;
 const queue=[...rows];
 async function worker() {
  while(queue.length && Date.now()<deadline) {
   const row=queue.shift()!;
   const attempts=row.attempts+1;
   if(outOfScope(row.category_id)) {
    checked(await client.from('commercial_candidate_queue').update({state:'REJECTED',reason:'EXCLUDED_CATEGORY',
     attempts,evaluated_at:new Date().toISOString()}).eq('source_key',row.source_key));
    skipped++;continue;
   }
   try {
    const p=await configuredProductPreview(client,row.product_id,row.type);
    const decision=admissionDecision(p,attempts,row.category_id);
    const identity=p.comparable && p.catalog_product_id ? 'catalog:'+p.catalog_product_id+':new:BRL:public' : row.source_key;
    // Ignore conflicts: an existing historical watch must never be reset by exploration.
    checked(await client.from('commercial_watchlist').upsert({source_key:row.source_key,product_id:row.product_id,
     type:row.type,category_id:row.category_id,snapshot:row.snapshot,identity_key:identity,preview:p,monitor:false},
     {onConflict:'source_key',ignoreDuplicates:true}));
    checked(await client.from('commercial_watchlist').update({preview:p,identity_key:identity}).eq('source_key',row.source_key).eq('monitor',false));
    checked(await client.from('commercial_candidate_queue').update({...decision,attempts,evaluated_at:new Date().toISOString(),
     next_check_at:new Date(Date.now()+86400000*Math.min(attempts,3)).toISOString()}).eq('source_key',row.source_key));
    evaluated++;
   } catch(error) {
    failed++;
    // Product id, url and key stay out of the log; only the sanitized code and the upstream status.
    const status=(error as {status?:unknown}).status;
    console.error(JSON.stringify({event:'ADMISSION_ITEM_FAILED',code:safeErrorCode(error),
     status:typeof status==='number'?status:null}));
    const exhausted=attempts>=MAX_UPSTREAM_ATTEMPTS;
    checked(await client.from('commercial_candidate_queue').update({
     state:exhausted?'REJECTED':'RETRY',reason:exhausted?'PERSISTENT_UPSTREAM_FAILURE':'UPSTREAM_OR_STORAGE_FAILURE',
     attempts,...(exhausted?{evaluated_at:new Date().toISOString()}:{next_check_at:new Date(Date.now()+RETRY_AFTER_FAILURE).toISOString()}),
    }).eq('source_key',row.source_key));
   }
  }
 }
 await Promise.all([worker(),worker()]);
 await reviewAutomotiveCohort(client);
 const promoted=await renewAutomotiveSelection(client);
 return {evaluated,failed,skipped,promoted,deferred:queue.length};
}
