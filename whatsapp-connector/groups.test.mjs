import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cachedGroups,groupDeliveryClient} from './groups.mjs';
test('reads only group identifiers and titles without serializing chats',()=>{
 const chats=[{id:{_serialized:'123@g.us'},formattedTitle:'Automotivo',serialize(){throw Error('must not read messages');}},
 {id:{_serialized:'456@g.us'},get formattedTitle(){throw Error('getter');},groupMetadata:{subject:'Casa'}},
 {id:{_serialized:'789@c.us'},name:'Personal'}, {id:{_serialized:'111@newsletter'},name:'Channel'}];
 global.window={require:()=>({Chat:{getModelsArray:()=>chats}})};
 try{assert.deepEqual(cachedGroups(),[{id:'123@g.us',name:'Automotivo'},{id:'456@g.us',name:'Casa'}]);}finally{delete global.window;}
});
test('delivery validates the exact cached group before sending',async()=>{
 const adapter=groupDeliveryClient({pupPage:{evaluate:async()=>[{id:'123@g.us',name:'Test'}]},sendMessage:()=>{throw Error('not called');}});
 assert.equal((await adapter.getChatById('123@g.us')).isGroup,true);
 assert.equal((await adapter.getChatById('456@g.us')).isGroup,false);
});
