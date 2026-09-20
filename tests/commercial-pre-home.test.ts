import {describe,it,expect} from 'vitest';
import {assessAutomotive,possibleVariantKey} from '../src/server/commercial/editorial.js';
import {rankProduct} from '../src/server/commercial/ranking.js';
import {probeHome} from '../src/server/commercial/home-probe.js';
import {reviewAutomotiveCohort} from '../src/server/commercial/cohort-review.js';
import type {SupabaseClient} from '@supabase/supabase-js';
describe('pre-HOME safeguards',()=>{
 it('excludes out-of-scope categories and sends doubtful condition to review',()=>{
  // Óleos, módulos amplificadores e rodas continuam fora, agora pela categoria oficial.
  for(const category of ['MLB194027','MLB3385','MLB4860','MLB440490'])
   expect(assessAutomotive({title:'Produto qualquer',description:null},category).state).toBe('EXCLUDE');
  expect(assessAutomotive({title:'Produto qualquer',description:null},null).state).toBe('EXCLUDE');
  // O único bloqueio por título que sobrou é a condição do item.
  for(const title of ['Compressor usado','Aspirador seminovo','Kit recondicionado','Peça com defeito'])
   expect(assessAutomotive({title,description:null},'MLB63533').state).toBe('REVIEW');
  expect(assessAutomotive({title:'Conversor de carga rápida 65W',description:null},'MLB459471'))
   .toMatchObject({state:'ELIGIBLE',family:'celular_eletronicos'});
  // O título que não casava com nenhuma regex agora entra pela categoria.
  expect(assessAutomotive({title:'Capa de banco',description:null},'MLB46692'))
   .toMatchObject({state:'ELIGIBLE',family:'acessorios_internos'});
 });
 it('does not grant historical approval to an editorially eligible accessory',()=>{
  const p:any={title:'Conversor de carga rápida 65W',price:30,currency:'BRL',description:null};
  const rank=rankProduct(p,[],null,Date.now(),{categoryId:'MLB459471'});
  expect(rank.group).toBe('celular_eletronicos');expect(rank.state).toBe('OBSERVING');expect(rank.historical_discount_percent).toBeNull();
 });
 it('flags matching models without conflating variant histories',()=>{
  const desc='Marca: Electrolux · Linha: Hidrolux · Modelo: AWD01 · Voltagem: ';
  expect(possibleVariantKey(desc+'127 V')).toBe(possibleVariantKey(desc+'220 V'));
  expect(possibleVariantKey('Marca: ABC · Modelo: Universal')).toBeNull();
  // A possible-variant hint is deliberately distinct from catalog identity.
  expect(possibleVariantKey(desc+'127 V')).toBe('electrolux:awd01');
 });
 it('paginates assessments and never qualifies stale previews',async()=>{
  const rows=Array.from({length:501},(_,i)=>({source_key:'PRODUCT:MLB'+i,identity_key:'catalog:'+i,category_id:'MLB63533',preview:{title:'Compressor portátil',
   price:50,currency:'BRL',image:'https://http2.mlstatic.com/p.jpg',url:'https://www.mercadolivre.com.br/p/MLB1',
   seller_trusted:true,comparable:true,priceCheckedAt:'2020-01-01T00:00:00Z'}}));
  const writes:any[]=[];const ranges:number[]=[];
  const client={from:()=>{const q:any={select:()=>q,order:()=>q,range:async(start:number,end:number)=>{
   ranges.push(start);return {data:rows.slice(start,end+1),error:null};},upsert:async(data:any[])=>{writes.push(...data);return {error:null};}};return q;}} as unknown as SupabaseClient;
  expect(await reviewAutomotiveCohort(client)).toEqual({reviewed:501});
  expect(ranges).toEqual([0,500]);expect(writes.every(r=>r.state==='REVIEW'&&r.valid_until===null)).toBe(true);
 });
 it('probes only bounded HOME categories without caller-controlled URLs or activation',async()=>{
  const paths:string[]=[];
  const result=await probeHome(async path=>{paths.push(path);
   if(path==='/categories/MLB1574') return {name:'Casa, Móveis e Decoração',children_categories:[{id:'MLB2',name:'Cozinha'},{id:'MLB3',name:'Móveis'}]};
   if(path==='/categories/MLB2') return {name:'Cozinha',children_categories:[]};
   return {content:[]};
  });
  expect(paths).toEqual(['/categories/MLB1574','/categories/MLB2','/highlights/MLB/category/MLB2']);
  expect(result.activation).toBe(false);expect(result.hundredCandidatesProven).toBe(false);
 });
});
