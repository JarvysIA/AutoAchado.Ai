import {it,expect,vi,afterEach} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {renewAutomotiveSelection} from '../src/server/commercial/selection-renewal.js';
const simulate=vi.hoisted(()=>vi.fn());
vi.mock('../src/server/commercial/selection-simulation.js',()=>({runSelectionSimulation:simulate}));
afterEach(()=>vi.clearAllMocks());
it('persists the complete assessment generation through a single transactional renewal',async()=>{
 const row={identity_key:'catalog:MLB1',source_key:'PRODUCT:MLB1',price_analysis:{state:'INSUFFICIENT_HISTORY'},score:70,
 family:'pneus',demand:{days:7},eligible:true,price_checked_at:'2026-09-09T12:00:00Z'};
 simulate.mockResolvedValue({evaluated:[row,{...row,source_key:'ITEM:MLB2',price_analysis:null}],evaluatedTotal:2,checkedAt:'2026-09-09T12:00:01Z'});
 const rpc=vi.fn(async()=>({data:1,error:null}));
 expect(await renewAutomotiveSelection({rpc} as unknown as SupabaseClient)).toBe(1);
 expect(rpc).toHaveBeenCalledTimes(1);
 expect(rpc.mock.calls[0]).toEqual(['refresh_commercial_selection',{assessments:[{
 identity_key:row.identity_key,source_key:row.source_key,family:'pneus',score:70,demand_days:7,eligible:true,
 preview_checked_at:row.price_checked_at,assessed_at:'2026-09-09T12:00:01Z',evidence:row}]}]);
});
it('does not apply truncated inputs and propagates transaction failure',async()=>{
 const rpc=vi.fn(async()=>({data:null,error:'failure'}));
 const client={rpc} as unknown as SupabaseClient;
 simulate.mockResolvedValue({evaluated:[],evaluatedTotal:1});
 await expect(renewAutomotiveSelection(client)).rejects.toThrow('SELECTION_INCOMPLETE_GENERATION');expect(rpc).not.toHaveBeenCalled();
 simulate.mockResolvedValue({evaluated:[],evaluatedTotal:0});
 await expect(renewAutomotiveSelection(client)).rejects.toThrow('SELECTION_RENEWAL_FAILED');
});
