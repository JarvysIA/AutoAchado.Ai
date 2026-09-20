import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {exploreCandidates,outOfScope,MAX_UPSTREAM_ATTEMPTS} from '../src/server/commercial/admission.js';

const mocks=vi.hoisted(()=>({preview:vi.fn()}));
vi.mock('../src/server/discovery/product-preview.js',async importOriginal=>
 ({...await importOriginal<object>(),configuredProductPreview:mocks.preview}));
vi.mock('../src/server/commercial/cohort-review.js',()=>({reviewAutomotiveCohort:vi.fn(async()=>({reviewed:0}))}));
vi.mock('../src/server/commercial/selection-renewal.js',()=>({renewAutomotiveSelection:vi.fn(async()=>0)}));

const CATALOG='MLB63533';   // Compressores de Ar
const OUT_OF_SCOPE='MLB4860'; // Rodas de Carros e Caminhonetes
const row=(id:string,over:Record<string,unknown>={})=>({source_key:'PRODUCT:'+id,product_id:id,type:'PRODUCT',
 category_id:CATALOG,snapshot:{},attempts:0,best_position:3,first_seen_at:'2026-09-01T00:00:00Z',...over});
const preview={title:'Compressor portátil',description:null,image:'https://http2.mlstatic.com/a.jpg',
 url:'https://www.mercadolivre.com.br/p/MLB1',price:60,currency:'BRL',comparable:true,seller_trusted:true,status:'CATALOG'};

/** Records how the queue was read and what was written back. */
function fakeClient(rows:unknown[]) {
 const reads={orders:[] as [string,boolean][],limit:0,filters:[] as [string,unknown][]};
 const updates:Record<string,unknown>[]=[];
 const from=(table:string):any=>{
  const chain:any={
   select:()=>chain,in:()=>chain,lte:()=>chain,
   eq:(column:string,value:unknown)=>{if(table==='commercial_candidate_queue')reads.filters.push([column,value]);return chain;},
   order:(column:string,options?:{ascending?:boolean})=>{reads.orders.push([column,options?.ascending!==false]);return chain;},
   limit:(size:number)=>{reads.limit=size;return Promise.resolve({data:rows,error:null});},
   upsert:async()=>({error:null}),
   update:(values:Record<string,unknown>)=>{
    const applied:any={eq:(_c:string,key:unknown)=>{if(table==='commercial_candidate_queue')updates.push({key,...values});return applied;},
     then:(resolve:(r:{error:null})=>unknown)=>resolve({error:null})};
    return applied;
   },
  };
  return chain;
 };
 return {client:{from} as unknown as SupabaseClient,reads,updates};
}
const far=()=>Date.now()+60000;
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();});

describe('only catalog products reach the queue worker',()=>{
 it('asks the database for PRODUCT alone',async()=>{
  mocks.preview.mockResolvedValue(preview);
  const {client,reads}=fakeClient([]);
  await exploreCandidates(client,far(),true);
  expect(reads.filters).toContainEqual(['type','PRODUCT']);
 });
 it('parks new occurrences of the unsupported types on arrival, before any API call',()=>{
  const migration=readFileSync('supabase/migrations/20260921090000_admission_queue_throughput.sql','utf8');
  expect(migration).toContain("set state='REJECTED',reason='UNSUPPORTED_TYPE'");
  expect(migration).toContain("type in ('USER_PRODUCT','ITEM') and state in ('PENDING','RETRY')");
  // The seeding function itself parks them, so they never become due.
  expect(migration).toContain("when latest.type<>'PRODUCT' then 'REJECTED'");
  expect(migration).toContain("then 'UNSUPPORTED_TYPE' end");
 });
});

