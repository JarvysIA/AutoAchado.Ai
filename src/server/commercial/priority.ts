import type {SupabaseClient} from '@supabase/supabase-js';
import {configuredProductPreview,configuredMeliReader} from '../discovery/product-preview.js';
import {productIdentity,saveObservation} from './service.js';
function checked<T>(r:{data:T;error:unknown}):T {if(r.error) throw new Error('PRIORITY_STORAGE_FAILED');return r.data;}
export async function collectPriority(client:SupabaseClient) {
 const runId=checked(await client.rpc('begin_commercial_collection'));
 if(!runId) return {status:'BUSY',collected:0,failed:0};
 let collected=0,failed=0;
 const start=Date.now();
 try {
  checked(await client.from('commercial_collection_runs').update({kind:'PRIORITY'}).eq('id',runId));
  const rows=checked(await client.from('commercial_watchlist').select('*').eq('monitor',true)
   .gt('priority_until',new Date().toISOString()).lte('next_priority_check',new Date().toISOString())
   .order('next_priority_check').order('source_key').limit(6));
  for(const row of rows??[]) {
   if(Date.now()-start>120000){failed++;continue;}
   try {
    const preview=await configuredProductPreview(client,row.product_id,row.type,true);
    await saveObservation(client,row.product_id,row.type,preview,null);
    if(preview.catalog_product_id) {
     try {
      const read=await configuredMeliReader(client);
      const rank=await read('/highlights/MLB/product/'+preview.catalog_product_id);
      if(rank.dimension==='category'&&/^MLB\d+$/.test(rank.id)&&Number.isInteger(rank.position)&&rank.position>=1&&rank.position<=20)
       checked(await client.from('commercial_rank_observations').upsert({identity_key:productIdentity(row.product_id,row.type,preview),category_id:rank.id,
        observed_at:new Date().toISOString(),position:rank.position}));
     } catch { /* Missing live ranking is not new evidence. */ }
    }
    checked(await client.from('commercial_watchlist').update({preview,identity_key:productIdentity(row.product_id,row.type,preview),
     next_priority_check:new Date(Date.now()+30*60000).toISOString(),
     ...(preview.status==='UNAVAILABLE'?{priority_until:new Date().toISOString()}:{}),
    }).eq('source_key',row.source_key));collected++;
   } catch {
    failed++;
    checked(await client.from('commercial_watchlist').update({next_priority_check:new Date(Date.now()+3600000).toISOString()}).eq('source_key',row.source_key));
   }
  }
  const status=failed?'PARTIAL':'COMPLETED';
  checked(await client.from('commercial_collection_runs').update({status,collected,failed,finished_at:new Date().toISOString()}).eq('id',runId));
  return {status,collected,failed};
 } catch(error) {
  await client.from('commercial_collection_runs').update({status:'FAILED',collected,failed,finished_at:new Date().toISOString()}).eq('id',runId);
  throw error;
 }
}
