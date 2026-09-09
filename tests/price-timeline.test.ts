import {it,expect} from 'vitest';
import {priceTimeline} from '../src/server/commercial/price-timeline.js';
import type {Observation} from '../src/server/commercial/ranking.js';
import type {ProductPreview} from '../src/server/discovery/product-preview.js';
const now=Date.parse('2026-09-09T15:00:00Z');
const preview={price:17,currency:'BRL',seller_id:'one',seller_trusted:true,comparable:true,status:'AVAILABLE',priceCheckedAt:new Date(now).toISOString()} as ProductPreview;
const observation=(date:string,price:number):Observation=>({observed_at:date,price,currency:'BRL',seller_id:'one',trusted:true,comparable:true,position:null});
it('uses one daily minimum then monthly median, excluding unverifiable/future prices',()=>{
 const result=priceTimeline(preview,[observation('2026-07-01',20),observation('2026-07-01T18:00:00Z',18),observation('2026-07-02',22),
  {...observation('2026-07-03',1),trusted:false},observation('2026-09-10',1)],now);
 expect(result.months).toEqual([{month:'2026-07',days:2,typical:20,minimum:18}]);
 expect(result.lowest_observed).toBe(true);expect(result.complete_90_days).toBe(false);
});
it('requires all 90 prior days and a fresh price before claiming the period minimum',()=>{
 const today=Date.parse('2026-09-09');
 const history=Array.from({length:90},(_,i)=>observation(new Date(today-(i+1)*86400000).toISOString(),20));
 expect(priceTimeline(preview,history,now).complete_90_days).toBe(true);
 expect(priceTimeline(preview,history.slice(1),now).complete_90_days).toBe(false);
 expect(priceTimeline({...preview,priceCheckedAt:'2026-09-07'},history,now).lowest_observed).toBe(false);
 expect(priceTimeline({...preview,price:21},history,now).lowest_observed).toBe(false);
 expect(priceTimeline(preview,[],now).lowest_observed).toBe(false);
});
