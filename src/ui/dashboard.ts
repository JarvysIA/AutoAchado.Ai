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
</style></head><body><header><div><h1>AutoAchado.AI</h1><p>Dashboard Operacional · Robô de mineração · MLB / Brasil · 0B3D-C</p></div><div class="badge">${connected ? "● Mercado Livre conectado" : "⚠ Mercado Livre não conectado"}<br><small>ID: 296984475</small> · <a href="/auth/start">Conectar conta</a></div></header>
<main><section class="stats" aria-label="Indicadores">
<div class="card">Status do Robô<strong>Operacional ✅</strong><small>Automotivo V1</small></div>
<div class="card">Verticais Planejadas<strong>10 Verticais</strong><small>Automotivo V1 Ativa com 144 categorias: 28 Tier A + 116 Tier B</small></div>
<div class="card">Oportunidades no Banco<strong id="count">—</strong><small>Registros em public.highlight_snapshots</small></div>
<div class="card">Última Sincronização<strong id="synced">—</strong><small>Atualização automática a cada 30 segundos</small></div></section>
<section class="panel"><h2>Matriz de Expansão (10 Verticais Estratégicas)</h2><ol class="matrix">${verticals.map(([name,id],i)=>`<li>${i+1}. ${name}<span>${id} · ${i===0 ? "ATIVO (144 Cats)" : "PLANEJADO"}</span></li>`).join("")}</ol></section>
<section class="panel"><h2>Painel de Controle</h2><div class="controls"><button id="sweep">🚀 Executar Varredura Persistida (0B3D-C)</button><button id="smoke">⚡ Teste Smoke (2 cats)</button><button id="refresh">🔄 Atualizar Dados</button></div><p id="message" role="status" aria-live="polite"></p></section>
<section class="panel"><h2>Oportunidades reais mineradas</h2><p>100 snapshots mais recentes. A contagem inclui todas as ocorrências persistidas; um produto pode aparecer em mais de uma coleta.</p><div class="table-wrap"><table><thead><tr><th>Produto / anúncio</th><th>Categoria</th><th>Tipo</th><th>Tier</th><th>Posição</th><th>Coletado em</th></tr></thead><tbody id="snapshots"><tr><td colspan="6">Carregando snapshots…</td></tr></tbody></table></div></section></main>
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
async function refresh() {
  const data = await request('/api/discovery/latest-snapshots');
  el('count').textContent = data.total.toLocaleString('pt-BR');
  el('synced').textContent = date(data.syncedAt);
  el('snapshots').replaceChildren();
  for (const snapshot of data.snapshots) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    const link = document.createElement('a');
    link.textContent = snapshot.product_id;
    link.href = 'https://produto.mercadolivre.com.br/' + encodeURIComponent(snapshot.product_id);
    link.target = '_blank'; link.rel = 'noopener noreferrer'; cell.append(link); row.append(cell);
    for (const value of [snapshot.marketplace_category_id, snapshot.type, snapshot.priority_tier, snapshot.position, date(snapshot.observed_at)]) {
      const td = document.createElement('td'); td.textContent = value == null ? '—' : String(value); row.append(td);
    }
    el('snapshots').append(row);
  }
  if (!data.snapshots.length) { const row = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.textContent = 'Nenhuma oportunidade persistida ainda.'; row.append(td); el('snapshots').append(row); }
}
async function act(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(button => button.disabled = true);
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
act('refresh'); setInterval(() => act('refresh'), 30000);
</script></body></html>`;
}
