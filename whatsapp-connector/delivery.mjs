// Persist intent before touching WhatsApp. Never retry a send after uncertainty.
export async function deliver(job,{client,persist,now=Date.now,waitAck}) {
 const record={id:job.id,claim:job.claim,group_id:job.group_id,state:'STARTED',message_id:null};
 let chat;
 try {chat=await client.getChatById(job.group_id);}catch {return {...record,state:'FAILED',reason:'GROUP_UNAVAILABLE'};}
 if(!chat?.isGroup||!job.group_id.endsWith('@g.us')||Date.parse(job.expires_at)<=now()) return {...record,state:'FAILED',reason:'GROUP_UNAVAILABLE'};
 await persist(record);
 try {
  const message=await client.sendMessage(job.group_id,job.message,{linkPreview:true,sendSeen:false,waitUntilMsgSent:true});
  record.message_id=message?.id?._serialized??null;
  await persist(record);
  if(record.message_id&&(message.ack>=1||await waitAck(record.message_id))) {
   record.state='SENT';record.reason=null;
  }else {record.state='UNKNOWN';record.reason='CONFIRMATION_TIMEOUT';}
 } catch {record.state='UNKNOWN';record.reason='LOCAL_UNCERTAIN';}
 await persist(record);return record;
}
