// Executed in the WhatsApp browser. Avoid getChats/getChatModel: they serialize
// messages and refresh participant metadata, which can fail on current WA Web.
export function cachedGroups() {
 const collection=window.require('WAWebCollections').Chat;
 const chats=collection.getModelsArray();
 const groups=[];
 for(const chat of chats) {
  const id=chat.id?._serialized;
  if(typeof id!=='string'||! /^[0-9-]+@g.us$/.test(id))continue;
  let name;
  try{name=chat.formattedTitle;}catch{}
  name=name||chat.name||chat.groupMetadata?.subject;
  if(typeof name!=='string'||!name.trim())continue;
  groups.push({id,name:name.slice(0,200)});
 }
 return groups;
}
export async function readGroups(client){return client.pupPage.evaluate(cachedGroups);}
export function groupDeliveryClient(client){return {
 getChatById:async id=>({isGroup:(await readGroups(client)).some(g=>g.id===id)}),
 sendMessage:(...args)=>client.sendMessage(...args),
};}
