import {it,expect} from 'vitest';
import {diverseHomeOrder} from '../src/server/commercial/home-diversity.js';
const entry=(id:string,key:string,score:number,state='OBSERVING')=>({identity_key:id,selection:{diversity_key:key,score},rank:{state}});
it('interleaves similar quality products without promoting observing products over approved offers',()=>{
 const input=[entry('m1','mop',90),entry('m2','mop',89),entry('m3','mop',88),entry('p1','panela',85),entry('a1','outro',50,'APPROVED')];
 const output=diverseHomeOrder(input);
 expect(output.map(x=>x.identity_key)).toEqual(['a1','m1','p1','m2','m3']);
 expect(input[0]!.identity_key).toBe('m1');
 expect(new Set(output.map(x=>x.identity_key)).size).toBe(input.length);
});
it('keeps a substantially better candidate ahead despite a repeated type',()=>{
 expect(diverseHomeOrder([entry('a','mop',95),entry('b','mop',94),entry('c','outro',40)]).map(x=>x.identity_key)).toEqual(['a','b','c']);
});
