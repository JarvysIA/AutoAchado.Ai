import {describe,it,expect} from 'vitest';
import {rankProduct,selectDiverse,commercialProfile,type Observation} from '../src/server/commercial/ranking.js';
import {productIdentity} from '../src/server/commercial/service.js';
import type {ProductPreview} from '../src/server/discovery/product-preview.js';
const now=Date.parse('2026-10-05T12:00:00Z');
const preview:ProductPreview={title:'Mini aspirador portátil',description:'Uso automotivo',image:'https://http2.mlstatic.com/a.jpg',url:'https://www.mercadolivre.com.br/p/MLB123',price:80,currency:'BRL',status:'AVAILABLE',catalog_product_id:'MLB123',comparable:true,seller_trusted:true,seller_id:'1',seller_level:'5_green',priceCheckedAt:new Date(now).toISOString()};
const history=():Observation[]=>Array.from({length:28},(_,i)=>({observed_at:new Date(now-(i+1)*86400000).toISOString(),price:100,currency:'BRL',seller_id:String(i%2+1),comparable:true,trusted:true,position:3}));
describe('commercial gates before scoring',()=>{
 it('never combines days across different ranking dimensions',()=>{
  const rows=history().map(o=>({...o,position:null}));
  const ranks=history().slice(0,12).map((o,i)=>({...o,demand_category:i<6?'MLB1':'MLB2'}));
  expect(rankProduct(preview,[...rows,...ranks],null,now)).toMatchObject({state:'OBSERVING',demand_days:6});
 });
 it('approves independent history, recurring demand and trusted current offer',()=>{
  expect(rankProduct(preview,history(),null,now)).toMatchObject({state:'APPROVED',historical_discount_percent:20,reference_price:100,history_days:28,seller_count:2});
 });
 it('never lets a huge discount replace demand',()=>{
  const rank=rankProduct({...preview,price:1},history().map(o=>({...o,position:null})),null,now);
  expect(rank.state).toBe('OBSERVING');expect(rank.reasons.join()).toContain('Demanda não confirmada');
 });
 it('does not manufacture history from repeated intraday observations',()=>{
  const rows=Array.from({length:100},()=>history()[0]!);
  expect(rankProduct(preview,rows,null,now)).toMatchObject({state:'OBSERVING',history_days:1});
 });
 it('requires multi-seller coverage, even with a long seller history',()=>{
  expect(rankProduct(preview,history().map(o=>({...o,seller_id:'1'})),null,now).state).toBe('OBSERVING');
 });
 it('excludes today, foreign currency, untrusted and incomparable observations',()=>{
  const invalid=history().flatMap(o=>[{...o,comparable:false},{...o,currency:'USD'},{...o,trusted:false},{...o,observed_at:new Date(now).toISOString()}]);
  expect(rankProduct(preview,invalid,null,now)).toMatchObject({state:'OBSERVING',history_days:0});
 });
 it('uses the daily minimum before taking the median and ignores seller original_price',()=>{
  const rows=history().flatMap(o=>[o,{...o,price:1000,seller_id:'3'}]);
  expect(rankProduct({...preview,original_price:9999},rows,null,now).reference_price).toBe(100);
  expect(rankProduct({...preview,price:90.01},rows,null,now).state).toBe('REJECTED');
 });
 it('requires a fresh price and verified seller, and applies audience rejection',()=>{
  expect(rankProduct({...preview,priceCheckedAt:new Date(now-2*86400000).toISOString()},history(),null,now).state).toBe('OBSERVING');
  expect(rankProduct({...preview,seller_trusted:false},history(),null,now).state).toBe('OBSERVING');
  expect(rankProduct(preview,history(),'NOT_RELEVANT',now).state).toBe('REJECTED');
  expect(rankProduct({...preview,title:'Rastreador GPS com mensalidade'},history(),null,now).state).toBe('REJECTED');
 });
 it('deduplicates identities and limits each group to three approved products',()=>{
  const entries=Array.from({length:10},(_,i)=>({identity_key:'p'+Math.floor(i/2),rank:rankProduct(preview,history(),null,now)}));
  expect(selectDiverse(entries)).toHaveLength(3);
  expect(selectDiverse(entries.map(e=>({...e,rank:{...e.rank,state:'OBSERVING' as const}})))).toEqual([]);
 });
 it('merges exact verified catalog identity only, never similar titles',()=>{
  expect(productIdentity('MLB456','ITEM',preview)).toBe(productIdentity('MLB123','PRODUCT',preview));
  expect(productIdentity('MLB456','ITEM',{...preview,comparable:false})).not.toBe(productIdentity('MLB789','ITEM',{...preview,comparable:false}));
  expect(commercialProfile('Rack de teto universal').group).toBe('especializado');
 });
});
