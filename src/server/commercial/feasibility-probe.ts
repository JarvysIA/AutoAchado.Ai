import type {SupabaseClient} from '@supabase/supabase-js';
import {configuredMeliReader,PreviewUpstreamError} from '../discovery/product-preview.js';
// Fixed, read-only probes. No caller-supplied URLs, credentials or raw payloads returned.
export async function probeOfficialSources(client:SupabaseClient) {
 const read=await configuredMeliReader(client);
 const paths=['/items/MLB7076442330','/items?ids=MLB7076442330','/items/MLB6433211634','/items?ids=MLB6433211634','/products/MLB57468821','/products/MLB57468821/items?limit=3',
  '/highlights/MLB/product/MLB57468821',
  '/seller-promotions/users/296984475?app_version=v2',
  '/seller-promotions/items/MLB4690712449?app_version=v2'];
 const results=[];
 for(const path of paths) {
  const start=Date.now();
  try {
   const data=await read(path);
   results.push({path,status:200,ms:Date.now()-start,fields:Object.keys(data).slice(0,25),
    count:Array.isArray(data.results)?data.results.length:null,
    itemAccess:Array.isArray(data)?data.map(e=>({code:e.code,id:e.body?.id,hasPermalink:typeof e.body?.permalink==='string'})):undefined,
    hasDeadline:!!(data.finish_date||data.end_date||data.end_time),
    position:Number.isInteger(data.position)?data.position:null});
  } catch(error) {results.push({path,status:error instanceof PreviewUpstreamError?error.status:0,ms:Date.now()-start});}
 }
 return {checkedAt:new Date().toISOString(),globalPromotionFeedConfirmed:false,results};
}
