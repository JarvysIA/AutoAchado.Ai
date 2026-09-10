import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliver} from './delivery.mjs';
const job={id:'job',claim:'claim',group_id:'123@g.us',message:'offer',expires_at:'2099-01-01'};
function fixture(send){const events=[];return {events,client:{getChatById:async()=>({isGroup:true}),sendMessage:async()=>{events.push('send');return send();}},persist:async record=>events.push(record.state),waitAck:async()=>false};}
test('persists intent before send and requires server acknowledgement',async()=>{
 const f=fixture(()=>({id:{_serialized:'provider'},ack:1}));
 assert.equal((await deliver(job,f)).state,'SENT');assert.deepEqual(f.events,['STARTED','send','STARTED','SENT']);
});
test('uncertain send is never retried or marked sent',async()=>{
 const f=fixture(()=>{throw Error('network');});assert.equal((await deliver(job,f)).state,'UNKNOWN');assert.equal(f.events.filter(e=>e==='send').length,1);
 const missing=fixture(()=>({id:{_serialized:'provider'},ack:0}));assert.equal((await deliver(job,missing)).state,'UNKNOWN');
});
test('rejects expired jobs and non-group destinations before any send',async()=>{
 const f=fixture(()=>{throw Error();});assert.equal((await deliver({...job,expires_at:'2000-01-01'},f)).state,'FAILED');
 assert.equal((await deliver({...job,group_id:'123@c.us'},f)).state,'FAILED');assert.deepEqual(f.events,[]);
});
test('failed durable write prevents a send',async()=>{
 const f=fixture(()=>({}));f.persist=async()=>{throw Error('disk full');};await assert.rejects(deliver(job,f));assert.deepEqual(f.events,[]);
});
