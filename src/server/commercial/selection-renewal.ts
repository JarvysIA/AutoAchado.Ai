import type {SupabaseClient} from '@supabase/supabase-js';
import {runSelectionSimulation} from './selection-simulation.js';
import {planRebalance,appliedToday,recentlyRemoved,READD_BLOCK_DAYS,type RebalancePlan} from './automotive-rebalance.js';

export const REBALANCE_APPLY_SETTING='AUTOMOTIVE_REBALANCE_APPLY';

/** Dry run until the operator flips the setting: the plan is recorded, nothing is swapped. */
async function applyEnabled(client:SupabaseClient):Promise<boolean> {
 const {data,error}=await client.from('operational_settings').select('value').eq('key',REBALANCE_APPLY_SETTING).maybeSingle();
 if(error) throw new Error('REBALANCE_SETTING_UNAVAILABLE');
 return data?.value===true||data?.value==='true';
}

// Persist one complete assessment generation before the transactional rebalance step.
export async function renewAutomotiveSelection(client:SupabaseClient,now=Date.now()) {
 const result=await runSelectionSimulation(client,now,10000,true);
 if(result.evaluatedTotal>result.evaluated.length) throw new Error('SELECTION_INCOMPLETE_GENERATION');
 const assessments=result.evaluated.filter(c=>c.price_analysis!==null).map(c=>({
  identity_key:c.identity_key,source_key:c.source_key,family:c.family??'desconhecida',score:c.score,
  demand_days:c.demand.days,eligible:c.eligible,preview_checked_at:c.price_checked_at,
  assessed_at:result.checkedAt,evidence:c,category_id:c.category_id,brand:c.brand,duplicate_key:c.duplicate_key,
 }));
 const stored=await client.rpc('replace_automotive_selection_assessments',{p_assessments:assessments});
 if(stored.error) {
  console.warn(JSON.stringify({event:'SELECTION_RENEWAL_FAILED',code:stored.error.code||'UNKNOWN'}));
  throw new Error('SELECTION_RENEWAL_FAILED');
 }
 const raw=(result as {raw?:Parameters<typeof planRebalance>[0]}).raw;
 if(!raw) throw new Error('SELECTION_RAW_UNAVAILABLE');
 return {assessments:stored.data as number,...await rebalanceAutomotive(client,raw,now)};
}

export async function rebalanceAutomotive(client:SupabaseClient,result:Parameters<typeof planRebalance>[0],now=Date.now()) {
 // Thirty days of history: today's ceilings and the products that must not come straight back.
 const since=new Date(now-READD_BLOCK_DAYS*86400000).toISOString();
 const history=await client.from('commercial_cohort_changes').select('reason,changed_at,removed_source')
  .eq('vertical_key','AUTOMOTIVE').gte('changed_at',since);
 if(history.error) throw new Error('REBALANCE_HISTORY_UNAVAILABLE');
 const changes=(history.data??[]) as {reason:string;changed_at:string;removed_source:string|null}[];
 const plan=planRebalance(result,now,appliedToday(changes,now),{recentlyRemoved:recentlyRemoved(changes,now)});
 const enabled=await applyEnabled(client);
 if(!enabled) return {rebalance:await recordPreview(client,plan),applied:false,mode:'DRY_RUN' as const};
 const applied=await client.rpc('apply_automotive_rebalance',{p_swaps:plan.swaps});
 if(applied.error) {
  console.warn(JSON.stringify({event:'REBALANCE_APPLY_FAILED',code:applied.error.code||'UNKNOWN'}));
  throw new Error('REBALANCE_APPLY_FAILED');
 }
 return {rebalance:{...plan.summary,planned:plan.swaps.length},applied:true,mode:'APPLY' as const,outcome:applied.data};
}

async function recordPreview(client:SupabaseClient,plan:RebalancePlan) {
 const saved=await client.from('automotive_rebalance_previews').insert({swaps:plan.swaps,summary:plan.summary});
 if(saved.error) throw new Error('REBALANCE_PREVIEW_WRITE_FAILED');
 return {...plan.summary,planned:plan.swaps.length};
}
