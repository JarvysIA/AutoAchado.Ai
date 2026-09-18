import type { IncomingMessage, ServerResponse } from 'node:http';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {composeMessage,currentProblems,evaluateOperationalAlerts,planNotifications,recoveryLine,REMINDER_HOURS,type AlertStateRow} from '../src/server/commercial/alerts.js';
import {assessConnection,assessDiscovery,collectionHealth} from '../src/server/commercial/health.js';
import {handleRequest} from '../src/app.js';
import {createAuthorizationCookie} from '../src/oauth/session.js';

const tables=vi.hoisted(()=>({data:{} as Record<string,any[]>,connection:null as any}));
vi.mock('../src/server/discovery/operational.js',()=>({createOperationalDiscoveryAdapter:()=>({client:fakeClient(tables.data,tables.connection)})}));

function fakeClient(data:Record<string,any[]>,connection:any=null):any {
 const build=(table:string)=>{
  let rows=[...(data[table]??[])];
  const chain:any={select:()=>chain,
   eq:(column:string,value:any)=>{rows=rows.filter(r=>r[column]===value);return chain;},
   in:(column:string,values:any[])=>{rows=rows.filter(r=>values.includes(r[column]));return chain;},
   order:(column:string,options:any)=>{rows=[...rows].sort((a,b)=>options?.ascending===false?Date.parse(b[column])-Date.parse(a[column]):Date.parse(a[column])-Date.parse(b[column]));return chain;},
   limit:async(count:number)=>({data:rows.slice(0,count),error:null}),
   upsert:async(values:any[])=>{data[table]=[...(data[table]??[]).filter(r=>!values.some(v=>v.alert_key===r.alert_key)),...values];return {error:null};},
   then:(resolve:any)=>resolve({data:rows,error:null})};
  return chain;
 };
 return {from:build,rpc:async()=>({data:connection?[connection]:[],error:null})};
}

const NOW=Date.parse('2026-09-18T15:00:00Z');
const hoursAgo=(h:number)=>new Date(NOW-h*3600000).toISOString();
// Shaped like a real bot token so a leak would be recognisable, but not a real credential.
const TOKEN='111111:AAAAAAAA-this-token-is-fake-not-real';
const CHAT='-1001234567890';
const config={clientId:'fake',clientSecret:'fake',redirectUri:'https://autoachado-ai.vercel.app/auth/mercadolivre/callback',sessionSecret:'fake-test-session-secret-123456789012345'};
const cookie=()=>createAuthorizationCookie({authorized:true,userId:296984475,authorizedAt:Date.now()},config.sessionSecret).split(';')[0]!;
const state=(over:Partial<AlertStateRow>):AlertStateRow=>({alert_key:'MELI_AUTH',active:true,first_detected_at:hoursAgo(20),last_notified_at:hoursAgo(20),resolved_at:null,detail:'Conexão com o Mercado Livre perdida',...over});
const problem=(key:string,title:string)=>({key,title});

async function request(path:string,method:'GET'|'POST',headers:Record<string,string>={}) {
 const result={status:0,body:''};
 const response={writeHead(status:number){result.status=status;return this;},end(body:string){result.body=body;return this;}} as unknown as ServerResponse;
 await handleRequest({url:path,method,headers} as IncomingMessage,response,{loadAppConfig:()=>config});return result;
}
function configured() {vi.stubEnv('TELEGRAM_BOT_TOKEN',TOKEN);vi.stubEnv('TELEGRAM_CHAT_ID',CHAT);}
// One stalled vertical, one stale discovery and a missing connection: three problems at once.
function brokenWorld() {
 tables.connection=null;
 tables.data={commercial_verticals:[{vertical_key:'AUTOMOTIVE',enabled:true,executor_ready:true}],commercial_collection_runs:[],scan_runs:[],operational_alert_state:[]};
}
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.clearAllMocks();tables.data={};tables.connection=null;});

