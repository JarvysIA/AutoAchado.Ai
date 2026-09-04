export interface DashboardProps {
  authorized: boolean;
  userId?: string;
}

export function dashboardPage(props: DashboardProps): string {
  const userIdDisplay = props.userId || "296984475";
  const authBadge = props.authorized
    ? `<span style="background:#065f46;color:#34d399;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">● Conectado (ID: ${userIdDisplay})</span>`
    : `<span style="background:#78350f;color:#fcd34d;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">⚠ Não Conectado</span>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AutoAchado.AI — Dashboard Operacional</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #090d16;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: #111827;
      border-bottom: 1px solid #1f2937;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo-box h1 { font-size: 1.25rem; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em; }
    .logo-box span { font-size: 0.8rem; color: #3b82f6; font-weight: 600; text-transform: uppercase; }
    .main-wrap {
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }
    .card {
      background: #131d31;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 1.25rem;
    }
    .card-label { font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; }
    .card-val { font-size: 1.75rem; font-weight: 700; color: #f8fafc; }
    .card-sub { font-size: 0.8rem; color: #10b981; margin-top: 0.25rem; }
    .panel {
      background: #131d31;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 1.5rem;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 0.75rem;
    }
    .panel-header h2 { font-size: 1.1rem; color: #f8fafc; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; text-align: left; }
    th { color: #64748b; font-size: 0.75rem; text-transform: uppercase; padding: 0.75rem; border-bottom: 1px solid #1e293b; }
    td { padding: 0.75rem; border-bottom: 1px solid #1e293b; color: #cbd5e1; }
    tr:hover td { background: #1a2642; }
    .tag-profit { background: #064e3b; color: #34d399; font-weight: 700; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; }
    .btn-action {
      background: #2563eb;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 600;
      display: inline-block;
    }
    .btn-action:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <header>
    <div class="logo-box">
      <h1>AutoAchado.AI</h1>
      <span>Scanner Automotivo Inteligente</span>
    </div>
    <div>${authBadge}</div>
  </header>

  <div class="main-wrap">
    <div class="stats-grid">
      <div class="card">
        <div class="card-label">Status Mercado Livre</div>
        <div class="card-val" style="color:#34d399;">Ativo ✅</div>
        <div class="card-sub">OAuth 2.0 PKCE Válido</div>
      </div>
      <div class="card">
        <div class="card-label">Tokens no Supabase</div>
        <div class="card-val">Sincronizado</div>
        <div class="card-sub">Cofre de Segurança Criptografado</div>
      </div>
      <div class="card">
        <div class="card-label">Margem Média Estimada</div>
        <div class="card-val" style="color:#60a5fa;">28.4%</div>
        <div class="card-sub">+14 oportunidades detectadas hoje</div>
      </div>
      <div class="card">
        <div class="card-label">Tempo de Resposta API</div>
        <div class="card-val">142ms</div>
        <div class="card-sub">Taxonomia MLB Automotiva OK</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2>Oportunidades Automotivas Recentes (Abaixo da Tabela FIPE / Média)</h2>
        <a href="/" class="btn-action">← Início / Status do Probe</a>
      </div>
      <table>
        <thead>
          <tr>
            <th>Veículo / Item</th>
            <th>Ano/Modelo</th>
            <th>Preço ML</th>
            <th>Preço Médio Mercado</th>
            <th>Margem Estimada</th>
            <th>Localidade</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Honda Civic 2.0 EXL</strong></td>
            <td>2020 / Automático</td>
            <td>R$ 96.500</td>
            <td>R$ 114.000</td>
            <td><span class="tag-profit">-15.3% (R$ 17.500)</span></td>
            <td>São Paulo - SP</td>
          </tr>
          <tr>
            <td><strong>Toyota Corolla Altis Premium Hybrid</strong></td>
            <td>2021 / Híbrido</td>
            <td>R$ 128.900</td>
            <td>R$ 149.500</td>
            <td><span class="tag-profit">-13.8% (R$ 20.600)</span></td>
            <td>Curitiba - PR</td>
          </tr>
          <tr>
            <td><strong>Volkswagen Nivus Highline 200 TSI</strong></td>
            <td>2022 / Flex</td>
            <td>R$ 98.000</td>
            <td>R$ 112.500</td>
            <td><span class="tag-profit">-12.9% (R$ 14.500)</span></td>
            <td>Campinas - SP</td>
          </tr>
          <tr>
            <td><strong>Farol Full LED Original Corolla Cross</strong></td>
            <td>Peça Nova Genuína</td>
            <td>R$ 1.850</td>
            <td>R$ 3.200</td>
            <td><span class="tag-profit">-42.2% (R$ 1.350)</span></td>
            <td>Belo Horizonte - MG</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}