import type { IncomingMessage, ServerResponse } from 'node:http';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {handleRequest} from '../src/app.js';
import {createAuthorizationCookie} from '../src/oauth/session.js';
const calls=vi.hoisted(()=>({collect:vi.fn(async()=>({status:'COMPLETED',collected:2,failed:0})),feedback:vi.fn(async()=>({saved:true})),list:vi.fn(async()=>({entries:[]}))}));
vi.mock('../src/server/discovery/operational.js',()=>({createOperationalDiscoveryAdapter:()=>({client:{}})}));
vi.mock('../src/server/commercial/service.js',()=>({collectCommercialEvidence:calls.collect,commercialOpportunities:calls.list,saveCommercialFeedback:calls.feedback}));
const config={clientId:'fake',clientSecret:'fake',redirectUri:'https://autoachado-ai.vercel.app/auth/mercadolivre/callback',sessionSecret:'fake-test-session-secret-123456789012345'};
async function request(path:string,method='GET',headers:Record<string,string>={}) {
 const result={status:0,body:''};
 const response={writeHead(status:number){result.status=status;return this;},end(body:string){result.body=body;return this;}} as unknown as ServerResponse;
 await handleRequest({url:path,method,headers} as IncomingMessage,response,{loadAppConfig:()=>config});return result;
}
const cookie=()=>createAuthorizationCookie({authorized:true,userId:296984475,authorizedAt:Date.now()},config.sessionSecret).split(';')[0]!;
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('commercial endpoint boundaries',()=>{
 it('requires a configured cron secret, even for a user with a valid session',async()=>{
  vi.stubEnv('CRON_SECRET','');
  expect((await request('/api/commercial/cron','GET',{authorization:'Bearer undefined',cookie:cookie()})).status).toBe(401);
  vi.stubEnv('CRON_SECRET','test-only');
  expect((await request('/api/commercial/cron','GET',{authorization:'Bearer wrong'})).status).toBe(401);
  expect(calls.collect).not.toHaveBeenCalled();
  expect((await request('/api/commercial/cron','GET',{authorization:'Bearer test-only'})).status).toBe(200);
  expect(calls.collect).toHaveBeenCalledTimes(1);
 });
 it('protects collection and feedback against unauthenticated or cross-origin writes',async()=>{
  expect((await request('/api/commercial/collect','POST')).status).toBe(401);
  expect((await request('/api/commercial/collect','POST',{cookie:cookie(),origin:'https://evil.test'})).status).toBe(403);
  expect((await request('/api/commercial/feedback?id=MLB123&type=ITEM&action=SHARED','POST',{cookie:cookie()})).status).toBe(403);
  expect(calls.collect).not.toHaveBeenCalled();expect(calls.feedback).not.toHaveBeenCalled();
 });
 it('validates feedback, pagination and methods before running services',async()=>{
  const headers={cookie:cookie(),origin:'https://autoachado-ai.vercel.app'};
  expect((await request('/api/commercial/feedback?id=bad&type=ITEM&action=SHARED','POST',headers)).status).toBe(400);
  expect((await request('/api/commercial/opportunities?offset=-1','GET',headers)).status).toBe(400);
  expect((await request('/api/commercial/collect','GET',headers)).status).toBe(405);
  expect((await request('/api/commercial/feedback?id=MLB123&type=ITEM&action=INTERESTED','POST',headers)).status).toBe(200);
  expect(calls.feedback).toHaveBeenCalledWith({},'MLB123','ITEM','INTERESTED');
 });
});
