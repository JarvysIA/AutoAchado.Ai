import {it,expect} from 'vitest';
import {inspectHomePilot} from '../src/server/commercial/home-pilot.js';
import {HOME_CATEGORIES,HOME_PILOT} from '../src/server/commercial/home-config.js';
it('reserves a separate 100-slot design and rejects categories outside HOME before ranking',async()=>{
 const paths:string[]=[];
 const result=await inspectHomePilot(async path=>{paths.push(path);return {id:path.split('/').at(-1),path_from_root:[{id:'MLB5672'}]};});
 expect(HOME_PILOT.capacity).toBe(100);
 expect(new Set(HOME_CATEGORIES.map(c=>c.id)).size).toBe(HOME_CATEGORIES.length);
 expect(paths.every(p=>p.startsWith('/categories/'))).toBe(true);
 expect(result.activation).toBe(false);expect(result.hundredCandidatesProven).toBe(false);
});
it('honors the deadline without claiming monitoring or mature history',async()=>{
 const result=await inspectHomePilot(async()=>{throw Error('must not call');},0);
 expect(result.products).toEqual([]);expect(result.historyMature).toBe(false);expect(result.deadlineReached).toBe(true);
});
