import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, it } from "vitest";
import { handleRequest } from "../src/app.js";
import { createAuthorizationCookie } from "../src/oauth/session.js";
const config = {clientId:"fake",clientSecret:"fake",redirectUri:"https://autoachado-ai.vercel.app/auth/mercadolivre/callback",sessionSecret:"fake-session-secret-for-tests-123456789"};
it("protects the coupon registry and only serves GET without caching", async () => {
 for (const [userId,method,expected] of [[0,"GET",401],[123,"GET",401],[296984475,"POST",405],[296984475,"GET",200]] as const) {
  const cookie = userId ? createAuthorizationCookie({authorized:true,userId,authorizedAt:Date.now()},config.sessionSecret).split(";")[0] : "";
  const captured = {status:0,headers:{} as Record<string,string>,body:""};
  const response = {writeHead(status:number,headers:Record<string,string>){captured.status=status;captured.headers=headers;return this;},end(body:string){captured.body=body;return this;}} as unknown as ServerResponse;
  await handleRequest({url:"/api/affiliate/coupons",method,headers:{cookie}} as IncomingMessage,response,{loadAppConfig:()=>config});
  expect(captured.status).toBe(expected); expect(captured.headers["Cache-Control"]).toBe("no-store");
  if(expected===200) expect(JSON.parse(captured.body)).toEqual({coupons:[]});
 }
});