describe('alert state machine',()=>{
 it('notifies a problem the first time it is seen',()=>{
  const plan=planNotifications([problem('MELI_AUTH','x')],[],NOW);
  expect(plan.fresh.map(p=>p.problem.key)).toEqual(['MELI_AUTH']);
  expect(plan.reminders).toHaveLength(0);
 });
 it('stays silent while an active problem is younger than the reminder window',()=>{
  const plan=planNotifications([problem('MELI_AUTH','x')],[state({last_notified_at:hoursAgo(REMINDER_HOURS-1)})],NOW);
  expect(plan.fresh).toHaveLength(0);
  expect(plan.reminders).toHaveLength(0);
  expect(plan.silent.map(p=>p.problem.key)).toEqual(['MELI_AUTH']);
  expect(composeMessage(plan)).toBeNull();
 });
 it('repeats an active problem once the reminder window passes',()=>{
  const plan=planNotifications([problem('MELI_AUTH','Conexão com o Mercado Livre perdida')],[state({last_notified_at:hoursAgo(REMINDER_HOURS)})],NOW);
  expect(plan.reminders.map(p=>p.problem.key)).toEqual(['MELI_AUTH']);
  expect(composeMessage(plan)).toContain('🟠 Conexão com o Mercado Livre perdida (continua)');
 });
 it('closes an active alert that is no longer a problem',()=>{
  const plan=planNotifications([],[state({})],NOW);
  expect(plan.resolved.map(s=>s.alert_key)).toEqual(['MELI_AUTH']);
  expect(composeMessage(plan)).toContain('✅ Conexão com o Mercado Livre restabelecida');
 });
 it('names only the subject when something recovers, without the old hours',()=>{
  expect(recoveryLine('DISCOVERY:HOME')).toBe('Descoberta da Casa voltou ao normal');
  expect(recoveryLine('COLLECTION:APPLIANCES')).toBe('Coleta de Eletrodomésticos voltou ao normal');
  expect(recoveryLine('MELI_AUTH')).toBe('Conexão com o Mercado Livre restabelecida');
  const plan=planNotifications([],[state({alert_key:'COLLECTION:HOME',detail:'Coleta da Casa parada há 9h'})],NOW);
  expect(composeMessage(plan)).toContain('✅ Coleta da Casa voltou ao normal');
  expect(composeMessage(plan)).not.toContain('9h');
 });
 it('groups every problem into a single message with the dashboard link',()=>{
  const plan=planNotifications([problem('COLLECTION:HOME','Coleta da Casa parada há 9h'),problem('DISCOVERY:AUTOMOTIVE','Descoberta do Automotivo sem rodar há 31h')],[],NOW);
  const message=composeMessage(plan)!;
  expect(message.split('🔴')).toHaveLength(3);
  expect(message).toContain('Dashboard: https://autoachado-ai.vercel.app/');
  expect(message).not.toContain('/auth/start');
 });
 it('offers the reconnect link only when the connection is the problem',()=>{
  const message=composeMessage(planNotifications([problem('MELI_AUTH','Conexão com o Mercado Livre perdida')],[],NOW))!;
  expect(message).toContain('Reconectar Mercado Livre: https://autoachado-ai.vercel.app/auth/start');
 });
});

describe('discovery and connection checks',()=>{
 const vertical={key:'AUTOMOTIVE',label:'Automotivo'};
 it('accepts a discovery run inside the 30h window and flags it after',()=>{
  expect(assessDiscovery(vertical,hoursAgo(29),NOW).state).toBe('OK');
  expect(assessDiscovery(vertical,hoursAgo(30),NOW)).toMatchObject({state:'STALE',hoursSinceDiscovery:30});
  expect(assessDiscovery(vertical,null,NOW)).toMatchObject({state:'STALE',hoursSinceDiscovery:null});
 });
 it('treats reauth, bad status and a stale success as connection problems',()=>{
  const base={status:'ACTIVE',reauth_required:false,consecutive_failures:0,last_error_code:null,last_success_at:hoursAgo(1),last_refresh_at:hoursAgo(1)};
  expect(assessConnection(base,NOW).state).toBe('OK');
  expect(assessConnection({...base,reauth_required:true},NOW)).toMatchObject({state:'PROBLEM',reason:'REAUTH_REQUIRED'});
  expect(assessConnection({...base,status:'REFRESH_OUTCOME_UNKNOWN'},NOW)).toMatchObject({state:'PROBLEM',reason:'BAD_STATUS'});
  expect(assessConnection({...base,last_success_at:hoursAgo(9)},NOW)).toMatchObject({state:'PROBLEM',reason:'NO_RECENT_SUCCESS'});
 });
 it('ignores DISCOVERY runs when judging whether collection is stalled',async()=>{
  const connection={status:'ACTIVE',reauth_required:false,consecutive_failures:0,last_error_code:null,last_success_at:hoursAgo(1),last_refresh_at:hoursAgo(1)};
  const health=await collectionHealth(fakeClient({
   commercial_verticals:[{vertical_key:'HOME',enabled:true,executor_ready:true}],
   home_runs:[{started_at:hoursAgo(1),kind:'DISCOVERY',status:'COMPLETED',collected:40},{started_at:hoursAgo(12),kind:'HISTORY',status:'COMPLETED',collected:7}],
  },connection),NOW);
  expect(health.verticals[0]).toMatchObject({vertical:'HOME',state:'STALLED',hoursSinceProductive:12});
  expect(health.discovery[0]).toMatchObject({vertical:'HOME',state:'OK'});
 });
});

