import {afterEach,describe,expect,it,vi} from 'vitest';
import {loadDiscoveryEligibleCategories,type DiscoveryRegistryReadResult} from '../src/server/discovery/registry-reader.js';
import {safeErrorCode} from '../src/server/commercial/health.js';
import {DiscoveryError} from '../src/commerce/discovery/types.js';

const TABLES=['marketplaces','commerce_verticals','marketplace_categories','vertical_category_mappings'] as const;
const ok=(rows:unknown[]):DiscoveryRegistryReadResult=>({data:rows,error:null,status:200});
const refused=(status:number):DiscoveryRegistryReadResult=>({data:null,error:{message:'sanitized'},status});

// The real registry needs one active marketplace and one active vertical; categories and mappings
// may be empty, which yields zero eligible categories without tripping any validation.
const rowsFor=(table:string):unknown[]=>table==='marketplaces'
 ? [{marketplace_key:'MERCADO_LIVRE',active:true,config_version:'v1'}]
 : table==='commerce_verticals' ? [{vertical_key:'AUTOMOTIVE',active:true,config_version:'v1'}] : [];

type Plan=Partial<Record<string,DiscoveryRegistryReadResult[]>>;

function harness(plan:Plan={}) {
 const calls:{table:string}[]=[];
 const order:string[]=[];
 let inFlight=0,maxInFlight=0;
 const client={
  from(table:string){
   const query:any={
    select:()=>query,eq:()=>query,order:()=>query,
    range:async()=>{
     calls.push({table});order.push(table);
     inFlight+=1;maxInFlight=Math.max(maxInFlight,inFlight);
     try {
      await Promise.resolve();
      const scripted=plan[table]?.shift();
      if(scripted===undefined)return ok(rowsFor(table));
      if(scripted.error!==null&&scripted.status===undefined)throw new Error('SUPABASE_REQUEST_TIMEOUT');
      return scripted;
     } finally {inFlight-=1;}
    },
   };
   return query;
  },
 };
 const load=()=>loadDiscoveryEligibleCategories({client,marketplaceKey:'MERCADO_LIVRE',siteId:'MLB',verticalKey:'AUTOMOTIVE',sleep:async()=>{}});
 return {load,calls,order,attempts:(table:string)=>calls.filter(c=>c.table===table).length,maxInFlight:()=>maxInFlight};
}

afterEach(()=>{vi.restoreAllMocks();});

describe('registry reads survive intermittent Supabase refusals',()=>{
 it('retries a 401 once and succeeds on the second attempt',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const {load,attempts}=harness({marketplace_categories:[refused(401)]});
  await expect(load()).resolves.toEqual([]);
  expect(attempts('marketplace_categories')).toBe(2);
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({event:'SUPABASE_READ_RETRY',table:'marketplace_categories',status:401,attempt:1});
 });
 it('gives up after three attempts and keeps the existing reader error',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const {load,attempts}=harness({vertical_category_mappings:[refused(401),refused(401),refused(401)]});
  await expect(load()).rejects.toMatchObject({code:'DISCOVERY_REGISTRY_READ_FAILED'});
  expect(attempts('vertical_category_mappings')).toBe(3);
  expect(log.mock.calls.map(c=>JSON.parse(c[0] as string).attempt)).toEqual([1,2]);
 });
 it.each([408,429,500,503])('retries transient status %i',async(status)=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const {load,attempts}=harness({marketplaces:[refused(status)]});
  await expect(load()).resolves.toEqual([]);
  expect(attempts('marketplaces')).toBe(2);
 });
 it.each([400,404,403])('fails immediately on non-transient status %i',async(status)=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const {load,attempts}=harness({marketplaces:[refused(status)]});
  await expect(load()).rejects.toMatchObject({code:'DISCOVERY_REGISTRY_READ_FAILED'});
  expect(attempts('marketplaces')).toBe(1);
  expect(log).not.toHaveBeenCalled();
 });
 it('retries a network or timeout failure',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const {load,attempts}=harness({commerce_verticals:[{data:null,error:{message:'boom'}}]});
  await expect(load()).resolves.toEqual([]);
  expect(attempts('commerce_verticals')).toBe(2);
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({table:'commerce_verticals',status:'NETWORK',attempt:1});
 });
 it('reads the four tables one at a time, never two in flight',async()=>{
  const {load,order,maxInFlight}=harness();
  await load();
  expect(maxInFlight()).toBe(1);
  expect(order).toEqual([...TABLES]);
 });
 it('never writes the url, headers or key to the retry log',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const {load}=harness({marketplaces:[refused(401)]});
  await load();
  const written=log.mock.calls.flat().map(String).join('|');
  expect(Object.keys(JSON.parse(log.mock.calls[0]![0] as string))).toEqual(['event','table','status','attempt']);
  expect(written).not.toMatch(/http|apikey|authorization|bearer|sb_secret|eyJ/i);
 });
});

describe('safeErrorCode prefers the real error code',()=>{
 it('uses the code property of typed errors',()=>{
  expect(safeErrorCode(new DiscoveryError('DISCOVERY_REGISTRY_READ_FAILED','Falha sanitizada'))).toBe('DISCOVERY_REGISTRY_READ_FAILED');
  expect(safeErrorCode(Object.assign(new Error('qualquer texto livre'),{code:'DISCOVERY_LIVE_REGISTRY_MISMATCH'}))).toBe('DISCOVERY_LIVE_REGISTRY_MISMATCH');
 });
 it('falls back to the old rule when the code is unusable',()=>{
  expect(safeErrorCode(Object.assign(new Error('HOME_DISABLED'),{code:'not a code'}))).toBe('HOME_DISABLED');
  expect(safeErrorCode(Object.assign(new Error('texto livre'),{code:42}))).toBe('UNCLASSIFIED');
  expect(safeErrorCode(new Error('PREVIEW_AUTH_UNAVAILABLE'))).toBe('PREVIEW_AUTH_UNAVAILABLE');
  expect(safeErrorCode(new Error('token abc123 leaked'))).toBe('UNCLASSIFIED');
  expect(safeErrorCode('HOME_DISABLED')).toBe('UNCLASSIFIED');
  expect(safeErrorCode(null)).toBe('UNCLASSIFIED');
 });
});
