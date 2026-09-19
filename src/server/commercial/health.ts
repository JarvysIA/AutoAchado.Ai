import type {SupabaseClient} from '@supabase/supabase-js';

// Read-only operational health. Uses only run bookkeeping already written by each executor
// plus the connection status projection: no Mercado Livre calls, no tokens, no product data.
export const HEALTH_VERTICALS=[
 {key:'AUTOMOTIVE',label:'Automotivo',table:'commercial_collection_runs',kinded:false},
 {key:'HOME',label:'Casa',table:'home_runs',kinded:true},
 {key:'APPLIANCES',label:'Eletrodomésticos',table:'appliances_runs',kinded:true},
] as const;

// Portuguese needs the article glued to the vertical: "Coleta da Casa", not "Coleta Casa".
export const VERTICAL_ARTICLE_LABEL:Record<string,string>={AUTOMOTIVE:'do Automotivo',HOME:'da Casa',APPLIANCES:'de Eletrodomésticos'};
export const STALL_HOURS=6;
export const FAILURE_STREAK=3;
export const DISCOVERY_STALE_HOURS=30;
export const CONNECTION_STALE_HOURS=8;
export const CONNECTION_BAD_STATUS=['REAUTH_REQUIRED','REFRESH_OUTCOME_UNKNOWN','DISABLED'] as const;
const RUN_WINDOW=60;

export type RunRow={started_at:string;status:string;collected:number|null};
export type VerticalHealth={
 vertical:string;label:string;articleLabel:string;
 state:'OK'|'STALLED'|'FAILING'|'NO_RUNS';
 lastRunAt:string|null;lastProductiveAt:string|null;
 hoursSinceProductive:number|null;consecutiveFailures:number;
};
export type DiscoveryHealth={
 vertical:string;label:string;articleLabel:string;state:'OK'|'STALE';
 lastDiscoveryAt:string|null;hoursSinceDiscovery:number|null;
};
export type ConnectionRow={status:string;reauth_required:boolean;consecutive_failures:number|null;last_error_code:string|null;last_success_at:string|null;last_refresh_at:string|null};
export type ConnectionHealth={
 state:'OK'|'PROBLEM';reason:'REAUTH_REQUIRED'|'BAD_STATUS'|'NO_RECENT_SUCCESS'|'NO_CONNECTION'|null;
 status:string|null;reauthRequired:boolean;consecutiveFailures:number;lastErrorCode:string|null;
 lastSuccessAt:string|null;hoursSinceSuccess:number|null;
};

const articleOf=(key:string,label:string)=>VERTICAL_ARTICLE_LABEL[key]??label;
const hoursSince=(at:string|null,now:number)=>at===null?null:Math.max(0,Math.floor((now-Date.parse(at))/3600000));

export function assessVertical(vertical:{key:string;label:string},rows:RunRow[],now:number):VerticalHealth {
 const runs=[...rows].sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at));
 let consecutiveFailures=0;
 for(const run of runs){if(run.status==='FAILED')consecutiveFailures++;else break;}
 const productive=runs.find(r=>Number(r.collected)>0)??null;
 const lastProductiveAt=productive?.started_at??null;
 const hoursSinceProductive=hoursSince(lastProductiveAt,now);
 const base={vertical:vertical.key,label:vertical.label,articleLabel:articleOf(vertical.key,vertical.label),lastRunAt:runs[0]?.started_at??null,lastProductiveAt,hoursSinceProductive,consecutiveFailures};
 if(!runs.length)return {...base,state:'NO_RUNS'};
 if(consecutiveFailures>=FAILURE_STREAK)return {...base,state:'FAILING'};
 if(hoursSinceProductive===null||hoursSinceProductive>=STALL_HOURS)return {...base,state:'STALLED'};
 return {...base,state:'OK'};
}

// Discovery is what refills the watchlist; it runs daily, so it gets a wider window than collection.
export function assessDiscovery(vertical:{key:string;label:string},lastDiscoveryAt:string|null,now:number):DiscoveryHealth {
 const hoursSinceDiscovery=hoursSince(lastDiscoveryAt,now);
 const state=hoursSinceDiscovery===null||hoursSinceDiscovery>=DISCOVERY_STALE_HOURS?'STALE':'OK';
 return {vertical:vertical.key,label:vertical.label,articleLabel:articleOf(vertical.key,vertical.label),state,lastDiscoveryAt,hoursSinceDiscovery};
}

