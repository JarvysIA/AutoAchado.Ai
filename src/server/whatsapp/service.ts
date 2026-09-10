import {createHash,randomBytes} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {revalidateProduct} from '../commercial/revalidate.js';
import {productIdentity} from '../commercial/service.js';
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export class OutboxError extends Error {constructor(public status:number,public code:string){super(code);}}
function data<T>(r:{data:T;error:any}):T {if(r.error) throw new OutboxError(r.error.code==='23505'?409:503,r.error.code==='23505'?'DUPLICATE_SEND':'OUTBOX_UNAVAILABLE');return r.data;}
export function affiliateLink(value:unknown):string {
 try {const u=new URL(String(value));if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='meli.la'||u.hostname==='mercadolivre.com.br'||u.hostname.endsWith('.mercadolivre.com.br'))) return u.href;}catch{}
 throw new OutboxError(400,'INVALID_AFFILIATE_LINK');
}
const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
export function offerMessage(p:any,link:string):string {
 const lines=['🔥 ACHADO NO MERCADO LIVRE!','📦 '+p.title];
 if(Number.isFinite(p.original_price)&&p.original_price>p.price) lines.push('~De: '+money(p.original_price)+'~');
 lines.push('💥 Por: '+money(p.price)+(p.has_advertised_discount?' ('+p.discount_percent+'% de desconto anunciado)':''));
 const c=p.matched_coupon;
 if(c&&Date.parse(c.expiresAt)>Date.now()) {
  lines.push('🏷️ Cupom sugerido: *'+c.code+'* ('+c.discountValue+')');
  lines.push('Condições: '+c.restrictions+(c.minPurchase?' · Mínimo '+money(c.minPurchase):'')+(c.maxDiscount?' · Limite '+money(c.maxDiscount):'')+' · Até '+new Date(c.expiresAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}));
  lines.push('Confirme a elegibilidade e o desconto no checkout.');
 }
 if(p.commercial?.state==='APPROVED') lines.push('📉 '+p.commercial.historical_discount_percent+'% abaixo da referência histórica observada de '+money(p.commercial.reference_price)+'.');
 lines.push('🛒 '+affiliateLink(link),'Preço e estoque podem mudar. Confira a oferta e aproveite! 🛒');return lines.join('\n\n');
}
export async function workerAuth(client:SupabaseClient,authorization:string|undefined) {
 const token=authorization?.startsWith('Bearer ')?authorization.slice(7):'';
 if(!/^[a-f0-9]{64}$/.test(token)) throw new OutboxError(401,'CONNECTOR_UNAUTHORIZED');
 const connector=data(await client.from('whatsapp_connector').select('generation').eq('id',1).eq('token_hash',digest(token)).maybeSingle());
 if(!connector) throw new OutboxError(401,'CONNECTOR_UNAUTHORIZED');return connector.generation as string;
}
export async function outboxAction(client:SupabaseClient,action:string,b:any,origin:string,generation?:string) {
 if(action==='status') {
  const connector=data(await client.from('whatsapp_connector').select('connected,heartbeat_at,groups').eq('id',1).maybeSingle());
  return {connector,destinations:data(await client.from('whatsapp_destinations').select('*')),
   jobs:data(await client.from('whatsapp_outbox').select('id,vertical_key,title,group_name,state,created_at,finished_at,failure_code').order('created_at',{ascending:false}).limit(30))};
 }
 if(action==='pair') {
  const token=randomBytes(32).toString('hex');data(await client.rpc('whatsapp_pair',{new_hash:digest(token)}));
  return {baseUrl:origin,token};
 }
 if(action==='bind') {
  if(typeof b.vertical!=='string'||typeof b.group_id!=='string'||typeof b.enabled!=='boolean') throw new OutboxError(400,'INVALID_DESTINATION');
  const c=data(await client.from('whatsapp_connector').select('groups').eq('id',1).single());
  const g=c?.groups.find((g:any)=>g.id===b.group_id);if(!g) throw new OutboxError(400,'UNKNOWN_GROUP');
  data(await client.rpc('whatsapp_bind',{v:b.vertical,g:g.id,n:g.name,e:b.enabled}));return {saved:true};
 }
 if(action==='prepare') {
  if(b.vertical!=='AUTOMOTIVE') throw new OutboxError(400,'VERTICAL_NOT_ACTIVE');
  if(!['ITEM','PRODUCT','USER_PRODUCT'].includes(b.type)||!/^MLBU?\d{1,20}$/.test(b.id??'')) throw new OutboxError(400,'INVALID_PRODUCT');
  const link=affiliateLink(b.link);
  const destination=data(await client.from('whatsapp_destinations').select('*').eq('vertical_key',b.vertical).eq('enabled',true).maybeSingle());
  if(!destination) throw new OutboxError(409,'DESTINATION_NOT_CONFIGURED');
  const c=data(await client.from('whatsapp_connector').select('generation').eq('id',1).single());
  const watch=data(await client.from('commercial_watchlist').select('identity_key,monitor').eq('source_key',b.type+':'+b.id).maybeSingle());
  if(!watch?.monitor) throw new OutboxError(409,'PRODUCT_NOT_MONITORED');
  const fresh=await revalidateProduct(client,b.id,b.type);
  if(!fresh.ready||productIdentity(b.id,b.type,fresh.preview)!==watch.identity_key) throw new OutboxError(409,'OFFER_CHANGED');
  const job=data(await client.from('whatsapp_outbox').insert({generation:c!.generation,vertical_key:b.vertical,identity_key:watch.identity_key,
   product_id:b.id,product_type:b.type,affiliate_url:link,group_id:destination.group_id,group_name:destination.group_name,
   title:fresh.preview.title,message:offerMessage(fresh.preview,link)}).select('id,message,group_name').single());
  return job;
 }
 if(action==='approve'||action==='cancel') {
  if(!/^[a-f0-9-]{36}$/.test(b.id??'')) throw new OutboxError(400,'INVALID_JOB');
  if(action==='approve') data(await client.rpc('whatsapp_approve',{job:b.id}));
  else data(await client.from('whatsapp_outbox').update({state:'CANCELLED'}).eq('id',b.id).in('state',['DRAFT','PENDING']));
  return {saved:true};
 }
 if(!generation) throw new OutboxError(401,'CONNECTOR_UNAUTHORIZED');
 if(action==='heartbeat') {
  if(typeof b.connected!=='boolean'||!Array.isArray(b.groups)||b.groups.length>300) throw new OutboxError(400,'INVALID_HEARTBEAT');
  const groups=b.groups.map((g:any)=>{if(!/^[0-9-]+@g.us$/.test(g.id??'')||typeof g.name!=='string'||g.name.length>200) throw new OutboxError(400,'INVALID_GROUP');return {id:g.id,name:g.name};});
  data(await client.from('whatsapp_connector').update({connected:b.connected,groups,heartbeat_at:new Date().toISOString()}).eq('id',1).eq('generation',generation));return {saved:true};
 }
 if(action==='claim') {
  const job=data(await client.rpc('whatsapp_claim',{gen:generation}))?.[0];if(!job)return {job:null};
  try {
   const fresh=await revalidateProduct(client,job.product_id,job.product_type);
   if(!fresh.ready||productIdentity(job.product_id,job.product_type,fresh.preview)!==job.identity_key||offerMessage(fresh.preview,job.affiliate_url)!==job.message) throw new Error('OFFER_CHANGED');
  } catch {
   data(await client.rpc('whatsapp_finish',{job:job.id,gen:generation,claim:job.claim_token,result:'FAILED',provider_id:null,reason:'OFFER_REQUIRES_REVIEW'}));return {job:null};
  }
  // A token rotation or cancellation during revalidation must not release a job.
  const current=data(await client.from('whatsapp_connector').select('generation').eq('id',1).single());
  if(current?.generation!==generation) return {job:null};
  return {job:{id:job.id,claim:job.claim_token,group_id:job.group_id,message:job.message,expires_at:new Date(Date.now()+60000).toISOString()}};
 }
 if(action==='finish') {
  if(!['SENT','UNKNOWN','FAILED'].includes(b.state)||!['GROUP_UNAVAILABLE','CONFIRMATION_TIMEOUT','LOCAL_UNCERTAIN',null].includes(b.reason??null)
   ||typeof b.id!=='string'||typeof b.claim!=='string'||(b.state==='SENT'&&(typeof b.message_id!=='string'||b.message_id.length>300))) throw new OutboxError(400,'INVALID_RESULT');
  data(await client.rpc('whatsapp_finish',{job:b.id,gen:generation,claim:b.claim,result:b.state,provider_id:b.message_id??null,reason:b.reason??null}));return {saved:true};
 }
 throw new OutboxError(404,'NOT_FOUND');
}
