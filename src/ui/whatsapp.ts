export const whatsappPanel=`<details id="whatsapp-central" class="panel"><summary>WhatsApp — conexão, grupos e envios</summary>
<p>Envie pelo notebook conectado. Escolha o grupo de cada categoria; o nome “#7” não altera o vínculo.</p>
<p id="wa-status" role="status" aria-live="polite"></p><div class="controls"><button id="wa-refresh">Atualizar conexão e envios</button><button id="wa-pair">Conectar notebook / renovar chave</button></div>
<p>No notebook: baixe a configuração pelo botão acima, abra o conector local e importe o arquivo. Em seguida, escaneie o QR Code em Aparelhos conectados. Renovar a chave desconecta o conector anterior e pausa os destinos.</p>
<div id="wa-destinations"></div><h3>Últimos envios</h3><div id="wa-jobs"></div></details>
<dialog id="wa-preview" style="max-width:600px;width:95%;background:#131d31;color:#e2e8f0;border:1px solid #64748b;border-radius:12px"><h2>Revisar envio</h2><p id="wa-target"></p><pre id="wa-copy" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit"></pre><p>Confirme o destino e a oferta. O envio ocorrerá pelo notebook quando estiver conectado, dentro de 30 minutos.</p><div class="controls"><button id="wa-confirm">Confirmar envio</button><button id="wa-close">Voltar</button></div></dialog>`;
export const whatsappScript=`
let waData=null,waDraft=null,waWatching=false;
const waVerticals=['AUTOMOTIVE','HOME','APPLIANCES','FASHION','BEAUTY','ELECTRONICS','KIDS','GAMES','SPORTS_FITNESS','PET'];
const waLabels={DRAFT:'Aguardando sua confirmação',PENDING:'Na fila',SENDING:'Enviando',SENT:'Enviado ao WhatsApp',UNKNOWN:'Confirmação pendente — confira no grupo; não será reenviado',FAILED:'Não enviado — revise a oferta',CANCELLED:'Cancelado'};
async function waRequest(action,body) {
 const response=await fetch('/api/whatsapp/'+action,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 if(!response.ok) {const messages={AUTHORIZATION_REQUIRED:'Conecte sua conta Mercado Livre para configurar os envios.',DESTINATION_NOT_CONFIGURED:'Abra a Central WhatsApp e configure o grupo desta categoria.',DUPLICATE_SEND:'Este produto já está na fila, enviado ou com confirmação pendente para esse grupo.',OFFER_CHANGED:'A oferta mudou. Atualize os produtos antes de tentar novamente.',PRODUCT_NOT_MONITORED:'Este produto não está na carteira monitorada.',INVALID_AFFILIATE_LINK:'Cole um link oficial de afiliado válido.'};throw new Error(messages[data.errorCode]||'Não foi possível concluir. Atualize a Central WhatsApp e confira a configuração.');}
 return data;
}
async function loadWhatsApp() {
 try {
  waData=await waRequest('status');const c=waData.connector;
  const online=c?.connected&&Date.parse(c.heartbeat_at)>Date.now()-90000;
  el('wa-status').textContent=online?'● Notebook conectado ao WhatsApp':'Notebook desconectado ou aguardando configuração. A fila não será marcada como enviada.';
  el('wa-destinations').replaceChildren();
  for(let i=0;i<waVerticals.length;i++) {
   const current=waData.destinations.find(d=>d.vertical_key===waVerticals[i]);
   const row=textNode('div','','wa-destination'),label=textNode('label',verticalNames[i]+' '),select=document.createElement('select');
   select.className='affiliate-input';select.append(new Option('Escolha o grupo', ''));
   for(const g of c?.groups||[])select.append(new Option(g.name,g.id));
   if(current&&!Array.from(select.options).some(o=>o.value===current.group_id))select.append(new Option(current.group_name+' (fora da última conexão)',current.group_id));
   select.value=current?.group_id||'';label.append(select);row.append(label);
   const active=document.createElement('input');active.type='checkbox';active.checked=!!current?.enabled;
   const enabledLabel=textNode('label',' Habilitar envios ');enabledLabel.prepend(active);row.append(enabledLabel);
   const save=textNode('button','Salvar destino');save.addEventListener('click',async()=>{save.disabled=true;try{await waRequest('bind',{vertical:waVerticals[i],group_id:select.value,enabled:active.checked});await loadWhatsApp();}catch(e){el('wa-status').textContent=e.message;}finally{save.disabled=false;}});row.append(save);el('wa-destinations').append(row);
  }
  el('wa-jobs').replaceChildren();
  for(const job of waData.jobs) {
   const row=textNode('div','','wa-destination');row.append(textNode('strong',job.title),textNode('p',job.group_name+' · '+waLabels[job.state]+' · '+date(job.created_at)));
   if(['DRAFT','PENDING'].includes(job.state)){const cancel=textNode('button','Cancelar');cancel.addEventListener('click',async()=>{try{await waRequest('cancel',{id:job.id});await loadWhatsApp();}catch(e){el('wa-status').textContent=e.message;}});row.append(cancel);}
   el('wa-jobs').append(row);
  }
  if(!waData.jobs.length)el('wa-jobs').append(textNode('p','Nenhum envio solicitado.'));
 }catch(e){el('wa-status').textContent=e.message;}
}
function whatsappSendButton(snapshot,input) {
 const button=textNode('button','📤 Revisar envio para '+verticalNames[selectedVertical],'copy-button');
 button.addEventListener('click',async()=>{
  button.disabled=true;el('copy-status').textContent='Revalidando a oferta e preparando a mensagem…';
  try{waDraft=await waRequest('prepare',{vertical:waVerticals[selectedVertical],id:snapshot.product_id,type:snapshot.type,link:input.value.trim()});el('wa-target').textContent='Destino: '+waDraft.group_name;el('wa-copy').textContent=waDraft.message;el('wa-preview').showModal();el('copy-status').textContent='';}
  catch(e){el('copy-status').textContent=e.message;}finally{button.disabled=false;}
 });return button;
}
if(el('whatsapp-central')) {
 el('wa-refresh').addEventListener('click',loadWhatsApp);
 el('whatsapp-central').addEventListener('toggle',()=>{if(el('whatsapp-central').open)loadWhatsApp();});
 el('wa-pair').addEventListener('click',async()=>{
  if(!confirm('Gerar a configuração do notebook? Isso revoga a chave anterior, cancela a fila pendente e pausa os destinos.'))return;
  try{const config=await waRequest('pair',{}),url=URL.createObjectURL(new Blob([JSON.stringify(config)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cyber-ofertas-conector.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);await loadWhatsApp();el('wa-status').textContent='Configuração baixada. Importe no conector local do notebook. O arquivo contém sua chave privada; não compartilhe.';}catch(e){el('wa-status').textContent=e.message;}
 });
 el('wa-close').addEventListener('click',()=>el('wa-preview').close());
 el('wa-confirm').addEventListener('click',async()=>{
  const button=el('wa-confirm');button.disabled=true;
  try{await waRequest('approve',{id:waDraft.id});waWatching=true;el('wa-preview').close();el('copy-status').textContent='Envio colocado na fila. Será marcado como enviado após a confirmação do WhatsApp.';await loadWhatsApp();}
  catch(e){el('wa-target').textContent=e.message;}finally{button.disabled=false;}
 });
 setInterval(async()=>{
  if(waWatching&&waDraft)try {
   const state=await waRequest('status'),job=state.jobs.find(j=>j.id===waDraft.id);
   if(job&&!['DRAFT','PENDING','SENDING'].includes(job.state)) {waWatching=false;el('copy-status').textContent=waLabels[job.state];if(job.state==='SENT')await loadCommercial();}
  }catch{}
 },15000);
}
`;
