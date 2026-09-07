# Plano de expansão: 100 produtos por vertical

## Objetivo e status

Meta acordada: acompanhar 100 produtos distintos em cada uma das dez verticais, totalizando 1.000 vínculos de monitoramento, e selecionar até três boas ofertas por dia para cada grupo. A quantidade editorial é uma meta, condicionada à qualidade das oportunidades disponíveis.

Este plano substitui as metas de capacidade do plano Casa com 50 produtos. Cinquenta passa a ser um marco intermediário de implantação. O limite global de 96 pertence ao piloto atual e não representa o objetivo do negócio. Esta entrega revisa a arquitetura e o plano; não ativa novas verticais nem altera a produção.

## Diagnóstico verificado no código

- `supabase/migrations/20260906150000_discovery_candidate_queue.sql`: promoção de candidatos limitada globalmente a 96 monitorados.
- `src/server/commercial/service.ts`: até 48 produtos por execução histórica, três workers e orçamento de início de trabalho de 120 segundos; exploração separada até o prazo de 210 segundos.
- `src/server/discovery/operational.ts` e `persistence-repository.ts`: configuração e validações operacionais vinculadas a AUTOMOTIVE.
- `src/server/commercial/ranking.ts`: critérios comerciais orientados a Automotivo; seleção padrão de até 20 aprovados com até três por família comercial. Isso não implementa três publicações diárias por canal.
- `vercel.json`: uma descoberta diária e duas execuções históricas diárias. Na capacidade atual, são no máximo 96 verificações históricas por dia, antes de interrupções e falhas. Para 1.000 produtos, uma volta completa levaria aproximadamente 10,4 dias nessa rotina, sem contar prioridade. Essa frequência não atende à formação de histórico diário.
- O histórico exige 20 dias observados, extensão temporal de pelo menos 27 dias e dois vendedores comparáveis em 30 dias; demanda exige sete dias de presença em ranking nos últimos 14 e posição mediana até dez na mesma dimensão. Desconto mínimo histórico: 10%. Preservar essas condições.

Os números de produção registrados no relatório anterior são um checkpoint, não uma nova medição desta análise. Ainda faltam prova autenticada de oferta de candidatos nas nove verticais e teste de carga para 1.000 monitorados.

## Capacidade por público

| Vertical | Meta de monitorados | Meta editorial diária |
| --- | ---: | ---: |
| Automotivo | 100 | Até 3 |
| Casa, utilidades e organização | 100 | Até 3 |
| Eletrodomésticos | 100 | Até 3 |
| Moda | 100 | Até 3 |
| Beleza e cuidado pessoal | 100 | Até 3 |
| Eletrônicos, celulares e acessórios | 100 | Até 3 |
| Infantil: bebês, brinquedos e moda infantil | 100 | Até 3 |
| Games | 100 | Até 3 |
| Esportes e fitness | 100 | Até 3 |
| Pet | 100 | Até 3 |
| **Total** | **1.000 vínculos** | **Até 30** |

São dez verticais de negócio, cada uma podendo abranger diversas categorias do Mercado Livre. Um produto exatamente igual pode interessar a dois públicos: compartilhar sua evidência de preço, mas manter decisões e publicações separadas. Mostrar também a quantidade de produtos únicos para não apresentar 1.000 vínculos como 1.000 identidades diferentes.

## Arquitetura proposta

1. **Configuração por vertical:** estado de ativação, categorias versionadas, meta de 100 vagas, orçamento de descoberta/coleta e regras editoriais. Novas verticais começam desativadas até a validação dos dados.
2. **Identidade e evidências compartilhadas:** catálogo, variante, condição, moeda e contexto de preço equivalentes; histórico preservado entre vendedores comparáveis. Não combinar kits, tamanhos, volumes ou modelos diferentes pelo título.
3. **Vínculo por vertical:** elegibilidade, família comercial, estado de monitoramento, motivo de entrada/saída e feedback. Restrição única por identidade e vertical. Reserva de vagas transacional para impedir concorrência acima de 100 e competição indevida entre públicos.
4. **Fila persistente de trabalho:** vencimento, tentativas, reserva com expiração, retomada e orçamento global de API. Distribuição justa entre verticais, priorizando coletas vencidas. Evitar consultas duplicadas do mesmo produto compartilhado e serializar renovação do token quando necessário.
5. **Seleção editorial por canal e dia:** oportunidades aprovadas ordenadas por demanda, economia histórica, utilidade, facilidade de compra, reputação e diversidade. Registrar seleção, cópia e publicação como eventos distintos: copiar não comprova publicação.

Aplicar migrações aditivas e backfill dos dados existentes para Automotivo. Manter a coleta antiga até validar a nova, com transição que impeça dois agendamentos concorrentes. Desativar uma vertical ou reverter o executor não deve apagar histórico.

## Dimensionamento inicial proposto

Garantir capacidade nominal de pelo menos uma coleta histórica diária por produto. Promissores recebem verificações adicionais; itens selecionados são revalidados antes da cópia.

| Trabalho | Orçamento inicial na escala completa |
| --- | ---: |
| Histórico | 1.000 verificações/dia |
| Exploração contínua | Até 20 candidatos/vertical/dia: 200/dia |
| Prioridade | Piloto de até 2 produtos/vertical, verificados a cada 30 minutos durante 8 horas: até 320/dia |
| Total dessas verificações | Até 1.520/dia |

A prioridade de duas vagas por vertical é uma proposta de teste, ainda não implementada; o piloto atual usa seis vagas globais. O orçamento de exploração pode crescer temporariamente para formar os grupos, com limites medidos. Uma promoção curta fora da janela prioritária pode passar despercebida: expandir a cobertura horária dependerá dos resultados e do orçamento.

