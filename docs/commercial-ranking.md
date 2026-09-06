# Seleção comercial v1

A seleção principal consulta /api/commercial/opportunities. A galeria anterior permanece recolhida como exploração de registros sem aprovação. O novo ranking trabalha sobre uma coorte inicial de 48 candidatos balanceados por categoria, a partir dos snapshots dos últimos 7 dias; não corresponde a todos os produtos do marketplace. Até 24 candidatos são consultados por coleta, priorizando os que estão há mais tempo sem consulta. Produtos especializados deixam a coorte; após 3 consultas sem título e sem preço, outros candidatos podem ocupar a vaga. As evidências antigas são preservadas.

## Evidência e requisitos

- Identidade agregada somente quando a API confirma catalog_product_id, condição nova, no máximo uma variação e preço público do item. Não há associação por semelhança de título. Outros registros guardam identidade individual e não obtêm aprovação histórica.
- Preços e vendedor são observados no momento da coleta; até 3 ofertas adicionais do mesmo catálogo são consultadas quando houver identidade confirmada e orçamento de execução.
- A referência é a mediana dos menores preços diários observados em ofertas comparáveis e com vendedor verde, nos 30 dias anteriores. O dia atual é excluído. Exigem-se 20 dias distintos, cobertura temporal de pelo menos 27 dias e 2 vendedores. Isso representa o universo observado, não o menor preço de todo o mercado.
- Desconto mínimo de 10%, calculado antes do arredondamento; original_price do vendedor não entra no cálculo histórico.
- Demanda: presença no ranking oficial em pelo menos 7 dias nos últimos 14 dias, com posição mediana até 10. O ranking é consultado de novo; snapshots antigos não são reaproveitados como presença atual. Este é um indício relativo à categoria, não contagem nem velocidade comprovada de vendas.
- Oferta atual com título, imagem, preço positivo em BRL, link, identidade comparável, reputação verde confirmada e preço consultado há no máximo 24 horas.
- Frete e contexto de comprador não são presumidos; o selo compara o preço do produto sem frete. Cupons não entram automaticamente no preço histórico.

Somente depois dos requisitos são aplicados os pesos: demanda 30%, desconto 25%, apelo 15%, facilidade 15%, reputação 10%, valor comercial 5%. Apelo, facilidade e faixa de preço são hipóteses editoriais explícitas em commercialProfile, não previsões de conversão. Produtos fora das famílias iniciais ficam em observação para revisão. Tier A não é prova de giro. Não há comissão estimada inventada.

A lista aprovada contém até 20 identidades diferentes, no máximo 3 por grupo, ordenadas por pontuação. A API pagina em 12 entradas. Não completa a lista com produtos reprovados. Feedback INTERESTED/SHARED é registrado; NOT_RELEVANT exclui do ranking e do monitoramento. RESET restaura a avaliação. Esses eventos não são apresentados como vendas nem mudam automaticamente os pesos sem resultados suficientes.

## Operação

Migrações: 20260905223000_commercial_evidence e 20260905230000_commercial_collection_retries. Tabelas com RLS e acesso somente por service_role. Coleta com trava no banco, orçamento por execução e log de conclusão parcial/falha. Evidência identificada por origem e instante de consulta para evitar duplicação da mesma prévia em cache.

Vercel: varredura diária às 06:00 UTC e coleta às 09:00 e 21:00 UTC (03:00, 06:00 e 18:00 em Brasília). Horários sujeitos à precisão do plano. CRON_SECRET é obrigatório; nunca é enviado ao navegador. POST /api/commercial/collect permite coleta manual da conta autorizada. POST /api/commercial/feedback exige sessão e origem do aplicativo. GET de cron requer Bearer CRON_SECRET e não aceita sessão como substituto.

A varredura interrompe novos lotes após 180 segundos e persiste o progresso parcial; a coleta também limita novos produtos após 180 segundos. Função configurada para até 300 segundos. Falhas de API mantêm o produto em observação, sem preencher preços ou reputação artificialmente.

## Validação comercial

Histórico inicia vazio; observar um preço por 30 dias não basta se faltarem vendedores confiáveis ou dados comparáveis. Registros bloqueados pela API não amadurecem automaticamente. Relatórios de pedidos/comissão e métricas de cliques ainda dependem de uma fonte autorizada; a primeira versão guarda a avaliação e a divulgação manual do operador. Recalibrar grupos e pesos após analisar esses resultados, preservando os requisitos mínimos.
