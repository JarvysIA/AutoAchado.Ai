import type {SupabaseClient} from '@supabase/supabase-js';
import {collectionHealth,type CollectionHealth,type VerticalHealth} from './health.js';

// Operational alerting over Telegram. The bot token lives only in process.env and is never
// logged, returned or stored: failures report the HTTP status alone.
export const REMINDER_HOURS=6;
export const DASHBOARD_URL='https://autoachado-ai.vercel.app/';
export const RECONNECT_URL='https://autoachado-ai.vercel.app/auth/start';
export const TEST_MESSAGE='✅ Teste: alertas do Cyber Ofertas funcionando.';
const SEND_TIMEOUT=10000;

export type AlertProblem={key:string;title:string};
export type AlertStateRow={alert_key:string;active:boolean;first_detected_at:string|null;last_notified_at:string|null;resolved_at:string|null;detail:string|null};
export type Planned={problem:AlertProblem;state:AlertStateRow|null};
export type AlertPlan={fresh:Planned[];reminders:Planned[];resolved:AlertStateRow[];silent:Planned[]};

function collectionTitle(v:VerticalHealth):string {
 if(v.state==='NO_RUNS')return 'Coleta do '+v.label+' sem execuções registradas';
 if(v.state==='FAILING')return 'Coleta do '+v.label+' com '+v.consecutiveFailures+' falhas seguidas';
 return v.hoursSinceProductive===null?'Coleta do '+v.label+' parada':'Coleta do '+v.label+' parada há '+v.hoursSinceProductive+'h';
}

export function currentProblems(health:CollectionHealth):AlertProblem[] {
 const problems:AlertProblem[]=[];
 if(health.connection.state!=='OK')problems.push({key:'MELI_AUTH',
  title:health.connection.reason==='NO_RECENT_SUCCESS'&&health.connection.hoursSinceSuccess!==null
   ?'Conexão com o Mercado Livre sem sucesso há '+health.connection.hoursSinceSuccess+'h'
   :'Conexão com o Mercado Livre perdida'});
 for(const v of health.verticals)if(v.state!=='OK')problems.push({key:'COLLECTION:'+v.vertical,title:collectionTitle(v)});
 for(const d of health.discovery)if(d.state!=='OK')problems.push({key:'DISCOVERY:'+d.vertical,
  title:d.hoursSinceDiscovery===null?'Descoberta do '+d.label+' sem registro':'Descoberta do '+d.label+' sem rodar há '+d.hoursSinceDiscovery+'h'});
 return problems;
}

// A problem alerts once, then repeats at most every REMINDER_HOURS so a long outage stays visible
// without turning into a flood.
export function planNotifications(problems:AlertProblem[],states:AlertStateRow[],now:number):AlertPlan {
 const byKey=new Map(states.map(s=>[s.alert_key,s]));
 const plan:AlertPlan={fresh:[],reminders:[],resolved:[],silent:[]};
 for(const problem of problems){
  const state=byKey.get(problem.key)??null;
  if(!state||state.active!==true){plan.fresh.push({problem,state});continue;}
  const since=state.last_notified_at===null?Number.POSITIVE_INFINITY:now-Date.parse(state.last_notified_at);
  if(since>=REMINDER_HOURS*3600000)plan.reminders.push({problem,state});else plan.silent.push({problem,state});
 }
 for(const state of states)if(state.active===true&&!problems.some(p=>p.key===state.alert_key))plan.resolved.push(state);
 return plan;
}

export function composeMessage(plan:AlertPlan):string|null {
 if(!plan.fresh.length&&!plan.reminders.length&&!plan.resolved.length)return null;
 const lines:string[]=[];
 for(const p of plan.fresh)lines.push('🔴 '+p.problem.title);
 for(const p of plan.reminders)lines.push('🟠 '+p.problem.title+' (continua)');
 for(const s of plan.resolved)lines.push('✅ '+(s.detail??s.alert_key)+' — voltou ao normal');
 lines.push('');
 lines.push('Dashboard: '+DASHBOARD_URL);
 if([...plan.fresh,...plan.reminders].some(p=>p.problem.key==='MELI_AUTH'))lines.push('Reconectar Mercado Livre: '+RECONNECT_URL);
 return lines.join('\n');
}

export async function sendTelegram(text:string):Promise<{ok:boolean;reason?:string}> {
 const token=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_CHAT_ID;
 if(!token||!chatId)return {ok:false,reason:'TELEGRAM_NOT_CONFIGURED'};
 try{
  const response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true}),
   signal:AbortSignal.timeout(SEND_TIMEOUT)});
  if(!response.ok){console.error(JSON.stringify({event:'TELEGRAM_SEND_FAILED',status:response.status}));return {ok:false,reason:'TELEGRAM_SEND_FAILED'};}
  return {ok:true};
 }catch{
  // The request URL carries the token, so the caught error is discarded rather than inspected.
  console.error(JSON.stringify({event:'TELEGRAM_SEND_FAILED',status:'TIMEOUT'}));
  return {ok:false,reason:'TELEGRAM_SEND_FAILED'};
 }
}

async function persist(client:SupabaseClient,plan:AlertPlan,now:number) {
 const stamp=new Date(now).toISOString();
 const rows=[
  ...plan.fresh.map(p=>({alert_key:p.problem.key,active:true,first_detected_at:p.state?.first_detected_at??stamp,last_notified_at:stamp,resolved_at:null,detail:p.problem.title})),
  ...plan.reminders.map(p=>({alert_key:p.problem.key,active:true,first_detected_at:p.state?.first_detected_at??stamp,last_notified_at:stamp,resolved_at:null,detail:p.problem.title})),
  ...plan.resolved.map(s=>({alert_key:s.alert_key,active:false,first_detected_at:s.first_detected_at,last_notified_at:s.last_notified_at,resolved_at:stamp,detail:s.detail})),
 ];
 if(!rows.length)return;
 const result=await client.from('operational_alert_state').upsert(rows);
 if(result.error)throw new Error('ALERT_STATE_UNAVAILABLE');
}

export async function evaluateOperationalAlerts(client:SupabaseClient,now=Date.now()) {
 const health=await collectionHealth(client,now);
 const problems=currentProblems(health);
 const stored=await client.from('operational_alert_state').select('alert_key,active,first_detected_at,last_notified_at,resolved_at,detail');
 if(stored.error)throw new Error('ALERT_STATE_UNAVAILABLE');
 const plan=planNotifications(problems,(stored.data??[]) as AlertStateRow[],now);
 const message=composeMessage(plan);
 const summary={checkedAt:health.checkedAt,problems:problems.length,healthy:health.healthy};
 if(message===null)return {...summary,notified:false,reason:'NO_CHANGES'};
 const sent=await sendTelegram(message);
 // State only advances on a confirmed send, so a failed delivery is retried on the next run.
 if(!sent.ok)return {...summary,notified:false,reason:sent.reason};
 await persist(client,plan,now);
 return {...summary,notified:true,sent:plan.fresh.length+plan.reminders.length+plan.resolved.length};
}

export async function sendOperationalAlertTest() {
 const sent=await sendTelegram(TEST_MESSAGE);
 return sent.ok?{ok:true}:{ok:false,errorCode:sent.reason??'TELEGRAM_SEND_FAILED'};
}
