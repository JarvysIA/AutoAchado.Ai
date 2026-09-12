import {whatsappPanel,whatsappScript} from './whatsapp.js';
export interface DashboardProps {
  authorized: boolean;
  userId?: string | undefined;
}

export function dashboardPage(props: DashboardProps): string {
  const connected = props.authorized && props.userId === "296984475";
  const verticals = [
    ["Automotivo", "MLB5672"], ["Casa, utilidades e organização", "MLB1574"],
    ["Eletrodomésticos", "MLB5726"], ["Moda", "MLB1430"], ["Beleza e cuidado pessoal", "MLB1246"],
    ["Eletrônicos, celulares e acessórios", "MLB1051"], ["Infantil — bebês, brinquedos e moda infantil", "MLB1132"],
    ["Games", "MLB1144"], ["Esportes e fitness", "MLB1276"], ["Pet", "MLB1071"],
  ];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="AutoAchado.AI — Dashboard Operacional, mineração automotiva e snapshots persistidos no Supabase.">
<title>AutoAchado.AI — Dashboard Operacional</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#090d16;color:#e2e8f0;font:15px system-ui,sans-serif}header{padding:24px max(24px,calc((100% - 1200px)/2));background:#111827;border-bottom:1px solid #25324a;display:flex;gap:20px;align-items:center;justify-content:space-between}h1{margin:0;font-size:24px}h2{font-size:19px;margin-top:0}p,small{color:#9bacc4}main{max-width:1250px;margin:auto;padding:28px 24px}.stats,.matrix{display:grid;gap:16px;grid-template-columns:repeat(4,minmax(0,1fr))}.matrix{grid-template-columns:repeat(2,minmax(0,1fr));padding:0;list-style:none}.card,.panel,.matrix li{border:1px solid #25324a;border-radius:12px;background:#131d31;padding:20px}.card strong{display:block;font-size:24px;margin:12px 0}.panel{margin-top:24px}.matrix li{background:#0e1728;padding:14px}.matrix span{display:block;color:#9bacc4;margin-top:6px}.badge{color:#6ee7b7}.controls{display:flex;flex-wrap:wrap;gap:12px}button,a{color:#93c5fd}button{border:1px solid #3b82f6;background:#1d4ed8;color:white;border-radius:8px;padding:12px 16px;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:wait}button:focus-visible,a:focus-visible{outline:3px solid #fcd34d;outline-offset:3px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:14px 10px;border-bottom:1px solid #25324a}th{color:#9bacc4;font-size:12px;text-transform:uppercase}#message{min-height:24px}@media(max-width:850px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.stats,.matrix{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}.card strong{font-size:22px}}
.results{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}.product-card{background:#0e1728;border:1px solid #25324a;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}.product-photo{height:200px;background:#fff;display:flex;align-items:center;justify-content:center;color:#64748b}.product-photo img{height:100%;width:100%;object-fit:contain}.product-body{padding:16px;display:flex;flex-direction:column;gap:10px;flex:1}.product-body h3{font-size:16px;margin:0;line-height:1.4}.product-body p{margin:0;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.product-price{font-size:23px;color:#6ee7b7}.product-link{display:block;background:#1d4ed8;color:white;padding:12px;border-radius:8px;text-align:center;text-decoration:none;margin-top:auto}.product-meta{font-size:11px;color:#9bacc4;overflow-wrap:anywhere}#more{margin-top:20px}#more[hidden]{display:none}.affiliate-input{width:100%;padding:10px;background:#131d31;color:#e2e8f0;border:1px solid #64748b;border-radius:6px}.coupon-bar{display:flex;gap:10px;overflow:auto;padding:12px 0}.copy-button{background:#065f46}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.filters [aria-pressed="true"]{background:#065f46;border-color:#6ee7b7}#manual-copy{width:100%;min-height:160px}#manual-copy[hidden]{display:none}.matrix li{padding:0}.vertical-button{width:100%;height:100%;text-align:left;padding:16px;background:transparent;border-color:transparent}.vertical-button:hover{background:#1a2942}.vertical-button[aria-pressed="true"]{border-color:#60a5fa;background:#172b49}#vertical-products{scroll-margin-top:20px}.product-details,.price-history{border-top:1px solid #25324a;padding-top:12px;margin-top:4px}.product-details summary,.price-history summary{cursor:pointer;color:#bcd0e8;font-size:13px;line-height:1.5}.product-details[open] summary,.price-history[open] summary{margin-bottom:12px}.product-details>.product-body{padding:12px 0 0}.product-details>span{display:block;margin-top:8px}.product-actions{display:grid;gap:8px}.product-actions button{background:transparent;border-color:#41516a;font-size:13px}.history-table{font-size:11px;font-variant-numeric:tabular-nums}.history-table th,.history-table td{padding:10px 3px;white-space:nowrap}.history-table th{font-size:10px;text-transform:none}.history-table caption{text-align:left;color:#9bacc4;font-size:11px;margin:10px 0}.price-history p{font-size:11px;margin-top:10px}.product-link{margin-top:0}.product-card{align-self:start}.product-body del{color:#9bacc4;font-size:14px}summary:focus-visible{outline:2px solid #fcd34d;outline-offset:3px}@media(max-width:520px){main{padding:20px 14px}.results{grid-template-columns:minmax(0,1fr)}.product-photo{height:240px}}
.wa-destination{display:grid;gap:10px;margin:12px 0;padding:12px;border:1px solid #25324a;border-radius:8px}dialog::backdrop{background:#000b}
</style></head><body><header><div><h1>AutoAchado.AI</h1><p>Dashboard Operacional · Robô de mineração · MLB / Brasil · 0B3D-C</p></div><div class="badge">${connected ? "● Mercado Livre conectado" : "⚠ Mercado Livre não conectado"}<br><small>ID: 296984475</small> · <a href="/auth/start">Conectar conta</a></div></header>
<main><section class="stats" aria-label="Indicadores">
<div class="card">Status do Robô<strong>Operacional ✅</strong><small>Automotivo V1</small></div>
<div class="card">Verticais Planejadas<strong>10 Verticais</strong><small>Automotivo V1 Ativa com 155 categorias: 28 Tier A + 127 Tier B</small></div>
<div class="card">Oportunidades no Banco<strong id="count">—</strong><small>Registros em public.highlight_snapshots</small></div>
<div class="card">Última Sincronização<strong id="synced">—</strong><small>Atualização automática a cada 30 segundos</small></div></section>
<section class="panel"><h2>Matriz de Expansão (10 Verticais Estratégicas)</h2><ol class="matrix">${verticals.map(([name,id],i)=>`<li><button id="vertical-${i}" class="vertical-button" aria-controls="vertical-products" aria-pressed="${i===0}">${i+1}. ${name}<span>${id} · ${i===0 ? "ATIVO (155 Cats)" : "PLANEJADO"}</span></button></li>`).join("")}</ol></section>
<section class="panel" id="vertical-products"><h2 id="vertical-title" tabindex="-1">Automotivo — produtos e ofertas</h2><p>Melhores oportunidades primeiro. Monitorados reúne a carteira da categoria; Prontos para divulgar mostra ofertas com histórico e demanda confirmados, ainda não divulgadas.</p><div class="controls filters"><button id="rank-ALL" aria-pressed="true">Monitorados</button><button id="rank-APPROVED" aria-pressed="false">🔥 Prontos para divulgar</button><button id="rank-SENT" aria-pressed="false">✅ Divulgados</button><button id="refresh">🔄 Atualizar</button></div><p id="message" role="status" aria-live="polite"></p><p id="commercial-status" role="status" aria-live="polite"></p><p id="copy-status" role="status" aria-live="polite"></p><textarea id="manual-copy" hidden readonly aria-label="Texto para copiar manualmente"></textarea><p>Para copiar a divulgação, cole no produto o link criado pelo gerador oficial de afiliados.</p><p id="commercial-summary"></p><div id="commercial-results" class="results"></div><button id="commercial-more" hidden>Mostrar mais desta seleção</button></section>${whatsappPanel}<details id="robot-admin" class="panel"><summary>Administração do robô</summary><p>Ferramentas técnicas de coleta e diagnóstico — Automotivo.</p><div class="controls"><button id="sweep">🚀 Executar varredura</button><button id="smoke">⚡ Teste de coleta (2 categorias)</button><button id="collect-evidence">📊 Coletar evidências agora</button></div><p id="admin-summary"></p><details id="raw-products" class="panel"><summary>Explorar todos os registros minerados (sem aprovação comercial)</summary><section><h2>Produtos encontrados</h2><p>Prévia dos destaques minerados: foto, descrição e preço informado pelo Mercado Livre. Preço e disponibilidade podem mudar; os destaques ainda não representam descontos validados.</p><h2>Central de Cupons Ativos</h2><div id="coupons" class="coupon-bar" aria-live="polite">Consultando campanhas verificadas…</div><p>Cupons sugeridos conforme categoria e valor. Confira as restrições e a aplicação no checkout. Para divulgar com comissão, cole em cada produto o link criado no gerador oficial de afiliados do Mercado Livre. Os links ficam salvos somente neste navegador.</p><div class="filters" aria-label="Filtrar produtos"><button id="filter-all" aria-pressed="true">Todas as ofertas completas</button><button id="filter-discount" aria-pressed="false">🔥 Desconto anunciado ≥ 5%</button><button id="filter-tier" aria-pressed="false">⚡ Prioridade Tier A</button><button id="filter-coupon" aria-pressed="false">🏷️ Cupom sugerido</button><button id="filter-incomplete" aria-pressed="false">Registros incompletos</button></div><p id="results-summary"></p><div id="snapshots" class="results" aria-label="Produtos minerados"></div><button id="more" hidden>Mostrar mais produtos</button></section></details></details></main>
<script>
const el = id => document.getElementById(id);
let busy = false;
const verticalNames = ["Automotivo","Casa, utilidades e organização","Eletrodomésticos","Moda","Beleza e cuidado pessoal","Eletrônicos, celulares e acessórios","Infantil — bebês, brinquedos e moda infantil","Games","Esportes e fitness","Pet"];
let selectedVertical = 0;
let commercialView = 'ALL', commercialOffset = 0, commercialRevision = 0, collecting = false;
function updateVerticalControls() {
  const inactive=selectedVertical!==0;
  el('raw-products').hidden=inactive;
  for(const id of ['collect-evidence','rank-ALL','rank-APPROVED','rank-SENT']) el(id).disabled=inactive||busy||(id==='collect-evidence'&&collecting);
}
for(let index=0;index<verticalNames.length;index++) el('vertical-'+index).addEventListener('click',async()=>{
  selectedVertical=index;
  commercialRevision++;
  commercialOffset=0;
  commercialView='ALL';
  for(let other=0;other<verticalNames.length;other++) el('vertical-'+other).setAttribute('aria-pressed',String(other===index));
  for(const view of ['ALL','APPROVED','SENT']) el('rank-'+view).setAttribute('aria-pressed',String(view===commercialView));
  el('vertical-title').textContent=verticalNames[index]+' — produtos e ofertas';
  el('commercial-results').replaceChildren();
  el('commercial-summary').textContent='';
  el('commercial-status').textContent='';
  el('copy-status').textContent='';
  el('manual-copy').hidden=true;
  el('commercial-more').hidden=true;
  updateVerticalControls();
  el('vertical-products').scrollIntoView({behavior:'smooth',block:'start'});
  el('vertical-title').focus({preventScroll:true});
  await loadCommercial();
});
async function loadCommercial(append = false) {
  if(selectedVertical!==0) {
    commercialRevision++;
    el('commercial-results').replaceChildren(textNode('p','A coleta de '+verticalNames[selectedVertical]+' ainda não foi ativada. Os produtos aparecerão aqui após a ativação e a avaliação dos candidatos.'));
    el('commercial-summary').textContent='Vertical planejada · 100 vagas reservadas para monitoramento.';
    el('commercial-more').hidden=true;
    return;
  }
  const version=++commercialRevision, view=commercialView, offset=append?commercialOffset:0;
  try {
    const data=await request('/api/commercial/opportunities?view='+view+'&offset='+offset);
    if(version!==commercialRevision) return;
    el('commercial-status').textContent='';
    if(!append) el('commercial-results').replaceChildren();
    commercialOffset=offset+data.entries.length;
    el('commercial-more').hidden=!data.hasMore;
    el('commercial-summary').textContent=data.counts.monitored+' de '+data.capacity+' produtos monitorados · '+data.counts.approved+' prontos para divulgar · '+data.counts.sent+' divulgados.';
    el('admin-summary').textContent='';
    if(data.monitoringHealth) el('admin-summary').textContent=' Preço comparável nas últimas 24h: '+data.monitoringHealth.fresh+'/'+data.monitoringHealth.monitored+' · Histórico suficiente: '+data.matureHistory+' · Aguardando nova tentativa: '+data.monitoringHealth.retrying+'.';
    el('admin-summary').textContent+=(data.lastCollection?'Última coleta: '+date(data.lastCollection.started_at)+' · '+data.lastCollection.status+' · '+data.lastCollection.collected+' consultados.':'');
    for(const entry of data.entries) {
      const card=textNode('article','','product-card');
      entry.preview.commercial=entry.rank;
      fillCard(card,entry.snapshot,entry.preview,entry.price_timeline);
      const extra=card.querySelector('.product-details');
      const body=textNode('div','','product-body');
      const selection=entry.selection, priceEvidence=entry.price_analysis;
      if(selection) {
        body.append(textNode('strong','Potencial de acompanhamento: '+selection.score+'/100','badge'));
        body.append(textNode('p',selection.demand.days+' dias no mesmo ranking · posição mediana '+(selection.demand.median_position??'indisponível')+'.'));
        body.append(textNode('p','Avaliado em '+date(selection.assessed_at)+'. '+(selection.eligible?'Atende aos critérios de seleção.':'Mantido em acompanhamento; ainda há critérios pendentes.')));
        for(const reason of selection.reasons||[]) body.append(textNode('p',reason,'product-meta'));
        body.append(textNode('p','Demanda '+selection.components.demand+'/50 · utilidade '+selection.components.utility+'/20 · facilidade '+selection.components.ease+'/15 · vendedor '+selection.components.seller+'/10 · faixa de preço '+selection.components.ticket+'/5.','product-meta'));
        body.append(textNode('p','Potencial não é garantia de venda. Desconto anunciado não aumenta esta nota.','product-meta'));
      } else body.append(textNode('p','Potencial: aguardando a próxima avaliação automática.'));
      if(priceEvidence) {
        body.append(textNode('strong',priceEvidence.historical_discount_confirmed?'Desconto histórico confirmado: '+priceEvidence.historical_discount_percent+'%':'Desconto histórico ainda não confirmado'));
        body.append(textNode('p','Últimos 30 dias: '+priceEvidence.rolling.days+' dias observados · '+priceEvidence.rolling.sellers+' vendedores.'));
        if(priceEvidence.reference_price!==null) body.append(textNode('p','Referência histórica: '+money(priceEvidence.reference_price)));
        if(priceEvidence.campaign) body.append(textNode('p','Referência de setembro: '+priceEvidence.campaign.days+' dias · '+(priceEvidence.campaign.sufficient?'cobertura suficiente':'cobertura insuficiente')+'.'));
        if(priceEvidence.state==='ANNOUNCED_NOT_CONFIRMED') body.append(textNode('p','O percentual anunciado supera o desconto sustentado pelo histórico.'));
        if(priceEvidence.state==='CURRENT_PRICE_UNVERIFIED') body.append(textNode('p','O preço atual precisa de nova validação.'));
      }
      body.append(textNode('strong',(entry.rank.state==='APPROVED'?'✅ Aprovada':entry.rank.state==='OBSERVING'?'⏳ Em observação':'Não aprovada')+' · Pontuação '+entry.rank.score+'/100','badge'));
      body.append(textNode('p',entry.rank.history_days+' dias de preços comparáveis · '+entry.rank.seller_count+' vendedores · '+entry.rank.demand_days+' dias entre mais vendidos.'));
      if(entry.rank.historical_discount_percent!==null) body.append(textNode('p',entry.rank.historical_discount_percent+'% de desconto histórico · Referência '+money(entry.rank.reference_price)));
      for(const reason of entry.rank.reasons) body.append(textNode('p','• '+reason));
      for(const reason of entry.rank.evidence) body.append(textNode('p',reason,'product-meta'));
      const feedback=textNode('div','','controls');
      for(const [action,label] of [['INTERESTED','Interessante'],['NOT_RELEVANT','Não serve para meu público'],['RESET','Limpar avaliação']]) {
        const button=textNode('button',(entry.feedback===action?'✓ ':'')+label);
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try {await request('/api/commercial/feedback?id='+encodeURIComponent(entry.snapshot.product_id)+'&type='+encodeURIComponent(entry.snapshot.type)+'&action='+action,'POST');await loadCommercial();}
          catch(error){el('commercial-status').textContent=error.message;} finally{button.disabled=false;}
        });feedback.append(button);
      }
      const actions=textNode('div','','product-actions');
      if(entry.sent_at) actions.append(textNode('p','✅ Divulgado · '+date(entry.sent_at),'badge'));
      const sentButton=textNode('button',entry.sent_at?'Desfazer divulgação':'✅ Marcar como divulgado');
      sentButton.addEventListener('click',async()=>{
        sentButton.disabled=true;
        try {
          await request('/api/commercial/sent?id='+encodeURIComponent(entry.snapshot.product_id)+'&type='+encodeURIComponent(entry.snapshot.type)+'&sent='+String(!entry.sent_at),'POST');
          await loadCommercial();
        } catch(error) {el('commercial-status').textContent=error.message;}
        finally {sentButton.disabled=false;}
      });
      actions.append(sentButton);body.append(feedback);extra.append(body);card.querySelector('.product-body').append(actions);el('commercial-results').append(card);
    }
    if(!data.total) el('commercial-results').append(textNode('p',view==='APPROVED'?'Ainda não há ofertas com todas as evidências exigidas. Consulte Monitorados para acompanhar o histórico. Ofertas divulgadas ficam em Divulgados.':'Nenhum produto nesta seleção.'));
  } catch(error) {if(version!==commercialRevision) return;el('commercial-status').textContent=error.message;}
}
for(const view of ['ALL','APPROVED','SENT']) el('rank-'+view).addEventListener('click',()=>{
  commercialView=view;
  for(const other of ['ALL','APPROVED','SENT']) el('rank-'+other).setAttribute('aria-pressed',String(view===other));
  loadCommercial();
});
el('commercial-more').addEventListener('click',()=>loadCommercial(true));
el('collect-evidence').addEventListener('click',async()=>{
  if(collecting || selectedVertical!==0) return; collecting=true;el('collect-evidence').disabled=true;
  el('commercial-status').textContent='Coletando preços e demanda. O lote pode levar alguns minutos; as evidências ficam salvas no banco.';
  try {const result=await request('/api/commercial/collect','POST');el('commercial-status').textContent='Coleta: '+result.status+' · '+result.collected+' consultados · '+result.failed+' falhas. Coleta concluída não significa oferta aprovada.';await loadCommercial();}
  catch(error){el('commercial-status').textContent=error.message;}finally{collecting=false;updateVerticalControls();}
});
el('raw-products').addEventListener('toggle',()=>{if(el('raw-products').open && !visible && !loading) showMore();});
const date = value => new Date(value).toLocaleString('pt-BR');
async function request(path, method = 'GET') {
  const response = await fetch(path, { method, cache: 'no-store', credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? 'Conecte a conta Mercado Livre 296984475 para acessar os dados.' : 'Falha na operação. Verifique a configuração do servidor e tente novamente.');
  return data;
}
let snapshots = [], visible = 0, revision = 0, signature = '';
const previewCache = new Map();
let loaded = [], filter = 'all', loading = false;
const money = (value, currency = 'BRL') => new Intl.NumberFormat('pt-BR', {style:'currency',currency}).format(value);
function complete(snapshot, preview) {
  return typeof preview.title === 'string' && preview.title.trim() && preview.title !== snapshot.product_id
    && !/^MLBU?[0-9]+$/.test(preview.title.trim()) && safeUrl(preview.image, true)
    && Number.isFinite(preview.price) && preview.price > 0 && /^[A-Z]{3}$/.test(preview.currency || '')
    && safeUrl(preview.url, false) && preview.status !== 'UNAVAILABLE';
}
function affiliateUrl(value) {
  try { const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (safeUrl(value, false) || url.hostname === 'meli.la') ? url.href : null;
  } catch { return null; }
}
function storedLink(key) { try { return localStorage.getItem('autoachado:affiliate:' + key) || ''; } catch { return ''; } }
async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const previous = button.textContent; button.textContent = 'Copiado! ✅';
    setTimeout(() => { button.textContent = previous; }, 2000);
    el('manual-copy').hidden = true; el('copy-status').textContent = 'Texto copiado para a área de transferência.';
  } catch {
    el('manual-copy').value = text; el('manual-copy').hidden = false;
    el('manual-copy').focus(); el('manual-copy').select();
    el('copy-status').textContent = 'A cópia automática não está disponível. Copie o texto selecionado abaixo.';
  }
}
function productCopy(snapshot, preview, link) {
  if (!complete(snapshot, preview) || !affiliateUrl(link)) return null;
  const lines = ['🔥 ACHADO NO MERCADO LIVRE!', '📦 ' + preview.title];
  if (Number.isFinite(preview.original_price) && preview.original_price > preview.price) lines.push('~De: ' + money(preview.original_price, preview.currency) + '~');
  lines.push('💥 Por: ' + money(preview.price, preview.currency) + (preview.has_advertised_discount ? ' (' + preview.discount_percent + '% de desconto anunciado)' : ''));
  const coupon = preview.matched_coupon;
  if (coupon && Date.parse(coupon.expiresAt) > Date.now()) {
    lines.push('🏷️ Cupom sugerido: *' + coupon.code + '* (' + coupon.discountValue + ')');
    lines.push('Condições: ' + coupon.restrictions + (coupon.minPurchase ? ' · Mínimo ' + money(coupon.minPurchase) : '') + (coupon.maxDiscount ? ' · Limite ' + money(coupon.maxDiscount) : '') + ' · Até ' + date(coupon.expiresAt));
    lines.push('Confirme a elegibilidade e o desconto no checkout.');
  }
  if (preview.commercial?.state === 'APPROVED') lines.push('📉 ' + preview.commercial.historical_discount_percent + '% abaixo da referência histórica observada de ' + money(preview.commercial.reference_price) + '.');
  lines.push('🛒 ' + affiliateUrl(link), 'Preço e estoque podem mudar. Confira a oferta e aproveite! 🛒');
  return lines.join('\\n\\n');
}
function renderResults() {
  el('snapshots').replaceChildren();
  let shown = 0;
  for (const entry of loaded) {
    const {snapshot, preview} = entry, ready = complete(snapshot, preview);
    const include = filter === 'incomplete' ? !ready : ready && (filter === 'all'
      || filter === 'discount' && preview.has_advertised_discount
      || filter === 'tier' && snapshot.priority_tier === 'A'
      || filter === 'coupon' && preview.matched_coupon && Date.parse(preview.matched_coupon.expiresAt) > Date.now());
    if (!include) continue;
    const card = textNode('article', '', 'product-card'); fillCard(card, snapshot, preview); el('snapshots').append(card); shown++;
  }
  const readyCount = loaded.filter(e => complete(e.snapshot,e.preview)).length;
  el('results-summary').textContent = loaded.length + ' de ' + snapshots.length + ' produtos consultados · ' + readyCount + ' completos · ' + (loaded.length - readyCount) + ' incompletos · ' + shown + ' neste filtro' + (loading ? ' · Consultando…' : '');
  if (!shown) el('snapshots').append(textNode('p', loading ? 'Consultando prévias…' : 'Nenhum produto neste filtro entre as prévias consultadas. Use Mostrar mais produtos para consultar os restantes.'));
  el('more').hidden = visible >= snapshots.length; el('more').disabled = loading;
}
for (const name of ['all','discount','tier','coupon','incomplete']) el('filter-' + name).addEventListener('click', () => {
  filter = name;
  for (const other of ['all','discount','tier','coupon','incomplete']) el('filter-' + other).setAttribute('aria-pressed', String(other === name));
  renderResults();
});
async function loadCoupons() {
  try {
    const data = await request('/api/affiliate/coupons'); el('coupons').replaceChildren();
    const active = data.coupons.filter(c => Date.parse(c.expiresAt) > Date.now());
    for (const coupon of active) {
      const chip = textNode('button', coupon.code + ' · ' + coupon.discountValue);
      chip.title = coupon.description + ' · ' + coupon.restrictions + (coupon.minPurchase ? ' · Mínimo ' + money(coupon.minPurchase) : '') + (coupon.maxDiscount ? ' · Limite ' + money(coupon.maxDiscount) : '') + ' · Até ' + date(coupon.expiresAt);
      chip.addEventListener('click', () => copyText(coupon.code, chip)); el('coupons').append(chip);
    }
    if (!active.length) el('coupons').append(textNode('p', 'Nenhum cupom verificado e vigente cadastrado.'));
  } catch { el('coupons').textContent = 'Não foi possível consultar os cupons. Tente atualizar os dados.'; }
}
function textNode(tag, text, className) {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
}
function safeUrl(value, image) {
  try {
    const url = new URL(value);
    const domain = image ? 'mlstatic.com' : 'mercadolivre.com.br';
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname === domain || url.hostname.endsWith('.' + domain)) ? url.href : null;
  } catch { return null; }
}
function historyPanel(timeline) {
  const panel=textNode('details','','price-history');
  const shortDate=value=>new Date(value+'T12:00:00Z').toLocaleDateString('pt-BR');
  let summary='📉 Histórico de preços · em formação';
  if(timeline.lowest_observed) summary=timeline.complete_90_days?'📉 Menor preço observado em 90 dias':'📉 Menor preço observado desde '+shortDate(timeline.first_day);
  panel.append(textNode('summary',summary));
  if(!timeline.months.length) {panel.append(textNode('p','Ainda não há preços comparáveis verificados para este produto.'));return panel;}
  const table=textNode('table','','history-table');
  table.append(textNode('caption','Preços observados em R$ · últimos 90 dias'));
  const head=textNode('thead',''),row=textNode('tr','');
  for(const label of ['Mês / dias','Típico','Menor']) {const cell=textNode('th',label);cell.scope='col';row.append(cell);}head.append(row);table.append(head);
  const rows=textNode('tbody','');
  for(const month of timeline.months) {
    const tr=textNode('tr','');
    const label=new Date(month.month+'-15T12:00:00Z').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
    for(const value of [label+' · '+month.days+'d',money(month.typical),money(month.minimum)]) tr.append(textNode('td',value));rows.append(tr);
  }
  table.append(rows);panel.append(table);
  panel.append(textNode('p','Típico = mediana dos menores preços diários. Meses podem estar incompletos. '+timeline.days+' dias observados; dias sem coleta não são estimados.'));
  panel.append(textNode('p','Mesmo produto, entre vendedores verificados, sem frete ou cupons. Menor preço observado não comprova sozinho desconto relevante.'));
  if(!timeline.current_verified) panel.append(textNode('p','Preço atual aguardando nova verificação.'));
  return panel;
}
function fillCard(card, snapshot, preview, timeline) {
  card.replaceChildren();
  const photo = textNode('div', 'Imagem indisponível', 'product-photo');
  const imageUrl = safeUrl(preview.image, true);
  if (imageUrl) {
    const img = document.createElement('img'); img.src = imageUrl; img.alt = preview.title || snapshot.product_id;
    img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { photo.replaceChildren(textNode('span', 'Imagem indisponível')); });
    photo.replaceChildren(img);
  }
  const body = textNode('div', '', 'product-body');
  body.append(textNode('h3', preview.title || snapshot.product_id));
  const details=textNode('details','','product-details');
  details.append(textNode('summary','Mais informações'));
  details.append(textNode('p', preview.description || 'Descrição não disponibilizada pela API.'));
  let price = 'Consultar preço no Mercado Livre';
  if (typeof preview.price === 'number' && Number.isFinite(preview.price)) {
    try { price = new Intl.NumberFormat('pt-BR', {style:'currency',currency:preview.currency || 'BRL'}).format(preview.price); } catch { /* Keep fallback. */ }
  }
  if (Number.isFinite(preview.original_price) && preview.original_price > preview.price) body.append(textNode('del', money(preview.original_price, preview.currency)));
  body.append(textNode('strong', price, 'product-price'));
  if (preview.has_advertised_discount) details.append(textNode('strong', '-' + preview.discount_percent + '% · Desconto anunciado', 'badge'));
  if (preview.matched_coupon && Date.parse(preview.matched_coupon.expiresAt) > Date.now()) details.append(textNode('p', '🏷️ Cupom sugerido: ' + preview.matched_coupon.code + ' · Confira as condições no checkout.'));
  if (preview.priceSource) details.append(textNode('span', (preview.priceSource === 'CATALOG_OFFER' ? 'Preço da oferta de catálogo' : 'Preço informado pelo anúncio') + (preview.priceCheckedAt ? ' · Consultado em ' + date(preview.priceCheckedAt) : ''), 'product-meta'));
  details.append(textNode('span', snapshot.product_id + ' · ' + snapshot.type + ' · Tier ' + (snapshot.priority_tier || '—') + ' · Posição ' + (snapshot.position || '—'), 'product-meta'));
  details.append(textNode('span', 'Coletado em ' + date(snapshot.observed_at), 'product-meta'));
  if(timeline) body.append(historyPanel(timeline));
  const publicUrl = snapshot.type === 'PRODUCT' && /^MLB[0-9]+$/.test(snapshot.product_id)
    ? 'https://www.mercadolivre.com.br/p/' + snapshot.product_id
    : snapshot.type === 'USER_PRODUCT' && /^MLBU[0-9]+$/.test(snapshot.product_id)
      ? 'https://www.mercadolivre.com.br/up/' + snapshot.product_id
      : snapshot.type === 'ITEM' && /^MLB[0-9]+$/.test(snapshot.product_id)
        ? 'https://produto.mercadolivre.com.br/MLB-' + snapshot.product_id.slice(3) + '-_JM' : null;
  const href = safeUrl(preview.url, false) || publicUrl;
  if (href) {
    const link = textNode('a', (preview.status === 'CATALOG' || !preview.url) ? 'Abrir produto e ofertas ↗' : 'Abrir anúncio no Mercado Livre ↗', 'product-link');
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.addEventListener('click',async event=>{
      event.preventDefault();
      if(link.datasetChecking) return;
      link.datasetChecking=true;
      const popup=window.open('about:blank','_blank');
      if(popup) popup.opener=null;
      link.textContent='Conferindo preço e anúncio…';
      try {
        const data=await request('/api/commercial/revalidate?id='+encodeURIComponent(snapshot.product_id)+'&type='+encodeURIComponent(snapshot.type),'POST');
        const destination=safeUrl(data.preview?.url,false);
        if(!data.ready || !destination) throw new Error('OFFER_UNAVAILABLE');
        const changed=data.preview.price!==preview.price;
        const commercialCard=!!preview.commercial;
        Object.assign(preview,data.preview);
        if(commercialCard) await loadCommercial(); else fillCard(card,snapshot,preview,timeline);
        el('copy-status').textContent=changed?'Preço atualizado. Confira o anúncio e gere o link de afiliado dessa oferta.':'Anúncio da oferta consultado agora. Confira preço e condições no Mercado Livre.';
        if(popup) popup.location.replace(destination); else window.location.assign(destination);
      } catch {
        if(popup) popup.close();
        el('copy-status').textContent='Não foi possível confirmar o preço e o anúncio agora. Atualize os dados e tente novamente.';
      } finally {link.datasetChecking=false;link.textContent='Abrir anúncio no Mercado Livre ↗';}
    });
    body.append(link);
    if(snapshot.type==='PRODUCT' && publicUrl) {
      const catalogLink=textNode('a','Ver catálogo e outras ofertas ↗','product-meta');
      catalogLink.href=publicUrl;catalogLink.target='_blank';catalogLink.rel='noopener noreferrer';body.append(catalogLink);
    }
  } else {
    body.append(textNode('p', preview.status === 'UNAVAILABLE' ? 'Anúncio indisponível no momento.' : 'Link não resolvido: dados indisponíveis ou acesso restrito pelo Mercado Livre.'));
  }
  if (complete(snapshot, preview)) {
    const key = snapshot.type + ':' + snapshot.product_id;
    const label = textNode('label', 'Link oficial de afiliado deste produto');
    const input = document.createElement('input'); input.type = 'url'; input.className = 'affiliate-input';
    input.placeholder = 'Cole o link do gerador oficial'; input.value = storedLink(key); label.append(input); body.append(label);
    input.addEventListener('change', () => {
      const link = affiliateUrl(input.value.trim());
      if (input.value.trim() && !link) { el('copy-status').textContent = 'Use um link HTTPS do Mercado Livre ou meli.la.'; return; }
      try { localStorage.setItem('autoachado:affiliate:' + key, link || ''); }
      catch { el('copy-status').textContent = 'Não foi possível salvar neste navegador. O link ainda pode ser usado para copiar.'; }
    });
    const button = textNode('button', '📋 Copiar texto p/ WhatsApp', 'copy-button');
    button.addEventListener('click', async () => {
      if (!affiliateUrl(input.value.trim())) { el('copy-status').textContent = 'Cole o link deste produto gerado pela Central de Afiliados antes de copiar.'; input.focus(); return; }
      button.disabled=true;button.textContent='Conferindo oferta…';
      try {
        const data=await request('/api/commercial/revalidate?id='+encodeURIComponent(snapshot.product_id)+'&type='+encodeURIComponent(snapshot.type),'POST');
        if(!data.ready) {el('copy-status').textContent='Não foi possível confirmar uma oferta completa e atual. A cópia foi interrompida.';return;}
        const fresh=data.preview;
        const changed=['price','original_price','currency','seller_id','catalog_product_id','url'].some(key=>fresh[key]!==preview[key]);
        const lostApproval=preview.commercial?.state==='APPROVED'&&fresh.commercial?.state!=='APPROVED';
        Object.assign(preview,fresh);
        if(changed || lostApproval) {
          if(timeline) await loadCommercial(); else fillCard(card,snapshot,preview);
          el('copy-status').textContent='As condições ou a aprovação mudaram. Revise o cartão atualizado e confirme o link de afiliado antes de copiar novamente.';
          return;
        }
        const copy=productCopy(snapshot,fresh,input.value.trim());
        if(copy) {button.textContent='📋 Copiar texto p/ WhatsApp';await copyText(copy,button);}
      } catch {el('copy-status').textContent='Não foi possível revalidar a oferta. Tente novamente antes de divulgar.';}
      finally {button.disabled=false;if(button.textContent==='Conferindo oferta…') button.textContent='📋 Copiar texto p/ WhatsApp';}
    }); body.append(button);
    if(timeline) body.append(whatsappSendButton(snapshot,input));
  }
  body.append(details);
  card.append(photo); card.append(body);
}
async function showMore() {
  if (loading) return;
  loading = true;
  const currentRevision = revision;
  const pending = snapshots.slice(visible, visible + 12);
  visible += pending.length; renderResults();
  async function worker() {
    while (pending.length && currentRevision === revision) {
      const snapshot = pending.shift();
      const key = snapshot.type + ':' + snapshot.product_id;
      let preview;
      try {
        let entry = previewCache.get(key);
        if (!entry || entry.expires < Date.now()) {
          entry = {expires: Date.now() + 120000, value: request('/api/discovery/preview?id=' + encodeURIComponent(snapshot.product_id) + '&type=' + encodeURIComponent(snapshot.type))};
          previewCache.set(key, entry);
        }
        preview = await entry.value;
      } catch { previewCache.delete(key); preview = {title:snapshot.product_id}; }
      if (currentRevision === revision) { loaded.push({snapshot,preview}); el('results-summary').textContent = 'Consultando prévias: ' + loaded.length + ' de ' + snapshots.length + ' produtos…'; }
    }
  }
  try { await Promise.all([worker(),worker()]); }
  finally { loading = false; renderResults(); }
}
async function refresh() {
  const data = await request('/api/discovery/latest-snapshots');
  el('count').textContent = data.total.toLocaleString('pt-BR');
  el('synced').textContent = date(data.syncedAt);
  if (loading) return;
  const nextSignature = JSON.stringify(data.snapshots);
  if (signature === nextSignature) return;
  signature = nextSignature; revision++;
  snapshots = data.snapshots.filter((entry, index, rows) => rows.findIndex(row => row.type === entry.type && row.product_id === entry.product_id) === index);
  visible = 0; loaded = []; el('snapshots').replaceChildren();
  el('results-summary').textContent = snapshots.length + ' produtos distintos nos ' + data.snapshots.length + ' snapshots recentes.';
  if (!snapshots.length) el('snapshots').append(textNode('p', 'Nenhum produto persistido ainda.'));
  if (el('raw-products').open) await showMore();
}
el('more').addEventListener('click', () => showMore());
async function act(action) {
  if (busy || loading) return;
  busy = true;
  document.querySelectorAll('button').forEach(button => button.disabled = true);
  if (action === 'refresh') signature = '';
  el('message').textContent = action === 'refresh' ? 'Atualizando dados…' : 'Mineração em andamento. Aguarde…';
  try {
    let result;
    if (action !== 'refresh') result = await request('/api/discovery/' + action, 'POST');
    await Promise.all([refresh(), loadCoupons(), loadCommercial()]);
    el('message').textContent = result ? 'Execução: ' + result.status + ' · ' + result.persisted + ' snapshots persistidos.' : 'Dados sincronizados.';
  } catch (error) { el('message').textContent = error.message; }
  finally { busy = false; document.querySelectorAll('button').forEach(button => button.disabled = false); updateVerticalControls(); }
}
for (const action of ['sweep','smoke','refresh']) el(action).addEventListener('click', () => act(action));
${whatsappScript}
act('refresh'); setInterval(() => { if (!busy && !loading) refresh().catch(() => { el('message').textContent = 'Falha ao sincronizar. Use Atualizar Dados para tentar novamente.'; }); }, 30000);
</script></body></html>`;
}
