export interface DashboardProps {
  authorized: boolean;
  userId?: string | undefined;
}

export function dashboardPage(props: DashboardProps): string {
  const connected = props.authorized && props.userId === "296984475";
  const verticals = [
    ["Automotivo", "MLB5672"], ["Casa, utilidades e organização", "MLB1574"],
    ["Eletrodomésticos", "MLB5726"], ["Moda", "MLB1430"], ["Beleza e cuidado pessoal", "MLB1246"],
    ["Eletrônicos, celulares e acessórios", "MLB1051"], ["Infantil — bebês e brinquedos", "MLB1132"],
    ["Games", "MLB1144"], ["Esportes e fitness", "MLB1276"], ["Pet", "MLB1071"],
  ];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="AutoAchado.AI — Dashboard Operacional, mineração automotiva e snapshots persistidos no Supabase.">
<title>AutoAchado.AI — Dashboard Operacional</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#090d16;color:#e2e8f0;font:15px system-ui,sans-serif}header{padding:24px max(24px,calc((100% - 1200px)/2));background:#111827;border-bottom:1px solid #25324a;display:flex;gap:20px;align-items:center;justify-content:space-between}h1{margin:0;font-size:24px}h2{font-size:19px;margin-top:0}p,small{color:#9bacc4}main{max-width:1250px;margin:auto;padding:28px 24px}.stats,.matrix{display:grid;gap:16px;grid-template-columns:repeat(4,minmax(0,1fr))}.matrix{grid-template-columns:repeat(2,minmax(0,1fr));padding:0;list-style:none}.card,.panel,.matrix li{border:1px solid #25324a;border-radius:12px;background:#131d31;padding:20px}.card strong{display:block;font-size:24px;margin:12px 0}.panel{margin-top:24px}.matrix li{background:#0e1728;padding:14px}.matrix span{display:block;color:#9bacc4;margin-top:6px}.badge{color:#6ee7b7}.controls{display:flex;flex-wrap:wrap;gap:12px}button,a{color:#93c5fd}button{border:1px solid #3b82f6;background:#1d4ed8;color:white;border-radius:8px;padding:12px 16px;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:wait}button:focus-visible,a:focus-visible{outline:3px solid #fcd34d;outline-offset:3px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:14px 10px;border-bottom:1px solid #25324a}th{color:#9bacc4;font-size:12px;text-transform:uppercase}#message{min-height:24px}@media(max-width:850px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.stats,.matrix{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}.card strong{font-size:22px}}
.results{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}.product-card{background:#0e1728;border:1px solid #25324a;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}.product-photo{height:200px;background:#fff;display:flex;align-items:center;justify-content:center;color:#64748b}.product-photo img{height:100%;width:100%;object-fit:contain}.product-body{padding:16px;display:flex;flex-direction:column;gap:10px;flex:1}.product-body h3{font-size:16px;margin:0;line-height:1.4}.product-body p{margin:0;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.product-price{font-size:23px;color:#6ee7b7}.product-link{display:block;background:#1d4ed8;color:white;padding:12px;border-radius:8px;text-align:center;text-decoration:none;margin-top:auto}.product-meta{font-size:11px;color:#9bacc4;overflow-wrap:anywhere}#more{margin-top:20px}#more[hidden]{display:none}</style></head><body><header><div><h1>AutoAchado.AI</h1><p>Dashboard Operacional · Robô de mineração · MLB / Brasil · 0B3D-C</p></div><div class="badge">${connected ? "● Mercado Livre conectado" : "⚠ Mercado Livre não conectado"}<br><small>ID: 296984475</small> · <a href="/auth/start">Conectar conta</a></div></header>
<main><section class="stats" aria-label="Indicadores">
<div class="card">Status do Robô<strong>Operacional ✅</strong><small>Automotivo V1</small></div>
<div class="card">Verticais Planejadas<strong>10 Verticais</strong><small>Automotivo V1 Ativa com 144 categorias: 28 Tier A + 116 Tier B</small></div>
<div class="card">Oportunidades no Banco<strong id="count">—</strong><small>Registros em public.highlight_snapshots</small></div>
<div class="card">Última Sincronização<strong id="synced">—</strong><small>Atualização automática a cada 30 segundos</small></div></section>
<section class="panel"><h2>Matriz de Expansão (10 Verticais Estratégicas)</h2><ol class="matrix">${verticals.map(([name,id],i)=>`<li>${i+1}. ${name}<span>${id} · ${i===0 ? "ATIVO (144 Cats)" : "PLANEJADO"}</span></li>`).join("")}</ol></section>
<section class="panel"><h2>Painel de Controle</h2><div class="controls"><button id="sweep">🚀 Executar Varredura Persistida (0B3D-C)</button><button id="smoke">⚡ Teste Smoke (2 cats)</button><button id="refresh">🔄 Atualizar Dados</button></div><p id="message" role="status" aria-live="polite"></p></section>
<section class="panel"><h2>Produtos encontrados</h2><p>Prévia dos destaques minerados: foto, descrição e preço informado pelo Mercado Livre. Preço e disponibilidade podem mudar; os destaques ainda não representam descontos validados.</p><p id="results-summary"></p><div id="snapshots" class="results" aria-label="Produtos minerados"></div><button id="more" hidden>Mostrar mais produtos</button></section></main>
<script>
const el = id => document.getElementById(id);
let busy = false;
const date = value => new Date(value).toLocaleString('pt-BR');
async function request(path, method = 'GET') {
  const response = await fetch(path, { method, cache: 'no-store', credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? 'Conecte a conta Mercado Livre 296984475 para acessar os dados.' : 'Falha na operação. Verifique a configuração do servidor e tente novamente.');
  return data;
}
let snapshots = [], visible = 0, revision = 0, signature = '';
const previewCache = new Map();
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
function fillCard(card, snapshot, preview) {
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
  body.append(textNode('p', preview.description || 'Descrição não disponibilizada pela API.'));
  let price = 'Consultar preço no Mercado Livre';
  if (typeof preview.price === 'number' && Number.isFinite(preview.price)) {
    try { price = new Intl.NumberFormat('pt-BR', {style:'currency',currency:preview.currency || 'BRL'}).format(preview.price); } catch { /* Keep fallback. */ }
  }
  body.append(textNode('strong', price, 'product-price'));
  if (preview.priceSource) body.append(textNode('span', (preview.priceSource === 'CATALOG_OFFER' ? 'Preço da oferta de catálogo' : 'Preço informado pelo anúncio') + (preview.priceCheckedAt ? ' · Consultado em ' + date(preview.priceCheckedAt) : ''), 'product-meta'));
  body.append(textNode('span', snapshot.product_id + ' · ' + snapshot.type + ' · Tier ' + (snapshot.priority_tier || '—') + ' · Posição ' + (snapshot.position || '—'), 'product-meta'));
  body.append(textNode('span', 'Coletado em ' + date(snapshot.observed_at), 'product-meta'));
  const publicUrl = snapshot.type === 'PRODUCT' && /^MLB[0-9]+$/.test(snapshot.product_id)
    ? 'https://www.mercadolivre.com.br/p/' + snapshot.product_id
    : snapshot.type === 'USER_PRODUCT' && /^MLBU[0-9]+$/.test(snapshot.product_id)
      ? 'https://www.mercadolivre.com.br/up/' + snapshot.product_id : null;
  const href = safeUrl(preview.url, false) || publicUrl;
  if (href) {
    const link = textNode('a', (preview.status === 'CATALOG' || !preview.url) ? 'Abrir produto e ofertas ↗' : 'Abrir anúncio no Mercado Livre ↗', 'product-link');
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; body.append(link);
  } else {
    body.append(textNode('p', preview.status === 'UNAVAILABLE' ? 'Anúncio indisponível no momento.' : 'Link não resolvido: dados indisponíveis ou acesso restrito pelo Mercado Livre.'));
  }
  card.append(photo); card.append(body);
}
async function showMore() {
  const currentRevision = revision;
  const batch = snapshots.slice(visible, visible + 12);
  visible += batch.length;
  el('more').hidden = visible >= snapshots.length;
  const pending = batch.map(snapshot => {
    const card = textNode('article', 'Carregando prévia de ' + snapshot.product_id + '…', 'product-card');
    el('snapshots').append(card); return {snapshot, card};
  });
  async function worker() {
    while (pending.length && currentRevision === revision) {
      const {snapshot, card} = pending.shift();
      const key = snapshot.type + ':' + snapshot.product_id;
      try {
        let entry = previewCache.get(key);
        if (!entry || entry.expires < Date.now()) {
          entry = {expires: Date.now() + 120000, value: request('/api/discovery/preview?id=' + encodeURIComponent(snapshot.product_id) + '&type=' + encodeURIComponent(snapshot.type))};
          previewCache.set(key, entry);
        }
        const preview = await entry.value;
        if (currentRevision === revision) fillCard(card, snapshot, preview);
      } catch {
        previewCache.delete(key);
        if (currentRevision === revision) fillCard(card, snapshot, { title: snapshot.product_id });
      }
    }
  }
  await Promise.all([worker(), worker()]);
}
async function refresh() {
  const data = await request('/api/discovery/latest-snapshots');
  el('count').textContent = data.total.toLocaleString('pt-BR');
  el('synced').textContent = date(data.syncedAt);
  const nextSignature = JSON.stringify(data.snapshots);
  if (signature === nextSignature) return;
  signature = nextSignature; revision++;
  snapshots = data.snapshots.filter((entry, index, rows) => rows.findIndex(row => row.type === entry.type && row.product_id === entry.product_id) === index);
  visible = 0; el('snapshots').replaceChildren();
  el('results-summary').textContent = snapshots.length + ' produtos distintos nos ' + data.snapshots.length + ' snapshots recentes.';
  if (!snapshots.length) el('snapshots').append(textNode('p', 'Nenhum produto persistido ainda.'));
  await showMore();
}
el('more').addEventListener('click', () => showMore());
async function act(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(button => button.disabled = true);
  if (action === 'refresh') signature = '';
  el('message').textContent = action === 'refresh' ? 'Atualizando dados…' : 'Mineração em andamento. Aguarde…';
  try {
    let result;
    if (action !== 'refresh') result = await request('/api/discovery/' + action, 'POST');
    await refresh();
    el('message').textContent = result ? 'Execução: ' + result.status + ' · ' + result.persisted + ' snapshots persistidos.' : 'Dados sincronizados.';
  } catch (error) { el('message').textContent = error.message; }
  finally { busy = false; document.querySelectorAll('button').forEach(button => button.disabled = false); }
}
for (const action of ['sweep','smoke','refresh']) el(action).addEventListener('click', () => act(action));
act('refresh'); setInterval(() => { if (!busy) refresh().catch(() => { el('message').textContent = 'Falha ao sincronizar. Use Atualizar Dados para tentar novamente.'; }); }, 30000);
</script></body></html>`;
}