export function assessConnection(row:ConnectionRow|null,now:number):ConnectionHealth {
 if(!row)return {state:'PROBLEM',reason:'NO_CONNECTION',status:null,reauthRequired:true,consecutiveFailures:0,lastErrorCode:null,lastSuccessAt:null,hoursSinceSuccess:null};
 const hoursSinceSuccess=hoursSince(row.last_success_at,now);
 const base={status:row.status,reauthRequired:row.reauth_required===true,consecutiveFailures:Number(row.consecutive_failures??0),lastErrorCode:row.last_error_code??null,lastSuccessAt:row.last_success_at??null,hoursSinceSuccess};
 if(base.reauthRequired)return {...base,state:'PROBLEM',reason:'REAUTH_REQUIRED'};
 if((CONNECTION_BAD_STATUS as readonly string[]).includes(row.status))return {...base,state:'PROBLEM',reason:'BAD_STATUS'};
 if(hoursSinceSuccess===null||hoursSinceSuccess>=CONNECTION_STALE_HOURS)return {...base,state:'PROBLEM',reason:'NO_RECENT_SUCCESS'};
 return {...base,state:'OK',reason:null};
}

async function lastDiscoveryAt(client:SupabaseClient,vertical:typeof HEALTH_VERTICALS[number]):Promise<string|null> {
 const result=vertical.kinded
  ? await client.from(vertical.table).select('started_at,status').eq('kind','DISCOVERY').eq('status','COMPLETED').order('started_at',{ascending:false}).limit(1)
  : await client.from('scan_runs').select('started_at,status').eq('vertical_key',vertical.key).eq('job_type','COMMERCE_DISCOVERY').in('status',['COMPLETED','PARTIAL']).order('started_at',{ascending:false}).limit(1);
 if(result.error)throw new Error('HEALTH_STORAGE_UNAVAILABLE');
 return (result.data??[])[0]?.started_at??null;
}

export async function collectionHealth(client:SupabaseClient,now=Date.now()) {
 const flags=await client.from('commercial_verticals').select('vertical_key,enabled,executor_ready');
 if(flags.error)throw new Error('HEALTH_STORAGE_UNAVAILABLE');
 const active=HEALTH_VERTICALS.filter(v=>{
  const row=(flags.data??[]).find((f:any)=>f.vertical_key===v.key);
  return row?.enabled===true&&(v.key==='AUTOMOTIVE'||row?.executor_ready===true);
 });
 const verticals:VerticalHealth[]=[];
 const discovery:DiscoveryHealth[]=[];
 for(const vertical of active){
  // Only HISTORY runs collect prices; a DISCOVERY run must not hide a stalled collection.
  const base=client.from(vertical.table).select('started_at,status,collected');
  const scoped=vertical.kinded?base.eq('kind','HISTORY'):base;
  const result=await scoped.order('started_at',{ascending:false}).limit(RUN_WINDOW);
  if(result.error)throw new Error('HEALTH_STORAGE_UNAVAILABLE');
  verticals.push(assessVertical(vertical,(result.data??[]) as RunRow[],now));
  discovery.push(assessDiscovery(vertical,await lastDiscoveryAt(client,vertical),now));
 }
 const connectionResult=await client.rpc('operational_meli_connection_status');
 if(connectionResult.error)throw new Error('HEALTH_STORAGE_UNAVAILABLE');
 const raw=connectionResult.data;
 const connection=assessConnection((Array.isArray(raw)?raw[0]:raw)??null,now);
 const healthy=verticals.every(v=>v.state==='OK')&&discovery.every(d=>d.state==='OK')&&connection.state==='OK';
 return {checkedAt:new Date(now).toISOString(),stallHours:STALL_HOURS,discoveryStaleHours:DISCOVERY_STALE_HOURS,healthy,verticals,discovery,connection};
}

export type CollectionHealth=Awaited<ReturnType<typeof collectionHealth>>;

// Error messages in this codebase are fixed codes (e.g. HOME_DISABLED, PREVIEW_AUTH_UNAVAILABLE).
// Typed errors such as DiscoveryError carry the real code on `code`, which is preferred over the
// message. Anything that does not look like a code is reported as UNCLASSIFIED, so no free text
// and no interpolated value ever reaches the logs.
const ERROR_CODE=/^[A-Z][A-Z0-9_]{2,63}$/;
export function safeErrorCode(error:unknown):string {
 const code=(error as {code?:unknown}|null|undefined)?.code;
 if(typeof code==='string'&&ERROR_CODE.test(code))return code;
 const message=error instanceof Error?error.message:'';
 return ERROR_CODE.test(message)?message:'UNCLASSIFIED';
}
