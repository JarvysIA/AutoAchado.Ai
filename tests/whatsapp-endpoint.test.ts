import {it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
import {handleRequest} from '../src/app.js';
import {createAuthorizationCookie} from '../src/oauth/session.js';
const calls=vi.hoisted(()=>({action:vi.fn(async()=>({ok:true})),auth:vi.fn(async(_c:any,b:any)=>{if(b!=='Bearer test-worker')throw Object.assign(new Error(),{status:401,code:'CONNECTOR_UNAUTHORIZED'});return 'generation';})}));
vi.mock('../src/server/discovery/operational.js',()=>({createOperationalDiscoveryAdapter:()=>({client:{}})}));
vi.mock('../src/server/whatsapp/service.js',()=>({outboxAction:calls.action,workerAuth:calls.auth}));
const config={clientId:'fake',clientSecret:'fake',redirectUri:'https://autoachado-ai.vercel.app/auth/mercadolivre/callback',sessionSecret:'fake-test-session-secret-123456789012345'};
const cookie=()=>createAuthorizationCookie({authorized:true,userId:296984475,authorizedAt:Date.now()},config.sessionSecret).split(';')[0]!;
async function req(action:string,method:string,headers:Record<string,string>={},body='{}'){
 const request=Object.assign(Readable.from([body]),{url:'/api/whatsapp/'+action,method,headers});let status=0;
 await handleRequest(request as any,{writeHead(n:number){status=n;},end(){}} as any,{loadAppConfig:()=>config});return status;
}
it('separates operator session + origin from the scoped worker token',async()=>{
 expect(await req('pair','POST')).toBe(401);
 expect(await req('pair','POST',{cookie:cookie(),origin:'https://evil.test'})).toBe(403);
 expect(await req('pair','GET',{cookie:cookie()})).toBe(405);
 expect(await req('claim','POST',{cookie:cookie()})).toBe(401);
 expect(await req('pair','POST',{authorization:'Bearer test-worker'})).toBe(401);
 expect(await req('claim','POST',{authorization:'Bearer test-worker','content-type':'application/json'})).toBe(200);
 expect(calls.action).toHaveBeenLastCalledWith({},'claim',{},'https://autoachado-ai.vercel.app','generation');
});
it('bounds JSON and only accepts supported authenticated operations',async()=>{
 const headers={cookie:cookie(),origin:'https://autoachado-ai.vercel.app','content-type':'application/json'};
 expect(await req('bind','POST',headers,'x'.repeat(97000))).toBe(413);
 expect(await req('bind','POST',headers,'bad')).toBe(400);
 expect(await req('bind','POST',headers,'null')).toBe(400);
 expect(await req('unknown','POST',headers)).toBe(404);
 expect(await req('approve','POST',headers,'{"id":"test"}')).toBe(200);
});
