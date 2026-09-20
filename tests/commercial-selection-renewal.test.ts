import {it,expect,vi,afterEach} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {renewAutomotiveSelection} from '../src/server/commercial/selection-renewal.js';
const simulate=vi.hoisted(()=>vi.fn());
vi.mock('../src/server/commercial/selection-simulation.js',()=>({runSelectionSimulation:simulate}));
afterEach(()=>vi.clearAllMocks());

const row={identity_key:'catalog:MLB1',source_key:'PRODUCT:MLB1',price_analysis:{state:'INSUFFICIENT_HISTORY'},score:70,
 family:'pneus_calibragem',category_id:'MLB63533',brand:'vonixx',duplicate_key:'vonixx:v10',
 demand:{days:7},eligible:true,price_checked_at:'2026-09-09T12:00:00Z'};
const emptyRaw={evaluated:[],reserve:[],currentIds:new Set<string>(),protectedIds:new Set<string>(),proposedReplacements:[]};

/** Minimal stand-in for the tables the renewal touches, plus the rebalance setting. */
function client(apply:boolean,rpc=vi.fn(async(_name:string,_args?:unknown)=>({data:1,error:null}))) {
 const previews:unknown[]=[];
 const from=vi.fn((table:string)=>{
  if(table==='operational_settings') return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{value:apply},error:null})})})};
  if(table==='commercial_cohort_changes') return {select:()=>({eq:()=>({gte:async()=>({data:[],error:null})})})};
  return {insert:async(value:unknown)=>{previews.push(value);return {error:null};}};
 });
 return {client:{rpc,from} as unknown as SupabaseClient,rpc,previews,from};
}

it('stores the assessment generation with category, brand and duplicate key',async()=>{
 simulate.mockResolvedValue({evaluated:[row,{...row,source_key:'ITEM:MLB2',price_analysis:null}],evaluatedTotal:2,
  checkedAt:'2026-09-09T12:00:01Z',raw:emptyRaw});
 const {client:c,rpc}=client(false);
 const result=await renewAutomotiveSelection(c);
 expect(result.assessments).toBe(1);
 expect(rpc.mock.calls[0]).toEqual(['replace_automotive_selection_assessments',{p_assessments:[{
  identity_key:row.identity_key,source_key:row.source_key,family:'pneus_calibragem',score:70,demand_days:7,eligible:true,
  preview_checked_at:row.price_checked_at,assessed_at:'2026-09-09T12:00:01Z',evidence:row,
  category_id:'MLB63533',brand:'vonixx',duplicate_key:'vonixx:v10'}]}]);
 // The old promotion entry point is no longer reached by the automotive path.
 expect(rpc.mock.calls.some(call=>call[0]==='refresh_commercial_selection')).toBe(false);
});

it('records the plan and never calls the apply RPC while the setting is false',async()=>{
 simulate.mockResolvedValue({evaluated:[],evaluatedTotal:0,checkedAt:'2026-09-09T12:00:01Z',raw:emptyRaw});
 const {client:c,rpc,previews}=client(false);
 const result=await renewAutomotiveSelection(c);
 expect(result).toMatchObject({applied:false,mode:'DRY_RUN'});
 expect(previews).toHaveLength(1);
 expect(previews[0]).toMatchObject({swaps:[],summary:{diversity:0,advantage:0}});
 expect(rpc.mock.calls.map(call=>call[0])).toEqual(['replace_automotive_selection_assessments']);
});

it('applies through the rebalance RPC once the setting is true',async()=>{
 simulate.mockResolvedValue({evaluated:[],evaluatedTotal:0,checkedAt:'2026-09-09T12:00:01Z',raw:emptyRaw});
 const {client:c,rpc,previews}=client(true);
 const result=await renewAutomotiveSelection(c);
 expect(result).toMatchObject({applied:true,mode:'APPLY'});
 expect(previews).toHaveLength(0);
 expect(rpc.mock.calls.map(call=>call[0])).toEqual(['replace_automotive_selection_assessments','apply_automotive_rebalance']);
});

it('does not apply truncated inputs and propagates transaction failure',async()=>{
 const rpc=vi.fn(async(_name:string,_args?:unknown)=>({data:null,error:'failure'}));
 const {client:c}=client(false,rpc as never);
 simulate.mockResolvedValue({evaluated:[],evaluatedTotal:1,raw:emptyRaw});
 await expect(renewAutomotiveSelection(c)).rejects.toThrow('SELECTION_INCOMPLETE_GENERATION');
 expect(rpc).not.toHaveBeenCalled();
 simulate.mockResolvedValue({evaluated:[],evaluatedTotal:0,checkedAt:'2026-09-09T12:00:01Z',raw:emptyRaw});
 await expect(renewAutomotiveSelection(c)).rejects.toThrow('SELECTION_RENEWAL_FAILED');
});
