import type { IncomingMessage, ServerResponse } from 'node:http';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {assessVertical,collectionHealth,safeErrorCode} from '../src/server/commercial/health.js';
import {handleRequest} from '../src/app.js';
import {createAuthorizationCookie} from '../src/oauth/session.js';
import {dashboardPage} from '../src/ui/dashboard.js';

const home=vi.hoisted(()=>({run:vi.fn(async():Promise<unknown>=>({status:'COMPLETED'}))}));
vi.mock('../src/server/commercial/home-service.js',()=>({runHome:home.run,homeOpportunities:vi.fn(),homeAction:vi.fn()}));
const tables=vi.hoisted(()=>({data:{} as Record<string,any[]>}));
vi.mock('../src/server/discovery/operational.js',()=>({createOperationalDiscoveryAdapter:()=>({client:fakeClient(tables.data)})}));

function fakeClient(data:Record<string,any[]>):any {
 return {from(table:string){const chain:any={select:()=>chain,order:()=>chain,limit:async()=>({data:data[table]??[],error:null}),then:(resolve:any)=>resolve({data:data[table]??[],error:null})};return chain;}};
}
const NOW=Date.parse('2026-09-18T15:00:00Z');
const hoursAgo=(h:number)=>new Date(NOW-h*3600000).toISOString();
const V={key:'HOME',label:'Casa'};
const config={clientId:'fake',clientSecret:'fake',redirectUri:'https://autoachado-ai.vercel.app/auth/mercadolivre/callback',sessionSecret:'fake-test-session-secret-123456789012345'};
async function request(path:string,headers:Record<string,string>={}) {
 const result={status:0,body:''};
 const response={writeHead(status:number){result.status=status;return this;},end(body:string){result.body=body;return this;}} as unknown as ServerResponse;
 await handleRequest({url:path,method:'GET',headers} as IncomingMessage,response,{loadAppConfig:()=>config});return result;
}
const cookie=()=>createAuthorizationCookie({authorized:true,userId:296984475,authorizedAt:Date.now()},config.sessionSecret).split(';')[0]!;
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.clearAllMocks();});

describe('collection health assessment',()=>{
 it('is OK when a recent run collected products',()=>{
  expect(assessVertical(V,[{started_at:hoursAgo(1),status:'COMPLETED',collected:0},{started_at:hoursAgo(2),status:'COMPLETED',collected:12}],NOW)).toMatchObject({state:'OK',hoursSinceProductive:2,consecutiveFailures:0});
 });
 it('flags a failure streak like the 14-18/09 outage even before the stall threshold',()=>{
  const rows=[0,1,2].map(h=>({started_at:hoursAgo(h),status:'FAILED',collected:0})).concat({started_at:hoursAgo(3),status:'COMPLETED',collected:20});
  expect(assessVertical(V,rows,NOW)).toMatchObject({state:'FAILING',consecutiveFailures:3,hoursSinceProductive:3});
 });
 it('flags runs that complete but collect nothing for hours (the Automotive symptom)',()=>{
  const rows=Array.from({length:10},(_,h)=>({started_at:hoursAgo(h),status:h%2?'PARTIAL':'COMPLETED',collected:0}));
  expect(assessVertical(V,rows,NOW)).toMatchObject({state:'STALLED',hoursSinceProductive:null});
 });
 it('reports missing runs separately',()=>{
  expect(assessVertical(V,[],NOW).state).toBe('NO_RUNS');
 });
 it('only checks enabled verticals with a ready executor',async()=>{
  const result=await collectionHealth(fakeClient({
   commercial_verticals:[{vertical_key:'AUTOMOTIVE',enabled:true,executor_ready:true},{vertical_key:'HOME',enabled:true,executor_ready:true},{vertical_key:'APPLIANCES',enabled:true,executor_ready:false}],
   commercial_collection_runs:[{started_at:hoursAgo(1),status:'PARTIAL',collected:5}],
   home_runs:[{started_at:hoursAgo(0),status:'FAILED',collected:0},{started_at:hoursAgo(1),status:'FAILED',collected:0},{started_at:hoursAgo(2),status:'FAILED',collected:0}],
  }),NOW);
  expect(result.verticals.map(v=>v.vertical)).toEqual(['AUTOMOTIVE','HOME']);
  expect(result.healthy).toBe(false);
 });
 it('never lets free text become a logged code',()=>{
  expect(safeErrorCode(new Error('PREVIEW_AUTH_UNAVAILABLE'))).toBe('PREVIEW_AUTH_UNAVAILABLE');
  expect(safeErrorCode(new Error('token abc123 leaked'))).toBe('UNCLASSIFIED');
  expect(safeErrorCode('HOME_DISABLED')).toBe('UNCLASSIFIED');
 });
});

describe('health endpoint and failure logging',()=>{
 it('requires the operator session',async()=>{
  expect((await request('/api/commercial/health')).status).toBe(401);
 });
 it('returns health to the operator',async()=>{
  tables.data={commercial_verticals:[{vertical_key:'AUTOMOTIVE',enabled:true,executor_ready:true}],commercial_collection_runs:[]};
  const result=await request('/api/commercial/health',{cookie:cookie()});
  expect(result.status).toBe(200);
  expect(JSON.parse(result.body).verticals[0]).toMatchObject({vertical:'AUTOMOTIVE',state:'NO_RUNS'});
 });
 it('logs the sanitized cause of a failed run and names auth failures',async()=>{
  vi.stubEnv('CRON_SECRET','test-only');
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  home.run.mockRejectedValueOnce(new Error('PREVIEW_AUTH_UNAVAILABLE'));
  const result=await request('/api/commercial/home-run?kind=HISTORY',{authorization:'Bearer test-only'});
  expect(result.status).toBe(503);
  expect(JSON.parse(result.body).errorCode).toBe('MELI_AUTH_UNAVAILABLE');
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({event:'COMMERCIAL_OPERATION_FAILED',path:'/api/commercial/home-run',vertical:null,kind:'HISTORY',code:'PREVIEW_AUTH_UNAVAILABLE'});
 });
});

describe('dashboard health alert',()=>{
 it('shows the stalled verticals with a reconnect link, as text only',async()=>{
  const elements=new Map<string,any>();
  const node=()=>({textContent:'',hidden:true,children:[] as any[],href:'',append(...c:any[]){this.children.push(...c);},replaceChildren(...c:any[]){this.children=c;},addEventListener(){},setAttribute(){},focus(){},scrollIntoView(){},querySelector(){return null;}});
  const html=dashboardPage({authorized:true,userId:'296984475'});
  expect(html).toContain('id="health-alert"');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
  const healthScript=script.slice(0,script.indexOf('setInterval(loadHealth'));
  elements.set('health-alert',node());
  const {Script,createContext}=await import('node:vm');
  const context=createContext({document:{getElementById:(id:string)=>elements.get(id),createElement:node},
   fetch:async()=>({ok:true,json:async()=>({verticals:[{label:'Casa',state:'FAILING',hoursSinceProductive:96,consecutiveFailures:90},{label:'Automotivo',state:'OK'}]})})});
  new Script(healthScript).runInContext(context);
  await new Promise(resolve=>setImmediate(resolve));
  const box=elements.get('health-alert');
  expect(box.hidden).toBe(false);
  expect(box.children[1].textContent).toBe('Casa: sem coletar há 96h (90 falhas seguidas)');
  expect(box.children[2].children[1].href).toBe('/auth/start');
 });
});
