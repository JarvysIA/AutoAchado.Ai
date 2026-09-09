import type {SupabaseClient} from '@supabase/supabase-js';
import {simulateSelection,demandPotential,type SelectionCandidate,type RankSignal} from './selection-algorithm.js';
import {analyzePriceTruth,priceHistoryStart} from './price-truth.js';
import type {Observation} from './ranking.js';

export interface SelectionInputs {
 snapshots:any[];watches:any[];memberships:any[];feedback:any[];sent:any[];changes:any[];observations:any[];snapshot_occurrences:number;
}
// One bounded database snapshot avoids dozens of sequential HTTP requests.
export async function runSelectionSimulation(client:SupabaseClient,now=Date.now()) {
 const {data,error}=await client.rpc('commercial_selection_inputs',{reference_time:new Date(now).toISOString(),history_start:new Date(priceHistoryStart(now)).toISOString()});
 if(error) throw new Error('SELECTION_SIMULATION_READ_FAILED');
 if(!data||!['snapshots','watches','memberships','feedback','sent','changes','observations'].every(k=>Array.isArray(data[k])))
  throw new Error('SELECTION_SIMULATION_INVALID_DATA');
 return analyzeSelectionInputs(data,now);
}
export function analyzeSelectionInputs(input:SelectionInputs,now=Date.now()) {
 const {snapshots,watches,memberships,feedback,sent,changes}=input;
 const ranks=new Map<string,RankSignal[]>();
 for(const r of snapshots) {
  const key=r.type+':'+r.product_id,list=ranks.get(key)??[];
  list.push({category:r.marketplace_category_id,observed_at:r.observed_at,position:r.position});ranks.set(key,list);
 }
 const bySource=new Map(watches.map(w=>[w.source_key,w]));
 const active=new Set(memberships.filter(m=>m.monitor).map(m=>m.identity_key));
 const protectedIds=new Set([...sent.map(s=>s.identity_key),...feedback.filter(f=>['SHARED','INTERESTED'].includes(f.action)).map(f=>f.identity_key)]);
 const actions=new Map(feedback.map(f=>[f.identity_key,f.action]));
 const monitoringStarts=new Map(changes.map(c=>[c.added_source,c.changed_at]));
 const candidates:SelectionCandidate[]=[...new Set([...ranks.keys(),...memberships.map(m=>m.source_key)])].map(key=>{
  const w=bySource.get(key),identity=w?.identity_key??key;
  return {source_key:key,identity_key:identity,preview:w?.preview,monitor:active.has(identity),protected:protectedIds.has(identity),
   feedback:actions.get(identity),monitor_since:monitoringStarts.get(key),ranks:ranks.get(key)??[]};
 });
 const result=simulateSelection(candidates,now);
 const historyByIdentity=new Map<string,Observation[]>();
 for(const row of input.observations) {const list=historyByIdentity.get(row.identity_key)??[];list.push(row);historyByIdentity.set(row.identity_key,list);}
 const summary=(c:typeof result.evaluated[number])=>({source_key:c.source_key,identity_key:c.identity_key,title:c.preview?.title??c.source_key,
  monitor:c.monitor,protected:c.protected,score:c.score,components:c.components,family:c.family,demand:c.demand,confidence:c.confidence,
  eligible:c.eligible,reasons:c.reasons,explanation:c.explanation,
  price_analysis:c.preview?analyzePriceTruth(c.preview,historyByIdentity.get(c.identity_key)??[],now):null});
 const current=result.evaluated.filter(c=>c.monitor);
 const familyCounts=(entries:typeof result.evaluated)=>entries.reduce<Record<string,number>>((totals,c)=>{totals[c.family]=(totals[c.family]??0)+1;return totals;},{});
 return {...result,selected:result.selected.map(summary),reserve:result.reserve.slice(0,100).map(summary),reserveCount:result.reserve.length,
  evaluated:result.evaluated.slice(0,500).map(summary),evaluatedTotal:result.evaluated.length,evaluatedPreviewLimit:500,currentEvaluated:current.map(summary),
  comparison:{currentFamilies:familyCounts(current),selectedFamilies:familyCounts(result.selected),eligible:result.evaluated.filter(c=>c.eligible).length,
   insufficientDemand:result.evaluated.filter(c=>c.demand.days<3).length},
  discoveryPriority:candidates.filter(c=>!c.preview).map(c=>({source_key:c.source_key,...demandPotential(c.ranks,now)}))
   .sort((a,b)=>b.score-a.score||a.source_key.localeCompare(b.source_key)).slice(0,30),
  checkedAt:new Date(now).toISOString(),snapshotOccurrences:input.snapshot_occurrences,knownPreviews:candidates.filter(c=>c.preview).length,
  limitation:'Usa presença nos rankings de descoberta para avaliar todos sob a mesma fonte. Sem volume recente comparável entre categorias. Tempo de permanência desconhecido bloqueia sugestão de troca.'};
}
