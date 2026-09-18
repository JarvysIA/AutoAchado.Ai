import type {SupabaseClient} from '@supabase/supabase-js';

// Read-only operational health. Uses only run bookkeeping already written by each executor:
// no Mercado Livre calls, no tokens, no product data.
export const HEALTH_VERTICALS=[
 {key:'AUTOMOTIVE',label:'Automotivo',table:'commercial_collection_runs'},
 {key:'HOME',label:'Casa',table:'home_runs'},
 {key:'APPLIANCES',label:'Eletrodomésticos',table:'appliances_runs'},
] as const;

export const STALL_HOURS=6;
export const FAILURE_STREAK=3;
const RUN_WINDOW=60;

export type RunRow={started_at:string;status:string;collected:number|null};
export type VerticalHealth={
 vertical:string;label:string;
 state:'OK'|'STALLED'|'FAILING'|'NO_RUNS';
 lastRunAt:string|null;lastProductiveAt:string|null;
 hoursSinceProductive:number|null;consecutiveFailures:number;
};

export function assessVertical(vertical:{key:string;label:string},rows:RunRow[],now:number):VerticalHealth {
 const runs=[...rows].sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at));
 let consecutiveFailures=0;
 for(const run of runs){if(run.status==='FAILED')consecutiveFailures++;else break;}
 const productive=runs.find(r=>Number(r.collected)>0)??null;
 const lastProductiveAt=productive?.started_at??null;
 const hoursSinceProductive=lastProductiveAt===null?null:Math.max(0,Math.floor((now-Date.parse(lastProductiveAt))/3600000));
 const base={vertical:vertical.key,label:vertical.label,lastRunAt:runs[0]?.started_at??null,lastProductiveAt,hoursSinceProductive,consecutiveFailures};
 if(!runs.length)return {...base,state:'NO_RUNS'};
 if(consecutiveFailures>=FAILURE_STREAK)return {...base,state:'FAILING'};
 if(hoursSinceProductive===null||hoursSinceProductive>=STALL_HOURS)return {...base,state:'STALLED'};
 return {...base,state:'OK'};
}

export async function collectionHealth(client:SupabaseClient,now=Date.now()) {
 const flags=await client.from('commercial_verticals').select('vertical_key,enabled,executor_ready');
 if(flags.error)throw new Error('HEALTH_STORAGE_UNAVAILABLE');
 const active=HEALTH_VERTICALS.filter(v=>{
  const row=(flags.data??[]).find((f:any)=>f.vertical_key===v.key);
  return row?.enabled===true&&(v.key==='AUTOMOTIVE'||row?.executor_ready===true);
 });
 const verticals:VerticalHealth[]=[];
 for(const vertical of active){
  const result=await client.from(vertical.table).select('started_at,status,collected').order('started_at',{ascending:false}).limit(RUN_WINDOW);
  if(result.error)throw new Error('HEALTH_STORAGE_UNAVAILABLE');
  verticals.push(assessVertical(vertical,(result.data??[]) as RunRow[],now));
 }
 const attention=verticals.filter(v=>v.state!=='OK');
 return {checkedAt:new Date(now).toISOString(),stallHours:STALL_HOURS,healthy:attention.length===0,verticals};
}

// Error messages in this codebase are fixed codes (e.g. HOME_DISABLED, PREVIEW_AUTH_UNAVAILABLE).
// Anything that does not look like one is reported as UNCLASSIFIED so no free text reaches logs.
export function safeErrorCode(error:unknown):string {
 const message=error instanceof Error?error.message:'';
 return /^[A-Z][A-Z0-9_]{2,63}$/.test(message)?message:'UNCLASSIFIED';
}
