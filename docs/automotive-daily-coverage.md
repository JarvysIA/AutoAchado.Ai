# Automotivo: cobertura diária e preenchimento das 100 vagas

O histórico amadurece durante a operação. Não precisamos esperar 20–30 dias para melhorar coleta e admissão; a aprovação histórica continua exigindo todas as evidências anteriores.

## Rotina desta entrega

- Supabase agenda o endpoint protegido de coleta a cada hora, no minuto 15, durante as 24 horas. A descoberta de categorias continua diária; a fila existente alimenta a exploração entre descobertas.
- Cada execução busca até 25 monitorados cujo next_evidence_check venceu, com três workers e limite de início de trabalho de 120 segundos.
- Preço comparável confiável obtido e consultado recentemente agenda nova verificação em 12 horas. O horário efetivo depende dos próximos lotes e da disponibilidade da API; não é promessa de intervalo exato.
- Falha ou evidência incompleta agenda retry após 30 minutos, com backoff até seis horas. O scheduler horário executa quando chegar a próxima rodada disponível.
- Cada tentativa grava antes uma reserva de seis minutos. Se a função for interrompida, o produto volta a ficar elegível; produtos ainda não tentados permanecem pendentes. O bloqueio global existente evita sobreposição entre coletores.
- Até seis catálogos e dois candidatos de outros tipos são avaliados por rodada, com promoção automática limitada às 100 vagas automotivas. Continuar pesquisando não significa admitir sem reputação, comparabilidade ou perfil comercial adequado.
- A coleta histórica usa consulta nova de preço. Um erro não altera o timestamp do último preço válido; quantidade de tentativas e cobertura de preço são informações distintas.

A capacidade nominal é de até 600 verificações históricas e 192 avaliações de candidatos por dia. Com 100 produtos saudáveis, a rotina tende a duas verificações históricas por produto/dia, mais retries; o limite de 600 é folga para recuperação e distribuição, não uma cota que precisa ser consumida. Medir chamadas HTTP reais e latência: uma verificação pode consultar múltiplos endpoints.

## Indicadores na lista

Mostrar monitorados/capacidade, quantos têm preço comparável confiável obtido nas últimas 24 horas, histórico suficiente e quantos aguardam retry. last_valid_price_at é preservado mesmo após erro recente. A métrica vem da coleta histórica; observações prioritárias posteriores também entram no histórico comercial, mas não atualizam esse marcador nesta versão.

Histórico suficiente não equivale a oferta aprovada. O selo continua condicionado ao desconto, demanda e demais requisitos. Não afrouxar critérios para fechar 100 monitorados ou três ofertas diárias.

## Implantação

1. Aplicar `20260907150000_automotive_daily_coverage.sql` antes do runtime novo.
2. Publicar e verificar o build. vercel.json mantém somente a descoberta diária, eliminando os dois disparos históricos anteriores.
3. Aplicar `scripts/enable-automotive-hourly.sql`, que configura um job de nome estável. O segredo fica no Vault, não no SQL do job.
4. Disparar a função protegida e verificar a resposta HTTP, o resultado da coleta e os indicadores. Sucesso de cron.job_run_details sozinho confirma apenas o despacho HTTP.

Em rollback, desativar o job horário antes de voltar ao coletor antigo, que não respeita os novos vencimentos. Preservar campos, histórico e candidatos; restaurar um agendamento histórico compatível. Casa e demais verticais permanecem desativadas.