describe('telegram delivery',()=>{
 it('sends one grouped message and records the notified state',async()=>{
  configured();brokenWorld();
  const send=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({})} as any);
  const result=await evaluateOperationalAlerts(fakeClient(tables.data,tables.connection),NOW);
  expect(result).toMatchObject({notified:true,problems:3});
  expect(send).toHaveBeenCalledTimes(1);
  expect(tables.data.operational_alert_state!.map((r:any)=>r.alert_key).sort()).toEqual(['COLLECTION:AUTOMOTIVE','DISCOVERY:AUTOMOTIVE','MELI_AUTH']);
  expect(tables.data.operational_alert_state!.every((r:any)=>r.active===true&&r.last_notified_at!==null)).toBe(true);
 });
 it('leaves the state untouched when the send fails, so the next run retries',async()=>{
  configured();brokenWorld();
  vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:false,status:500,json:async()=>({})} as any);
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const result=await evaluateOperationalAlerts(fakeClient(tables.data,tables.connection),NOW);
  expect(result).toMatchObject({notified:false,reason:'TELEGRAM_SEND_FAILED'});
  expect(tables.data.operational_alert_state).toEqual([]);
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({event:'TELEGRAM_SEND_FAILED',status:500});
 });
 it('does not touch the network when the bot is not configured',async()=>{
  vi.stubEnv('TELEGRAM_BOT_TOKEN','');vi.stubEnv('TELEGRAM_CHAT_ID','');
  brokenWorld();
  const send=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({})} as any);
  const result=await evaluateOperationalAlerts(fakeClient(tables.data,tables.connection),NOW);
  expect(result).toMatchObject({notified:false,reason:'TELEGRAM_NOT_CONFIGURED'});
  expect(send).not.toHaveBeenCalled();
  expect(tables.data.operational_alert_state).toEqual([]);
 });
 it('never lets the bot token reach a log or a response',async()=>{
  configured();brokenWorld();
  vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:false,status:401,json:async()=>({})} as any);
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const info=vi.spyOn(console,'log').mockImplementation(()=>{});
  const result=await evaluateOperationalAlerts(fakeClient(tables.data,tables.connection),NOW);
  const written=[...log.mock.calls,...warn.mock.calls,...info.mock.calls].flat().map(String).join('|');
  expect(written).not.toContain(TOKEN);
  expect(written).not.toContain(CHAT);
  expect(JSON.stringify(result)).not.toContain(TOKEN);
  expect(JSON.stringify(result)).not.toContain(CHAT);
 });
 it('derives the problem list from health, in Portuguese',async()=>{
  brokenWorld();
  const problems=currentProblems(await collectionHealth(fakeClient(tables.data,tables.connection),NOW));
  expect(problems.map(p=>p.key)).toEqual(['MELI_AUTH','COLLECTION:AUTOMOTIVE','DISCOVERY:AUTOMOTIVE']);
  expect(problems[2]!.title).toBe('Descoberta do Automotivo sem registro');
 });
});

describe('alert endpoints',()=>{
 it('refuses the cron endpoint without the bearer',async()=>{
  vi.stubEnv('CRON_SECRET','test-only');
  expect((await request('/api/commercial/alerts','GET')).status).toBe(401);
  expect((await request('/api/commercial/alerts','GET',{authorization:'Bearer wrong'})).status).toBe(401);
 });
 it('refuses the test endpoint without the operator session',async()=>{
  expect((await request('/api/commercial/alerts/test','POST')).status).toBe(401);
 });
 it('refuses the test endpoint from another origin',async()=>{
  const result=await request('/api/commercial/alerts/test','POST',{cookie:cookie(),origin:'https://attacker.example'});
  expect(result.status).toBe(403);
  expect(JSON.parse(result.body).errorCode).toBe('ORIGIN_NOT_ALLOWED');
 });
 it('sends the test message for the operator',async()=>{
  configured();
  const send=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({})} as any);
  const result=await request('/api/commercial/alerts/test','POST',{cookie:cookie(),origin:'https://autoachado-ai.vercel.app'});
  expect(result.status).toBe(200);
  expect(JSON.parse(result.body)).toEqual({ok:true});
  expect(String((send.mock.calls[0]![1] as any).body)).toContain('Teste: alertas do Cyber Ofertas funcionando.');
 });
 it('reports a failed test send without leaking the token',async()=>{
  vi.stubEnv('TELEGRAM_BOT_TOKEN','');vi.stubEnv('TELEGRAM_CHAT_ID','');
  const result=await request('/api/commercial/alerts/test','POST',{cookie:cookie(),origin:'https://autoachado-ai.vercel.app'});
  expect(result.status).toBe(503);
  expect(JSON.parse(result.body)).toEqual({ok:false,errorCode:'TELEGRAM_NOT_CONFIGURED'});
 });
});
