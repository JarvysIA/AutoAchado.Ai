import {describe,it,expect} from 'vitest';
import {nextEvidenceCheck,validEvidenceAt} from '../src/server/commercial/collection-policy.js';
import type {ProductPreview} from '../src/server/discovery/product-preview.js';
const now=Date.parse('2026-09-07T12:00:00Z');
const preview={price:50,currency:'BRL',comparable:true,seller_trusted:true,status:'CATALOG',priceCheckedAt:new Date(now).toISOString()} as ProductPreview;
describe('daily evidence scheduling',()=>{
 it('only counts fresh, comparable, trusted prices as successful coverage',()=>{
  expect(validEvidenceAt(preview,now)).toBe(preview.priceCheckedAt);
  for(const change of [{price:null},{price:NaN},{price:0},{currency:'USD'},{comparable:false},{seller_trusted:false},
   {status:'UNAVAILABLE'},{priceCheckedAt:new Date(now-3600000).toISOString()},{priceCheckedAt:new Date(now+3600000).toISOString()}])
   expect(validEvidenceAt({...preview,...change} as ProductPreview,now)).toBeNull();
 });
 it('revisits successful products after 12 hours and backs failures off without starving others',()=>{
  expect(Date.parse(nextEvidenceCheck(true,0,now))-now).toBe(12*3600000);
  expect(Date.parse(nextEvidenceCheck(false,1,now))-now).toBe(30*60000);
  expect(Date.parse(nextEvidenceCheck(false,2,now))-now).toBe(60*60000);
  expect(Date.parse(nextEvidenceCheck(false,100,now))-now).toBe(6*3600000);
 });
});