Proposta de execução histórica: quatro lotes de até 25 por vertical por dia, distribuídos ao longo de 24 horas. São 40 lotes diários, mais exploração e prioridade, com espaço para retomadas. Um dispatcher periódico identifica tarefas vencidas; não lançar 1.000 consultas em uma única função.

Verificação não equivale a uma chamada HTTP. Se cada verificação consumir em média seis chamadas, 1.520 verificações representariam aproximadamente 9.120 chamadas/dia, além de descoberta, rankings, revalidações e retries. Trata-se de hipótese de capacidade, não quota disponível ou custo confirmado. Medir chamadas por endpoint, latência p95, 429/403, tempo de função, tráfego e crescimento do banco antes de ampliar.

Com uma a quatro observações de vendedores por verificação histórica, 1.000 produtos gerariam aproximadamente 30.000–120.000 registros em 30 dias, sem contar observações prioritárias e rankings. Índices, consultas agregadas e paginação no banco devem evitar carregar todo esse histórico em cada abertura da dashboard.

Usar o agendamento Supabase já adotado pelo projeto, sujeito a orçamento e teste de execução. O Supabase documenta agendamento com pg_cron; isso não dispensa limites das funções chamadas. O cron nativo da Vercel Hobby tem frequência diária por job e precisão horária. [Supabase Cron](https://supabase.com/docs/guides/cron), [Vercel Cron: uso e preços](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Descoberta, qualidade e renovação

O universo pesquisado deve ser maior que 100 por vertical. Com aproveitamento hipotético de 25%, avaliar cerca de 400 candidatos para preencher 100 vagas; com 10%, cerca de 1.000. Medir a taxa real, deduplicar e ampliar categorias com rankings utilizáveis. Não pressupor que uma única consulta retorne 100 mais vendidos nem que exista acesso confirmado a toda a vitrine de promoções.

Admitir candidatos com título comercial, imagem, preço positivo em BRL, link utilizável, identidade resolvida, reputação e adequação ao público. Histórico ainda imaturo permite observação, mas não selo de desconto real. Presença em ranking é indício de giro; não inventar vendas recentes nem garantia de conversão.

Continuar descobrindo mesmo com as 100 vagas ocupadas. Candidatos qualificados ficam em espera. Retirar indisponíveis persistentes e rejeitados para aquele público, preservar seu histórico e preencher as vagas. Para substituições por desempenho, propor carência de 30 dias e revisão semanal limitada inicialmente a cinco vagas por vertical, evitando destruir a maturação por troca diária. Essa política deve ser testada e ajustada com dados.

Para a seleção diária, evitar repetir a mesma identidade no mesmo canal por sete dias, salvo queda adicional relevante, validada e explicitamente sinalizada ao operador. Diversificar famílias quando houver ofertas qualificadas. Não compensar baixa demanda com desconto alto. Frete, pagamento, compatibilidade e condições restritas devem acompanhar a avaliação quando disponíveis.

## Execução item a item e critérios de passagem

1. **Fundação para dez verticais:** configuração, vínculos, capacidade de 100 por vertical e feedback contextualizado; migração com preservação integral de Automotivo. Validar concorrência, isolamento de vagas e deduplicação de histórico em testes.
2. **Coleta escalável:** fila retomável, orçamento global, cache de ranking por categoria e métricas por vertical. Testar 1.000 identidades com respostas simuladas, interrupções, 429, expiração de reserva e coleta compartilhada. Confirmar consultas de dashboard limitadas e agregadas no banco.
3. **Prova Casa:** mapear categorias reais, testar resolução autenticada e critérios próprios. Formar 50 elegíveis como marco intermediário e avançar a 100 sem reduzir os requisitos. Se faltar oferta de candidatos, registrar quantidade e causas; ampliar descoberta.
4. **Piloto Automotivo + Casa:** meta de 100 em cada, sete dias de medição após ativação da nova rotina. Alvo inicial: ao menos 95% dos monitorados com preço válido obtido nas últimas 24 horas, fila histórica sem atraso acima de 24 horas e falhas/retries visíveis. Tentativa sem preço não conta como sucesso. Investigar qualquer desvio antes de ampliar.
5. **Fila diária de divulgação:** filtros por vertical, até três sugestões qualificadas por canal, razões da seleção, controle de repetição, registro manual de publicação e revalidação antes de copiar. Sem envio automático a grupos nesta etapa. Mostrar menos de três quando faltarem aprovados.
6. **Ativar as oito restantes:** Eletrodomésticos, Moda, Beleza, Eletrônicos, Infantil, Games, Esportes e Pet, nessa sequência inicial. Cada uma exige categorias, equivalência de produtos, perfil comercial, prova de candidatos e verificação operacional. Não usar apenas um ID raiz para cobrir universos mais amplos, como Infantil e Eletrônicos.
7. **Medir resultado e ajustar:** ofertas qualificadas por vertical/dia, diversidade, aceitação pelo operador, publicações e conversões somente quando houver fonte confiável. Se 100 monitorados não produzirem três boas ofertas diárias, ampliar a descoberta e revisar a composição; discutir expansão da capacidade daquela vertical com base no rendimento real.

## Parecer

A arquitetura pode ser preparada para 1.000 vínculos agora, enquanto o histórico automotivo amadurece. A entrada em operação deve ser progressiva e condicionada à prova de acesso, quantidade de candidatos e capacidade de coleta. Não basta trocar 96 por 1.000 na migração.

O primeiro incremento de implementação é a fundação por vertical, seguido do executor com orçamento e retomada. O resultado comercial será medido por boas ofertas aproveitáveis por grupo, e não apenas pelo número de produtos armazenados. Trinta dias corridos, por si só, não garantem histórico suficiente nem três ofertas aprovadas por dia.
