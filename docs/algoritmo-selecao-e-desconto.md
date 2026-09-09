# Algoritmo de seleção e desconto — versão experimental 1

## Estado da entrega

Implementado em modo de simulação, com endpoint técnico protegido. Não substitui o seletor operacional nem altera automaticamente vagas, feedback, categorias, cupons, cron ou aprovação de divulgação. Casa permanece desativada. O objetivo desta fase é comparar a proposta com a carteira atual e inspecionar seus erros antes de ativar mudanças.

## Decisão 1: quem merece ser acompanhado

Notas independentes de `original_price` e do percentual de desconto anunciado:

| Componente | Máximo | Cálculo inicial |
| --- | ---: | --- |
| Recorrência no ranking | 25 | Dias distintos com presença, dividido por 14 |
| Posição relativa | 15 | Posição mediana de 1 a 20 dentro de uma categoria |
| Estabilidade | 5 | Dispersão das posições, somente a partir de três dias |
| Melhora de posição | 5 | Evolução entre duas metades da série, mínimo de seis dias |
| Utilidade ampla | 20 | Hipótese editorial por tipo de produto |
| Facilidade de compra | 15 | Hipótese editorial sobre instalação/compatibilidade |
| Reputação | 10 | Vendedor confiável confirmado |
| Faixa de preço | 5 | Preferência leve por preços acessíveis; não mede conversão |

Cada identidade é avaliada dentro de cada categoria separadamente; escolhe-se sua dimensão com melhor evidência. Não se somam dias de categorias diferentes. Consultas repetidas no mesmo dia contam uma vez. Fontes diferentes compartilham sinais somente quando já possuem a mesma identidade canônica verificada. Produtos apenas parecidos não são unidos.

Rankings indicam posição relativa, não unidades vendidas recentes comparáveis entre categorias. Não se usa número de vendas acumuladas como velocidade de venda. Dias sem informação não viram zero vendas. Dados futuros ou posições inválidas são ignorados.

Entrada proposta: mínimo experimental de 60 pontos, três dias no mesmo ranking, aprovação editorial, conteúdo completo, preço positivo em BRL consultado nas últimas 24h, identidade comparável e vendedor confiável. Feedback NOT_RELEVANT bloqueia. Confiança é INSUFFICIENT antes de três dias, LOW de três a nove e MEDIUM a partir de dez; não se promete alta confiança ou probabilidade de compra apenas com rankings e regras de título.

## Seleção e reserva

Selecionar até 100 identidades elegíveis por nota, respeitando 25 por família. Empates usam identificadores estáveis, sem preferência pela ordem de descoberta. Monitorados protegidos por envio/interesse são retidos e consomem vagas; sua retenção não significa aprovação comercial. Se faltam candidatos qualificados, a simulação deixa vagas vazias. Os demais elegíveis compõem a reserva.

A carteira proposta é contrafactual. Uma sugestão de troca exige sete dias de demanda, vantagem de pelo menos dez pontos e permanência conhecida de sete dias do monitorado. Limita-se a cinco sugestões. Permanência desconhecida bloqueia a sugestão; não se toma a data de descoberta como data de entrada no monitoramento. Nenhuma sugestão é executada nesta fase.

Candidatos descobertos sem preview entram numa lista separada de prioridade de investigação, ordenada pelos sinais disponíveis do ranking. Isso permite enxergar oportunidades fora dos 100 e fora dos produtos já enriquecidos. Nesta versão, essa lista ainda não modifica a fila de exploração operacional.

## Decisão 2: o preço é uma oportunidade?

Uma análise independente usa apenas preços observados da identidade exata, em BRL, com comparabilidade e vendedor confiável. Calcula o menor preço observado por dia e a mediana desses mínimos. Exige 20 dias observados, cobertura temporal de 27 dias e ao menos dois vendedores. O preço atual precisa estar validado e atualizado. Não inclui frete, cashback, condições privadas ou cupom não confirmado.

A janela móvel usa os 30 dias anteriores, excluindo o dia atual. Para a campanha de novembro, a janela pré-campanha é fixa: 1 de setembro, 00h UTC, até 1 de outubro, 00h UTC, exclusivo, no mesmo ano. Ela só é considerada após encerrar e se tiver evidência suficiente. Uma alta em outubro não entra na referência de setembro. Entre referências suficientes, usa-se a menor, de forma conservadora.

Essa é uma janela fixa calculada sobre evidências persistidas, não uma tabela materializada imutável. Backfills ou correções futuras de observações antigas exigem auditoria antes de publicar comparações. Não há rotina de exclusão de observações implementada nesta entrega.

Resultados possíveis:

- CURRENT_PRICE_UNVERIFIED: preço atual não permite comparação.
- INSUFFICIENT_HISTORY: ainda não há referência suficiente; não acusa promoção falsa.
- ANNOUNCED_NOT_CONFIRMED: desconto anunciado de pelo menos 5% excede o histórico em mais de cinco pontos percentuais.
- HISTORICAL_DISCOUNT: pelo menos 10% abaixo da referência válida.
- USUAL_OR_HIGHER_PRICE: não alcança o desconto histórico mínimo; pode estar um pouco abaixo do habitual ou mais caro.

`historical_discount_confirmed` é independente do anúncio: pode existir economia verdadeira de 15% enquanto o anúncio promete 50%. A resposta explica ambos. Nunca usa a expressão “fraude comprovada”. Os limites de 5 e 10 pontos são políticas experimentais, a revisar com exemplos reais.

## Execução e validação

`POST /api/commercial/selection-simulation`, autenticado por CRON_SECRET, lê snapshots dos últimos 14 dias, produtos conhecidos, vínculos, feedback, enviados, alterações e observações históricas. A função SQL `commercial_selection_inputs` entrega um snapshot consistente em uma consulta e agrega posições por fonte/categoria/dia antes da transferência. Limites explícitos de volume e janela abortam em caso de excesso, sem apresentar comparação truncada como completa. Retorna seleção, reserva, razões, componentes, confiança, diagnóstico de desconto e prioridades de investigação. Não realiza escritas ou consultas adicionais ao Mercado Livre.

Relatórios contendo métricas e listas reais de produção ficam em `.vercel`, ignorado pelo Git. Código, especificação e testes podem ser versionados.

O cálculo considera todo o conjunto carregado; a resposta detalha até 500 avaliações e 100 reservas para limitar o tamanho do JSON, informando os totais. Os atuais monitorados e a seleção proposta são retornados separadamente. Snapshots são restritos a execuções AUTOMOTIVE; candidatos conhecidos ficam restritos a seus vínculos nessa vertical.

## Critérios para a próxima fase

Revisar qualidade e diversidade dos primeiros colocados, medir quantos candidatos ficam bloqueados por informação ausente, conferir estabilidade em dias distintos e verificar exemplos negativos. Só então integrar prioridade à exploração e vantagens comprovadas à promoção automática. A nova nota não deve ser ativada apenas por aumentar a quantidade de aprovados.
