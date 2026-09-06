import {describe,it,expect} from 'vitest';
import {dueCategories,categoryRetry} from '../src/server/discovery/coverage.js';
import type {DiscoveryEligibleCategory} from '../src/commerce/discovery/types.js';
const now=Date.parse('2026-09-06T12:00:00Z');
describe('discovery resumption',()=>{
 it('prioritizes untouched work and skips categories in backoff',()=>{
  const categories=['a','b','c'].map(marketplaceCategoryId=>({marketplaceCategoryId}) as DiscoveryEligibleCategory);
  const progress=[{category_id:'a',last_attempt_at:new Date(now-10000).toISOString(),next_attempt_at:new Date(now+10000).toISOString(),failures:1},
   {category_id:'b',last_attempt_at:new Date(now-20000).toISOString(),next_attempt_at:new Date(now-10000).toISOString(),failures:0}];
  expect(dueCategories(categories,progress,now).map(c=>c.marketplaceCategoryId)).toEqual(['c','b']);
 });
 it('backs off absent rankings longer than transient errors',()=>{
  expect(Date.parse(categoryRetry('FAILED',404,1,now))-now).toBe(7*86400000);
  expect(Date.parse(categoryRetry('FAILED',500,1,now))-now).toBe(2*3600000);
 });
});
