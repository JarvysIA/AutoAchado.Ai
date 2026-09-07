# Seleção comercial v1

A seleção principal consulta /api/commercial/opportunities. A galeria anterior permanece recolhida como exploração de registros sem aprovação. Desde 06/09/2026, a admissão usa commercial_candidate_queue, alimentada por snapshots dos últimos 7 dias. Cada coleta reserva até 48 consultas históricas e um lote separado de até 24 novidades: 20 produtos de catálogo e 4 de outros tipos. Os candidatos históricos existentes são preservados e a promoção automática pode ampliar a coorte até 96 monitorados. Candidatos completos e adequados aguardam vaga se esse limite estiver ocupado; avaliação inicial não significa aprovação histórica.

Novidades são avaliadas mesmo com a coorte cheia. Falhas e dados incompletos têm nova tentativa agendada; após três avaliações incompletas, o candidato é encerrado com motivo. Produtos especializados deixam a coorte; após três consultas históricas sem título e sem preço, outros candidatos podem ocupar a vaga. As evidências antigas são preservadas. A cobertura não corresponde a todos os produtos do marketplace.

## Evidência e requisitos

- Identidade agregada somente quando a API confirma catalog_product_id, condição nova, no máximo uma variação e preço público do item. Também é aceita a oferta de um PDP ativo sem filhos, com condição nova, vendedor e moeda confirmados no recurso oficial de ofertas de catálogo. Não há associação por semelhança de título. Outros registros guardam identidade individual e não obtêm aprovação histórica.
- Preços e vendedor são observados no momento da coleta; até 3 ofertas adicionais do mesmo catálogo são consultadas quando houver identidade confirmada e orçamento de execução.
- A referência é a mediana dos menores preços diários observados em ofertas comparáveis e com vendedor verde, nos 30 dias anteriores. O dia atual é excluído. Exigem-se 20 dias distintos, cobertura temporal de pelo menos 27 dias e 2 vendedores. Isso representa o universo observado, não o menor preço de todo o mercado.
- Desconto mínimo de 10%, calculado antes do arredondamento; original_price do vendedor não entra no cálculo histórico.
- Demanda: presença no ranking oficial em pelo menos 7 dias nos últimos 14 dias, com posição mediana até 10, dentro de uma mesma dimensão de categoria. commercial_rank_observations preserva identidade, categoria, posição e instante. Dias de categorias diferentes não são somados para superar o requisito. As categorias de descoberta conhecidas do candidato são consultadas novamente; snapshots antigos só indicam onde consultar, não contam como presença atual. Este é um indício relativo à categoria, não contagem nem velocidade comprovada de vendas.
- Oferta atual com título, imagem, preço positivo em BRL, link, identidade comparável, reputação verde confirmada e preço consultado há no máximo 24 horas.
- Frete e contexto de comprador não são presumidos; o selo compara o preço do produto sem frete. Cupons não entram automaticamente no preço histórico.

Somente depois dos requisitos são aplicados os pesos: demanda 30%, desconto 25%, apelo 15%, facilidade 15%, reputação 10%, valor comercial 5%. Apelo, facilidade e faixa de preço são hipóteses editoriais explícitas em commercialProfile, não previsões de conversão. Produtos fora das famílias iniciais ficam em observação para revisão. Tier A não é prova de giro. Não há comissão estimada inventada.

A lista aprovada contém até 20 identidades diferentes, no máximo 3 por grupo, ordenadas por pontuação. A API pagina em 12 entradas. Não completa a lista com produtos reprovados. Feedback INTERESTED/SHARED é registrado; NOT_RELEVANT exclui do ranking e do monitoramento. RESET restaura a avaliação. Esses eventos não são apresentados como vendas nem mudam automaticamente os pesos sem resultados suficientes.

## Operação

Migrações comerciais de 20260905223000 a 20260906154000. Tabelas com RLS e acesso somente pelo servidor. Coleta histórica e prioritária compartilham trava no banco, têm orçamento por execução e log de conclusão parcial/falha. As execuções distinguem HISTORY e PRIORITY; explored e exploration_failed registram a exploração separadamente. Evidência de preço é identificada por origem e instante de consulta para evitar duplicação da mesma prévia em cache.

Vercel: varredura diária às 06:00 UTC e coleta às 09:00 e 21:00 UTC (03:00, 06:00 e 18:00 em Brasília). Horários sujeitos à precisão do plano. CRON_SECRET é obrigatório; nunca é enviado ao navegador. POST /api/commercial/collect permite coleta manual da conta autorizada. POST /api/commercial/feedback exige sessão e origem do aplicativo. GET de cron requer Bearer CRON_SECRET e não aceita sessão como substituto.

A varredura interrompe novos lotes após 180 segundos. discovery_category_progress registra tentativas, resultado HTTP e próxima tentativa; categorias pendentes têm prioridade nas próximas execuções. Sucesso aguarda 20 horas, 404 aguarda sete dias, 403 aguarda 24 horas e erros transitórios usam espera crescente. Um 404 do recurso é exibido separadamente como ausência de ranking disponível. A coleta histórica reserva 120 segundos para iniciar produtos e a exploração pode iniciar trabalho até 210 segundos do começo da execução. A função permite até 300 segundos; cada requisição possui seu próprio timeout de 20 segundos.

O piloto prioritário usa Supabase Cron e pg_net para chamar GET /api/commercial/priority, com credencial no Vault. Agenda: `5,35 12-19 * * *` em UTC, isto é, 09h05, 09h35, até 16h35 em Brasília. São até seis produtos prioritários ativos e seis consultas por execução, com nova consulta elegível após 30 minutos. Novos candidatos qualificados e quedas observadas de pelo menos 5% com ranking até dez podem ganhar prioridade por oito horas. Essa duração é do monitoramento, não o vencimento de uma oferta. Fora do horário do piloto, não há coleta rápida agendada; as rotinas históricas continuam nos horários acima. O teto de capacidade e o horário devem ser revistos com métricas antes de ampliar.

O agendamento é provisionado após verificar a rota publicada, com `cron.schedule('autoachado-commercial-priority', '5,35 12-19 * * *', 'select public.dispatch_commercial_priority();')`. O segredo denominado commercial_priority_cron_secret deve corresponder ao CRON_SECRET da aplicação, permanecer no Vault e ser atualizado quando houver rotação. Nunca colocá-lo no texto do job ou no repositório.

POST /api/commercial/revalidate exige sessão e origem do app, ignora cache da prévia e recalcula a avaliação com a oferta atual. A cópia é interrompida se faltarem dados atuais; mudança de preço, referência, vendedor, identidade, URL ou perda de aprovação exige revisão do cartão. Links oficiais de afiliado ainda são fornecidos pelo operador e salvos no navegador; não há confirmação automática de atribuição ou destino do link encurtado.

POST /api/commercial/probe é restrito ao CRON_SECRET e consulta somente endpoints fixos de leitura. O teste autenticado confirmou catálogo, ofertas e ranking do compressor MLB57468821, mas retornou 403 para promoções do anúncio de terceiro. A enumeração da vitrine global de promoções permanece não confirmada e não foi ativada.

## Validação comercial

Histórico inicia vazio; observar um preço por 30 dias não basta se faltarem vendedores confiáveis ou dados comparáveis. Registros bloqueados pela API não amadurecem automaticamente. Relatórios de pedidos/comissão e métricas de cliques ainda dependem de uma fonte autorizada; a primeira versão guarda a avaliação e a divulgação manual do operador. Recalibrar grupos e pesos após analisar esses resultados, preservando os requisitos mínimos.