describe('out-of-scope categories cost nothing',()=>{
 it('rejects them without calling the preview',async()=>{
  mocks.preview.mockImplementation(()=>{throw new Error('PREVIEW_MUST_NOT_BE_CALLED');});
  const {client,updates}=fakeClient([row('MLB1',{category_id:OUT_OF_SCOPE}),row('MLB2',{category_id:'MLB999999'})]);
  const result=await exploreCandidates(client,far(),true);
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(result).toMatchObject({evaluated:0,failed:0,skipped:2});
  expect(updates.every(u=>u.state==='REJECTED'&&u.reason==='EXCLUDED_CATEGORY')).toBe(true);
 });
 it('agrees with the frozen family map',()=>{
  expect(outOfScope(OUT_OF_SCOPE)).toBe(true);
  expect(outOfScope('MLB999999')).toBe(true);
  expect(outOfScope(null)).toBe(true);
  expect(outOfScope(CATALOG)).toBe(false);
  // Kit de Segurança para Carros stays in scope; only the alarm kits are parked.
  expect(outOfScope('MLB410863')).toBe(false);
 });
});

describe('order and throughput',()=>{
 it('reads the best ranked first and the most recent next',async()=>{
  mocks.preview.mockResolvedValue(preview);
  const {client,reads}=fakeClient([]);
  await exploreCandidates(client,far(),true);
  expect(reads.orders[0]).toEqual(['best_position',true]);
  expect(reads.orders[1]).toEqual(['first_seen_at',false]);
 });
 it('takes thirty products per compact round',async()=>{
  mocks.preview.mockResolvedValue(preview);
  const {client,reads}=fakeClient([]);
  await exploreCandidates(client,far(),true);
  expect(reads.limit).toBe(30);
 });
 it('stops at the deadline and leaves the rest for the next round',async()=>{
  mocks.preview.mockResolvedValue(preview);
  const rows=Array.from({length:30},(_,i)=>row('MLB'+i));
  const {client}=fakeClient(rows);
  const result=await exploreCandidates(client,Date.now()-1,true);
  expect(result.evaluated).toBe(0);
  expect(result.deferred).toBe(30);
  expect(mocks.preview).not.toHaveBeenCalled();
 });
});

describe('failures record a cause and retry sooner',()=>{
 it('logs a sanitized code with the upstream status and retries in six hours',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.preview.mockRejectedValue(Object.assign(new Error('PREVIEW_FETCH_FAILED'),{status:503}));
  const {client,updates}=fakeClient([row('MLB1')]);
  const result=await exploreCandidates(client,far(),true);
  expect(result.failed).toBe(1);
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({event:'ADMISSION_ITEM_FAILED',code:'PREVIEW_FETCH_FAILED',status:503});
  expect(updates[0]).toMatchObject({state:'RETRY',reason:'UPSTREAM_OR_STORAGE_FAILURE',attempts:1});
  const delay=Date.parse(updates[0]!.next_check_at as string)-Date.now();
  expect(delay).toBeGreaterThan(5.5*3600000);
  expect(delay).toBeLessThanOrEqual(6*3600000);
 });
 it('never writes the product id, url or key to the log',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.preview.mockRejectedValue(new Error('https://api.mercadolibre.com/items/MLB123?token=abc'));
  const {client}=fakeClient([row('MLB123')]);
  await exploreCandidates(client,far(),true);
  const written=log.mock.calls.flat().map(String).join('|');
  expect(written).not.toContain('MLB123');
  expect(written).not.toContain('http');
  expect(JSON.parse(log.mock.calls[0]![0] as string).code).toBe('UNCLASSIFIED');
 });
 it('gives up after four upstream failures',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.preview.mockRejectedValue(new Error('PREVIEW_FETCH_FAILED'));
  const {client,updates}=fakeClient([row('MLB1',{attempts:MAX_UPSTREAM_ATTEMPTS-1})]);
  await exploreCandidates(client,far(),true);
  expect(updates[0]).toMatchObject({state:'REJECTED',reason:'PERSISTENT_UPSTREAM_FAILURE',attempts:MAX_UPSTREAM_ATTEMPTS});
  expect(updates[0]!.next_check_at).toBeUndefined();
 });
});
