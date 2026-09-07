# Plano do piloto Casa com 50 produtos

> Capacidade revisada após esclarecimento do objetivo: o [plano de 1.000 produtos](plano-expansao-1000-produtos.md) passa a reger a expansão, com 100 monitorados por vertical. As propostas abaixo de 96 + 50 vagas e orçamento para apenas duas verticais ficam substituídas. O marco de 50 em Casa permanece apenas como etapa intermediária de validação.

## Objetivo e parecer de viabilidade

Iniciar Casa, utilidades e organização com pelo menos 50 identidades de produto monitoradas, provenientes de rankings oficiais de mais vendidos e selecionadas por utilidade, facilidade de compra, qualidade dos dados e adequação ao público. A vitrine de ofertas aprovadas continua exigindo desconto histórico comprovado e demanda recorrente.

A expansão é tecnicamente viável mediante adaptação do motor e reserva de capacidade. Ainda não foi comprovado que conseguimos resolver 50 produtos elegíveis de Casa com o acesso atual: isso exige a prova de dados desta etapa. Não há garantia de 50 ofertas com desconto histórico desde o primeiro dia. Esta entrega é planejamento; não ativa a vertical nem altera o banco ou os coletores.

## Evidência levantada no projeto

- Nenhum mapeamento HOME cadastrado em vertical_category_mappings na consulta realizada nesta tarefa.
- 54 produtos monitorados no conjunto atual.
- Três lotes históricos completos recentes processaram 48 + 24, 41 + 24 e 46 + 24 consultas históricas e de exploração, respectivamente, em 39,8, 36,4 e 34,5 segundos, sem falhas registradas de execução. Consultar um candidato não significa obter dados suficientes para aprovação.
- O limite de promoção automática de 96 é global. Somar 50 aos 54 atuais já ultrapassaria esse limite e impediria atingir a meta.
- O executor operacional e validações da persistência ainda restringem o contexto a AUTOMOTIVE. A fila, o monitoramento, o feedback e parte da classificação não separam decisões comerciais por vertical.
- O recurso oficial de highlights retorna até 20 entradas por categoria, podendo conter diferentes tipos e menos resultados. Não existe uma consulta única que garanta os 50 produtos pretendidos. [Documentação de mais vendidos](https://developers.mercadolivre.com.br/pt_br/gerenciamento-perguntas-respostas/mais-vendidos-no-mercado-livre).
- MLB1574 corresponde à raiz Casa, Móveis e Decoração; nosso recorte comercial exige selecionar seus descendentes adequados, em vez de ativar todo o universo. [Categorias do Mercado Livre](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/categorias-e-atributos-veiculos).

Os tempos automotivos indicam margem para um piloto, mas não são garantia de latência, quota ou cobertura da API em Casa. Não foi realizada nesta análise uma nova prova autenticada de categorias e produtos HOME; essa é a primeira condição para a ativação.

## O que significam os 50 produtos

**Monitorados:** pelo menos 50 produtos distintos, com título, imagem, preço público positivo em BRL, link utilizável, identidade comparável e vendedor confiável. Devem ter evidência recente de descoberta entre mais vendidos e aprovação editorial inicial para o público de Casa. Admissão não exige histórico maduro, pois esse requisito impediria a entrada de novos produtos.

**Promissores em observação:** produtos monitorados cujo preço, demanda e condições continuam sendo acompanhados. Desconto anunciado pode ser exibido com esse nome; não recebe selo de desconto histórico.

**Aprovados para divulgação:** somente os que cumprirem os requisitos existentes: 20 dias de preço em até 30 dias, cobertura temporal de pelo menos 27 dias, dois vendedores comparáveis, desconto histórico mínimo de 10%, demanda em pelo menos sete dias dos últimos 14 numa mesma dimensão de ranking e posição mediana até dez, além de completude, confiança e preço atual.

A quantidade de aprovados pode ser zero durante a formação do histórico. Não completar uma lista de 50 aprovados com ofertas inferiores. Fotos ou variantes do mesmo catálogo não contam como produtos adicionais; kits e unidades não compartilham referência sem equivalência confirmada.

## Recorte comercial inicial

Mapear de 20 a 30 categorias finais, ajustando o número após verificar rankings disponíveis. A seleção deve buscar produtos que resolvam problemas cotidianos e cuja utilidade seja fácil de explicar numa mensagem curta.

Famílias candidatas para investigar:

1. Organização de armários, gavetas e pequenos espaços.
2. Cozinha e conservação de alimentos, respeitando material, capacidade e composição dos kits.
3. Limpeza doméstica manual e utensílios de uso recorrente.
4. Lavanderia e organização de roupas.
5. Banheiro e utilidades domésticas com instalação simples.

Esses grupos são hipóteses editoriais, não categorias da API já validadas nem prova de giro. Começar sem móveis volumosos, itens sob medida, decoração dependente de gosto muito específico ou aparelhos elétricos que pertencem ao piloto separado de Eletrodomésticos.

Meta de diversidade: pelo menos três famílias entre os 50, sem mais de 15 produtos de uma única família. Não impor dez produtos por grupo: a disponibilidade de evidências deve determinar a distribuição. Medidas, material, durabilidade indicada por dados disponíveis, montagem, compatibilidade e condições de entrega influenciam a facilidade de compra. Ausência dessas informações reduz confiança; não autoriza inventar atributos.

O apelo deve ser explicado com fatos do produto e uma hipótese de uso, por exemplo, organização de espaço ou praticidade. Número de vendas, avaliação ou reputação só entram quando houver fonte disponível e identificada. Desejo de compra será validado por feedback do operador e resultados reais, não por uma nota apresentada como certeza.

## Plano de execução

### 1 Provar acesso e quantidade suficiente

Consultar a árvore atual de Casa, registrar categorias finais, verificar highlights e resolver uma amostra inicial de 30 a 50 identidades de catálogo distribuídas entre famílias. Registrar status HTTP, latência e disponibilidade de preço, imagem, identidade, vendedor e ranking, sem registrar credenciais.

Estender a triagem até obter pelo menos 50 produtos elegíveis. O universo explorado precisa ser maior: se 25% dos candidatos forem elegíveis, serão necessárias aproximadamente 200 avaliações; se forem 10%, aproximadamente 500. Essas são contas de dimensionamento, não taxas já medidas. Vinte a trinta categorias podem fornecer no máximo 400 a 600 ocorrências por rodada antes de deduplicação, resultados vazios e restrições de acesso.

Critério de passagem: 50 produtos distintos resolvidos, diversidade mínima atendida e origem de ranking documentada. Se a cobertura ficar abaixo disso após a amostra de até 500, relatar o número real, as causas e as categorias adicionais necessárias. Não afrouxar qualidade para fechar a quantidade. A prova não depende da API de promoções de terceiros, cujo acesso global permanece não confirmado.

### 2 Preparar o motor para duas verticais

Adicionar configuração HOME versionada e parametrizar executor, persistência e contagem de categorias esperadas. Manter validação estrita por configuração; não remover os controles que protegem Automotivo. O smoke deve aceitar uma amostra coerente de Casa sem forçar artificialmente a composição de tiers do piloto automotivo.

Separar vínculo comercial por vertical, elegibilidade, prioridade, categoria de descoberta, fila e feedback. Identidade de catálogo e evidências de preço comparáveis podem ser compartilhadas quando forem exatamente o mesmo produto. Descartar um produto para o público automotivo não deve automaticamente descartá-lo para Casa.

Criar migração aditiva com backfill dos registros atuais para AUTOMOTIVE, preservando dados e identidade. Propor associação por vertical ao produto em vez de duplicar seu histórico. Avaliar e documentar a chave de associação antes da migração; não acrescentar apenas um campo ao filtro da interface enquanto o limite e o feedback permanecem globais.

Critério de passagem: testes demonstram isolamento de vagas e decisões, ausência de duplicação de preços e preservação das observações existentes.

### 3 Reservar vagas e orçamento para Casa

Manter até 96 vagas automotivas e adicionar 50 vagas reservadas para HOME. Capacidade conjunta nominal: até 146 vínculos ativos; um produto compartilhado pode aproveitar a mesma consulta se a identidade e o contexto forem equivalentes. A meta inicial de Casa é 50, com possibilidade de expansão após medição.

Proposta de rotina: duas execuções próprias de Casa por dia, cada uma consultando até 25 monitorados e avaliando até dez novidades. Depois da carga inicial, isso oferece capacidade nominal para uma consulta diária por monitorado e renovação da fila. Separar o orçamento de execução do automotivo; não executar tudo dentro do mesmo prazo atual de 120 segundos.

Dimensionamento incremental: 50 consultas históricas + até 20 explorações por dia = até 70 verificações de produto. Com uma hipótese de seis chamadas por verificação, são cerca de 420 chamadas diárias adicionais, mais descoberta, ranking, retries e detalhes complementares. Medir chamadas reais; não há promessa de gratuidade, quota disponível ou tempo fixo com essa estimativa.

Usar o scheduler existente do Supabase, com horários de Casa afastados dos lotes automotivos. Revisar a trava global e registrar execuções adiadas por concorrência com nova tentativa, para não perder uma coleta silenciosamente. Não ampliar inicialmente a fila rápida de seis vagas globais: criar métricas por vertical e decidir sua divisão após a prova. O piloto rápido atual funciona apenas das 09h05 às 16h35 em Brasília.

Critério de passagem: 50 produtos de Casa têm consulta agendada diariamente, sem diminuir a cobertura automotiva. Lotes interrompidos retomam pendentes; a dashboard diferencia tentativa, obtenção de preço e evidência comparável.

### 4 Aplicar seleção comercial própria de Casa

Definir famílias e critérios HOME sem reutilizar diretamente palavras e notas automotivas. Manter os mesmos requisitos de desconto histórico, confiança e demanda antes da pontuação. Usar utilidade, facilidade de compra e diversidade para admissão e ordenação editorial, explicando suas limitações.

Cupons e descontos anunciados continuam separados da referência histórica. Não confundir variações de tamanho, volume, quantidade, material ou modelo ao comparar preços. Quando um produto já tiver histórico comparável no app, avaliar seu reaproveitamento; uma nova identidade não recebe histórico retroativo presumido.

Critério de passagem: exemplos comparáveis e incompatíveis têm resultados esperados em testes; grandes descontos não aprovam produtos sem demanda; nenhum produto recebe selo histórico por pertencer aos mais vendidos.

### 5 Disponibilizar a seleção e validar o piloto

Adicionar filtro por vertical e indicadores de candidatos descobertos, avaliados, monitorados, preços recentes, histórico suficiente e ofertas aprovadas. Mostrar a razão comercial da seleção e permitir feedback contextualizado. Manter revalidação antes da cópia.

Nos primeiros sete dias de Casa, verificar cobertura diária, taxas de resolução, falhas por categoria, diversidade, filas paradas e percepção do operador. A contagem de sete dias de Casa começa quando sua coleta for ativada, independentemente do estágio do piloto automotivo.

Metas propostas: pelo menos 50 monitorados elegíveis no início da operação estável; ao menos 95% recebem tentativa diária; falhas de obtenção de preço são reportadas separadamente; nenhum card é aprovado sem as evidências exigidas. Para desconto histórico, o marco é a maturidade por produto, não simplesmente completar sete ou 30 dias corridos.

## Entregas previstas e decisão

Entregar primeiro um relatório da prova HOME com categorias e taxa de resolução. Em seguida, migrations e testes da separação por vertical, configuração de coleta com 50 vagas, regras comerciais HOME e filtro da dashboard. Build, testes, migrações e publicação devem preceder a declaração de que Casa está ativa.

Parecer: aprovar a preparação de um piloto com 50 monitorados, condicionado à prova de dados e à reserva de capacidade. Não é necessário aguardar o histórico automotivo amadurecer para construir essa estrutura. Não é viável prometer antecipadamente 50 ofertas com desconto histórico comprovado e conversão garantida.
