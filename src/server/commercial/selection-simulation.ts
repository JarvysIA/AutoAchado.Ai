import type {SupabaseClient} from '@supabase/supabase-js';
import {simulateSelection,demandPotential,type SelectionCandidate,type RankSignal} from './selection-algorithm.js';
import {analyzePriceTruth,priceHistoryStart} from './price-truth.js';
import type {Observation} from './ranking.js';

async function pages(query:(start:number,end:number)=>PromiseLike<{data:any[]|null;error:unknown}>,maximum=200) {
 const rows:any[]=[];
 for(let page=0;page<maximum;page++) {
  const {data,error}=await query(page*500,page*500+499);
  if(error) throw new Error('SELECTION_SIMULATION_READ_FAILED');
  rows.push(...(data??[]));if(!data||data.length<500) return rows;
 }
 throw new Error('SELECTION_SIMULATION_INCOMPLETE_DATA');
}
// No writes: the reference algorithm must be inspected against real data before activation.
export async function runSelectionSimulation(client:SupabaseClient,now=Date.now()) {
 const [snapshots,watches,memberships,feedback,sent,changes]=await Promise.all([
  pages((a,b)=>client.from('highlight_snapshots').select('type,product_id,marketplace_category_id,position,observed_at,scan_runs!inner(vertical_key)')
   .eq('scan_runs.vertical_key','AUTOMOTIVE')
   .gte('observed_at',new Date(now-14*86400000).toISOString()).lte('observed_at',new Date(now).toISOString())
   .order('observed_at').order('marketplace_category_id').order('type').order('product_id').range(a,b)),
  pages((a,b)=>client.from('commercial_watchlist').select('source_key,identity_key,preview,monitor').order('source_key').range(a,b)),
  pages((a,b)=>client.from('commercial_vertical_memberships').select('source_key,identity_key,monitor').eq('vertical_key','AUTOMOTIVE').order('identity_key').range(a,b)),
  pages((a,b)=>client.from('commercial_vertical_feedback').select('identity_key,action').eq('vertical_key','AUTOMOTIVE').order('identity_key').range(a,b)),
  pages((a,b)=>client.from('commercial_sent_products').select('identity_key,sent_at').eq('vertical_key','AUTOMOTIVE').not('sent_at','is',null).order('identity_key').range(a,b)),
  pages((a,b)=>client.from('commercial_cohort_changes').select('added_source,changed_at').eq('vertical_key','AUTOMOTIVE').order('changed_at').order('id').range(a,b)),
 ]);
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
 const identities=[...new Set(result.evaluated.filter(c=>c.preview).map(c=>c.identity_key))];
 const historyByIdentity=new Map<string,Observation[]>();
 for(let i=0;i<identities.length;i+=100) {
  const rows=await pages((a,b)=>client.from('commercial_observations').select('identity_key,observed_at,price,currency,seller_id,comparable,trusted,position')
   .in('identity_key',identities.slice(i,i+100)).gte('observed_at',new Date(priceHistoryStart(now)).toISOString())
   .lte('observed_at',new Date(now).toISOString()).order('source_key').order('observed_at').range(a,b));
  for(const row of rows) {const list=historyByIdentity.get(row.identity_key)??[];list.push(row);historyByIdentity.set(row.identity_key,list);}
 }
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
  checkedAt:new Date(now).toISOString(),snapshotOccurrences:snapshots.length,knownPreviews:watches.length,
  limitation:'Usa presença nos rankings de descoberta para avaliar todos sob a mesma fonte. Sem volume recente comparável entre categorias. Tempo de permanência desconhecido bloqueia sugestão de troca.'};
}
