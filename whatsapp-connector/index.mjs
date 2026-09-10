import {createServer} from 'node:http';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import WWebJS from 'whatsapp-web.js';
import QRCode from 'qrcode';
import {deliver} from './delivery.mjs';
import {guardInjection} from './injection-guard.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),stateDir=path.join(root,'.state');
await mkdir(stateDir,{recursive:true});
const configFile=path.join(stateDir,'config.json'),journalFile=path.join(stateDir,'journal.json');
async function readJson(file,fallback){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function atomic(file,value){await writeFile(file+'.tmp',JSON.stringify(value),{mode:0o600});await rename(file+'.tmp',file);}
let config=await readJson(configFile,null),journal=await readJson(journalFile,{}),client,connected=false,qr=null,status='Importe a configuração baixada da Central WhatsApp.',busy=false,initializing=false;
const acked=new Set();
let recoveryTimer=null,recovering=false,recoveryAttempts=0;
function recover(){
 connected=false;qr=null;
 if(recoveryTimer||recovering)return;
 if(recoveryAttempts>=3){status='A reconexão automática não foi suficiente. Use Reconectar WhatsApp abaixo.';return;}
 status='WhatsApp recarregou. Recuperando a conexão; os envios estão pausados.';
 recoveryTimer=setTimeout(async()=>{
  recoveryTimer=null;
  if(busy||initializing){recover();return;}
  recovering=true;recoveryAttempts++;
  const old=client;client=undefined;
  try{old?.removeAllListeners();await old?.destroy();}catch{}
  finally{recovering=false;void start();}
 },5000);
}
process.on('unhandledRejection',()=>{console.error('CONNECTOR_ASYNC_FAILURE: reconnect requested');recover();});
const base='http://127.0.0.1:3210';
function validConfig(c){return c&&c.baseUrl==='https://autoachado-ai.vercel.app'&&/^[a-f0-9]{64}$/.test(c.token);}
if(config&&!validConfig(config))throw new Error('Configuração local inválida.');
async function api(action,body){
 const r=await fetch(config.baseUrl+'/api/whatsapp/'+action,{method:'POST',headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 if(!r.ok)throw new Error(r.status===401?'CONNECTOR_REVOKED':'API_UNAVAILABLE');return r.json();
}
async function persist(record){journal[record.id]=record;await atomic(journalFile,journal);}
async function report(record){await api('finish',{id:record.id,claim:record.claim,state:record.state,message_id:record.message_id,reason:record.reason??null});}
async function waitAck(id){
 for(let i=0;i<30;i++) {if(acked.has(id))return true;await new Promise(r=>setTimeout(r,1000));}
 return false;
}
async function reconcile(){
 for(const record of Object.values(journal)) {
  if(record.state==='STARTED'){record.state='UNKNOWN';record.reason='LOCAL_UNCERTAIN';await persist(record);}
  if(record.state==='UNKNOWN'&&record.message_id) {
   let message;try{message=await client.getMessageById(record.message_id);}catch{}
   if(acked.has(record.message_id)||message?.ack>=1){record.state='SENT';record.reason=null;await persist(record);}
  }
  if(record.reported!==record.state) {await report(record);record.reported=record.state;await persist(record);}
 }
}
async function tick(){
 if(busy||!config||!client||recovering||recoveryTimer)return;busy=true;
 try {
  const chats=connected?await client.getChats():[];
  const groups=chats.filter(c=>c.isGroup).slice(0,300).map(c=>({id:c.id._serialized,name:c.name.slice(0,200)}));
  await api('heartbeat',{connected,groups});
  if(!connected)return;
  await reconcile();
  const result=await api('claim',{});
  if(result.job){
   if(journal[result.job.id]){status='Envio já registrado localmente; revisão necessária.';return;}
   status='Processando envio confirmado no app…';
   // Do not race a timeout with another send. A hung client leaves the queue locked;
   // the server marks it UNKNOWN rather than giving the same work to another process.
   const record=await deliver(result.job,{client,persist,waitAck});
   await persist(record);await report(record);record.reported=record.state;await persist(record);
   status=record.state==='SENT'?'Envio confirmado pelo servidor do WhatsApp.':'Envio não confirmado. Confira a Central.';
  }else status='Conectado. Aguardando envios confirmados na dashboard.';
 }catch(e){status=e.message==='CONNECTOR_REVOKED'?'Chave revogada. Importe uma nova configuração e reinicie o conector.':'Sem comunicação. Os envios não serão repetidos automaticamente.';}
 finally{busy=false;}
}
async function start(){
 if(!config||initializing||client)return;initializing=true;status='Iniciando WhatsApp Web…';
 const executablePath=process.env.WHATSAPP_CHROME_PATH;
 client=new WWebJS.Client({authStrategy:new WWebJS.LocalAuth({dataPath:path.join(stateDir,'session')}),
  webVersionCache:{type:'local',path:path.join(stateDir,'web-cache')},deviceName:'Cyber Ofertas Notebook',
  puppeteer:{headless:true,...(executablePath?{executablePath}:{})}});
 guardInjection(client,{onRetry:()=>{status='WhatsApp recarregando. Aguarde a atualização da conexão.';},onFailure:()=>recover()});
 client.on('qr',async value=>{qr=await QRCode.toDataURL(value);connected=false;status='Escaneie o QR Code em WhatsApp → Aparelhos conectados.';});
 client.on('ready',()=>{connected=true;qr=null;recoveryAttempts=0;status='WhatsApp conectado.';void tick();});
 client.on('disconnected',()=>recover());
 client.on('auth_failure',()=>{connected=false;status='Falha na conexão. Reinicie e escaneie novamente.';});
 client.on('message_ack',(message,ack)=>{if(ack>=1&&message.id?._serialized)acked.add(message.id._serialized);});
 try{await client.initialize();}catch{recover();}finally{initializing=false;}
}
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cyber Ofertas — Conector do notebook</title>
<style>body{font:17px system-ui;background:#0e1728;color:#e2e8f0;max-width:650px;padding:30px;margin:auto}button,input{font:inherit;margin:12px 0}img{max-width:320px;width:100%;background:white}p{line-height:1.6}</style>
<h1>WhatsApp do Cyber Ofertas</h1><p id="status" role="status"></p><button id="reconnect">Reconectar WhatsApp</button><img id="qr" hidden alt="QR Code para conectar o WhatsApp"><details id="setup"><summary>Importar ou trocar configuração</summary><p>Na dashboard, baixe a configuração somente se precisar trocar a chave.</p><input id="file" type="file" accept="application/json"><button id="import">Importar configuração</button></details><p>No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho.</p><p>Depois, escolha os grupos na dashboard. Somente as mensagens que você confirmar serão enviadas. Mantenha o notebook ligado e acordado.</p>
<script>async function refresh(){try{const r=await fetch('/status');if(!r.ok)throw Error();const s=await r.json();document.getElementById('status').textContent=s.status;const img=document.getElementById('qr');img.hidden=!s.qr;if(s.qr)img.src=s.qr;}catch{document.getElementById('status').textContent='Conector local indisponível. Abra Iniciar WhatsApp no notebook e aguarde.';document.getElementById('qr').hidden=true;}}document.getElementById('import').onclick=async()=>{try{const f=document.getElementById('file').files[0];if(!f)return;const response=await fetch('/configure',{method:'POST',headers:{'Content-Type':'application/json','X-Cyber-Setup':'1'},body:await f.text()});if(!response.ok)throw Error();await refresh();}catch{document.getElementById('status').textContent='Configuração inválida ou conector já iniciado. Reinicie para trocar a configuração.';}};document.getElementById('reconnect').onclick=async()=>{await fetch('/reconnect',{method:'POST',headers:{'X-Cyber-Setup':'1'}});refresh();};refresh();setInterval(refresh,2500);</script></html>`;
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
 if(req.headers.host!=='127.0.0.1:3210'){res.writeHead(403);res.end();return;}
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(req.method==='GET'&&req.url==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status,qr,configured:!!config}));return;}
 if(req.method==='POST'&&req.url==='/reconnect'&&req.headers.origin===base&&req.headers['x-cyber-setup']==='1') {
  recoveryAttempts=0;recover();res.end('{}');return;
 }
 if(req.method==='POST'&&req.url==='/configure'&&req.headers.origin===base&&req.headers['x-cyber-setup']==='1') {
  try{if(busy||initializing)throw Error();let text='';for await(const c of req){text+=c;if(text.length>4096)throw Error();}const next=JSON.parse(text);if(!validConfig(next))throw Error();if(recoveryTimer){clearTimeout(recoveryTimer);recoveryTimer=null;}recoveryAttempts=0;client?.removeAllListeners();await client?.destroy();client=undefined;connected=false;qr=null;await atomic(configFile,next);if(config?.token!==next.token){await atomic(path.join(stateDir,'journal-previous.json'),journal);journal={};await atomic(journalFile,journal);}config=next;res.end('{}');void start();return;}catch{res.writeHead(400);res.end('{}');return;}
 }
 res.writeHead(404);res.end();
});
server.listen(3210,'127.0.0.1',()=>{console.log('Conector local: '+base);void start();});
setInterval(()=>void tick(),15000);
process.on('SIGINT',async()=>{await client?.destroy();server.close();process.exit();});
