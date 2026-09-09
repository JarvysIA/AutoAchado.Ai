import {describe,it,expect} from 'vitest';
import {scoreCandidate,simulateSelection,demandPotential,type SelectionCandidate} from '../src/server/commercial/selection-algorithm.js';
import {analyzePriceTruth} from '../src/server/commercial/price-truth.js';
import type {Observation} from '../src/server/commercial/ranking.js';
const DAY=86400000,now=Date.parse('2026-11-20T12:00:00Z');
function candidate(id:string,title='Mini aspirador portátil'):SelectionCandidate {
 return {source_key:'PRODUCT:'+id,identity_key:id,monitor:false,protected:false,
  preview:{title,description:null,image:'https://http2.mlstatic.com/a.jpg',url:'https://www.mercadolivre.com.br/p/MLB1',
   price:80,currency:'BRL',seller_id:'1',seller_trusted:true,comparable:true,status:'CATALOG',priceCheckedAt:new Date(now).toISOString()},
  ranks:Array.from({length:10},(_,i)=>({category:'cat1',position:3,observed_at:new Date(now-i*DAY).toISOString()}))};
}
function prices(start:string,count:number,price:number):Observation[] {
 return Array.from({length:count},(_,i)=>({observed_at:new Date(Date.parse(start)+i*DAY).toISOString(),price,currency:'BRL',seller_id:String(i%2+1),comparable:true,trusted:true,position:null}));
}
describe('selection hypothesis independent of discount',()=>{
 it('never increases commercial potential because a seller adds a large crossed-out price',()=>{
  const a=candidate('a'),b={...a,preview:{...a.preview!,original_price:999999}};
  expect(scoreCandidate(a,now).score).toBe(scoreCandidate(b,now).score);
 });
 it('does not invent independent demand days from duplicate observations or different categories',()=>{
  const ranks=candidate('a').ranks;
  expect(demandPotential(Array(100).fill(ranks[0]),now).days).toBe(1);
  expect(demandPotential(ranks.slice(0,6).map((r,i)=>({...r,category:i<3?'one':'two'})),now).days).toBe(3);
  expect(demandPotential([{...ranks[0]!,observed_at:new Date(now+DAY).toISOString()}],now).days).toBe(0);
 });
 it('prefers recurring demand over a single first place and ignores unseen conversion numbers',()=>{
  const a=candidate('a'),b=candidate('b');b.ranks=[{...b.ranks[0]!,position:1}];
  expect(scoreCandidate(a,now).score).toBeGreaterThan(scoreCandidate(b,now).score);
  expect(scoreCandidate(b,now).eligible).toBe(false);
 });
 it('requires fresh complete data and does not admit unsuitable products',()=>{
  const c=candidate('a');
  for(const patch of [{image:null},{seller_trusted:false},{priceCheckedAt:new Date(now-2*DAY).toISOString()},{title:'Rastreador com mensalidade'}])
   expect(scoreCandidate({...c,preview:{...c.preview!,...patch}},now).eligible).toBe(false);
 });
 it('uses a trend bonus only with several independent days',()=>{
  const signals=Array.from({length:6},(_,i)=>({category:'one',position:12-i*2,observed_at:new Date(now-(6-i)*DAY).toISOString()}));
  expect(demandPotential(signals,now).improvement).toBeGreaterThan(0);
  expect(demandPotential(signals.slice(0,3),now).improvement).toBe(0);
 });
 it('keeps family ceilings, canonical deduplication and protected incumbents without filling weak slots',()=>{
  const entries=Array.from({length:30},(_,i)=>candidate('a'+i));const p=candidate('protected','Rastreador GPS');p.monitor=true;p.protected=true;
  const r=simulateSelection([...entries,{...entries[0]!,source_key:'ITEM:other'},p],now,100,25);
  expect(r.selectedCount).toBe(26);expect(r.unfilled).toBe(74);expect(r.protectedRetained).toBe(1);
  expect(r.selected.some(c=>c.identity_key==='protected')).toBe(true);expect(r.applied).toBe(false);
 });
 it('does not propose churn without seven demand days, tenure and a meaningful advantage',()=>{
  const old=candidate('old');old.monitor=true;old.ranks=[];
  const next=candidate('new');
  expect(simulateSelection([old,next],now,1).proposedReplacements).toEqual([]);
  old.monitor_since=new Date(now-8*DAY).toISOString();
  expect(simulateSelection([old,next],now,1).proposedReplacements).toHaveLength(1);
 });
 it('aggregates sources only within the exact verified identity',()=>{
  const a=candidate('same'),b={...candidate('same'),source_key:'ITEM:two'};a.ranks=a.ranks.slice(0,5);b.ranks=b.ranks.slice(5);
  expect(simulateSelection([a,b],now).evaluated[0]!.demand.days).toBe(10);
  expect(simulateSelection([a,{...b,identity_key:'different'}],now).evaluated[0]!.demand.days).toBe(5);
 });
});
describe('price truth and pre-campaign reference',()=>{
 it('prevents October price inflation from inflating the November reference',()=>{
  const history=[...prices('2026-09-01T12:00:00Z',30,100),...prices('2026-10-22T12:00:00Z',28,200)];
  const p={...candidate('a').preview!,price:99,original_price:199};
  expect(analyzePriceTruth(p,history,now)).toMatchObject({reference_price:100,historical_discount_percent:1,state:'ANNOUNCED_NOT_CONFIRMED',historical_discount_confirmed:false});
 });
 it('does not call a promotion false when history or current price is insufficient',()=>{
  const p={...candidate('a').preview!,original_price:999};
  expect(analyzePriceTruth(p,[],now).state).toBe('INSUFFICIENT_HISTORY');
  expect(analyzePriceTruth({...p,priceCheckedAt:'2020-01-01'},[],now).state).toBe('CURRENT_PRICE_UNVERIFIED');
 });
 it('does not let later prices change the fixed September window',()=>{
  const a=prices('2026-09-01T12:00:00Z',30,100),b=prices('2026-10-01T12:00:00Z',30,500);
  expect(analyzePriceTruth(candidate('a').preview!,a,now).campaign).toEqual(analyzePriceTruth(candidate('a').preview!,[...a,...b],now).campaign);
 });
 it('requires independent days and sellers and ignores foreign or incomparable prices',()=>{
  const p=candidate('a').preview!,valid=prices('2026-09-01T12:00:00Z',30,100);
  for(const rows of [valid.map(o=>({...o,seller_id:'one'})),valid.map(o=>({...o,currency:'USD'})),valid.map(o=>({...o,comparable:false})),Array(100).fill(valid[0])])
   expect(analyzePriceTruth(p,rows,now).state).toBe('INSUFFICIENT_HISTORY');
  expect(analyzePriceTruth(p,valid,now)).toMatchObject({state:'HISTORICAL_DISCOUNT',historical_discount_percent:20});
 });
});
