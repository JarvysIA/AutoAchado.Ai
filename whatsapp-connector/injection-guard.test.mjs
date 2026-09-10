import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guardInjection} from './injection-guard.mjs';
test('recovers a navigation failure without rejecting the browser event',async()=>{
 let calls=0,failures=0;
 const client={inject:async()=>{if(++calls===1)throw Error('Execution context was destroyed, most likely because of a navigation.');return 'ready';}};
 guardInjection(client,{onFailure:()=>failures++,delay:async()=>{}});
 assert.equal(await client.inject(),'ready');assert.equal(calls,2);assert.equal(failures,0);
});
test('bounds retries and requests recovery without an unhandled rejection',async()=>{
 let calls=0,failures=0;
 const client={inject:async()=>{calls++;throw Error('Execution context was destroyed');}};
 guardInjection(client,{onFailure:()=>failures++,delay:async()=>{}});
 await Promise.all([client.inject(),client.inject()]);assert.equal(calls,3);assert.equal(failures,1);
});
test('does not retry unrelated failures blindly',async()=>{
 let calls=0,failures=0;const client={inject:async()=>{calls++;throw Error('unsupported client');}};
 guardInjection(client,{onFailure:()=>failures++});await client.inject();assert.equal(calls,1);assert.equal(failures,1);
});
