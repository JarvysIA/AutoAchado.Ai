import {describe,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {collectCommercialEvidence} from '../src/server/commercial/service.js';
const mocks=vi.hoisted(()=>({preview:vi.fn()}));
vi.mock('../src/server/commercial/cohort-review.js',()=>({reviewAutomotiveCohort:async()=>({reviewed:0})}));
vi.mock('../src/server/discovery/product-preview.js',async original=>({...await original<object>(),
 configuredProductPreview:mocks.preview,configuredMeliReader:async()=>async()=>({content:[],results:[]})}));
it('persists retry times and continues other products when one source fails',async()=>{
 const rows=['MLB1','MLB2','MLB3'].map(id=>({source_key:'PRODUCT:'+id,product_id:id,type:'PRODUCT',category_id:'MLB5672',
  evidence_failures:0,preview:{price:50},identity_key:id,unavailable_attempts:0}));
 const updates:{table:string;data:any;key?:string}[]=[];
 const filters:any[]=[];
 const client={rpc:async(name:string)=>({data:name==='begin_commercial_collection'?'run':name==='commercial_candidate_categories'?[]:0,error:null}),
  from:(table:string)=>{let update:any;const q:any={select:()=>q,in:()=>q,neq:()=>q,order:()=>q,
   single:async()=>({data:{enabled:true,executor_ready:true,history_batch_size:25},error:null}),
   lte:(key:string,value:string)=>{filters.push({table,key,value});return q;},limit:()=>q,
   eq:(key:string,value:string)=>{if(update&&key==='source_key')update.key=value;return q;},
   update:(data:any)=>{update={table,data};updates.push(update);return q;},upsert:()=>q,
   then:(resolve:any)=>resolve({data:table==='commercial_watchlist'&&!update?rows:[],error:null})};return q;}
 } as unknown as SupabaseClient;
 mocks.preview.mockImplementation(async(_client,id)=>{
  if(id==='MLB2') throw new Error('upstream');
  return {title:'Compressor portátil',price:id==='MLB3'?null:50,currency:'BRL',comparable:true,seller_trusted:true,
   status:'CATALOG',priceCheckedAt:new Date().toISOString()};
 });
 const result=await collectCommercialEvidence(client);
 expect(result).toMatchObject({status:'PARTIAL',collected:1,failed:2,deferred:0});
 expect(filters.some(f=>f.table==='commercial_watchlist'&&f.key==='next_evidence_check')).toBe(true);
 const success=updates.find(u=>u.key==='PRODUCT:MLB1'&&u.data.last_valid_price_at)!;
 expect(success.data.monitor).toBeUndefined(); // A concurrent user stop must not be overwritten.
 expect(Date.parse(success.data.next_evidence_check)-Date.now()).toBeGreaterThan(11*3600000);
 for(const id of ['MLB2','MLB3']) {
  const retry=updates.find(u=>u.key==='PRODUCT:'+id&&u.data.evidence_failures===1)!;
  expect(retry.data.last_valid_price_at).toBeUndefined();
  expect(Date.parse(retry.data.next_evidence_check)-Date.now()).toBeLessThanOrEqual(30*60000);
 }
});
