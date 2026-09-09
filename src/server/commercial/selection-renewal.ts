import type {SupabaseClient} from '@supabase/supabase-js';
import {runSelectionSimulation} from './selection-simulation.js';

// Persist one complete assessment generation before the transactional admission step.
export async function renewAutomotiveSelection(client:SupabaseClient) {
 const result=await runSelectionSimulation(client,Date.now(),10000);
 if(result.evaluatedTotal>result.evaluated.length) throw new Error('SELECTION_INCOMPLETE_GENERATION');
 const assessments=result.evaluated.filter(c=>c.price_analysis!==null).map(c=>({
  identity_key:c.identity_key,source_key:c.source_key,family:c.family,score:c.score,
  demand_days:c.demand.days,eligible:c.eligible,preview_checked_at:c.price_checked_at,
  assessed_at:result.checkedAt,evidence:c,
 }));
 const {data,error}=await client.rpc('refresh_commercial_selection',{assessments});
 if(error) {
  console.warn(JSON.stringify({event:'SELECTION_RENEWAL_FAILED',code:error.code||'UNKNOWN'}));
  throw new Error('SELECTION_RENEWAL_FAILED');
 }
 return data as number;
}
