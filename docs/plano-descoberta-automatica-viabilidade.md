# Plano de descoberta automática e estudo de viabilidade

Data da análise: 6 de setembro de 2026. Escopo: revisão do código, consultas de leitura ao banco de produção e pesquisa de documentação oficial. Este estudo não altera coletores, agendamentos, dados comerciais ou critérios de aprovação.

Situação posterior: a implementação e os resultados reais estão no [relatório de execução de 6 de setembro](execucao-descoberta-automatica-2026-09-06.md). A lista abaixo é o plano original; o relatório distingue o que foi entregue, a configuração conservadora do piloto e a limitação confirmada no acesso promocional.

## Decisão recomendada

É viável melhorar substancialmente a descoberta automática usando os destaques e as ofertas de catálogo já integrados. Há um gargalo comprovado entre descoberta e monitoramento: candidatos encontrados pelo próprio robô não conseguem entrar na coorte quando as 48 vagas estão ocupadas.

A captura integral da vitrine pública de promoções e seus prazos permanece condicionada à comprovação de acesso oficial adequado. Essa dependência não precisa bloquear a melhoria principal: acompanhar mais produtos desejáveis e detectar suas quedas de preço, estejam ou não identificados como participantes de uma campanha.

Viabilidade comercial não equivale a garantia de conversão. O sistema pode exigir evidências de preço e demanda e selecionar utilidade provável; a resposta do público precisa ser medida após as divulgações.

## Evidências verificadas

As contagens abaixo representam o instante da consulta, não a cobertura permanente do marketplace.

| Verificação no Supabase | Resultado |
| --- | --- |
| Snapshots acumulados | 4.318 |
| Identificadores distintos por tipo e ID nos snapshots | 1.781; ainda podem representar o mesmo catálogo por identidades diferentes |
| Categorias com snapshots | 112 |
| Registros na watchlist | 49, sendo 48 monitorados |
| Categorias na coorte monitorada | 47 |
| Monitorados com preço na prévia | 37 |
| Monitorados marcados comparáveis | 36 |
| Monitorados com vendedor confiável | 36; não significa aprovação comercial |
| Compressor MLB57468821 | Quatro snapshots; nenhuma entrada na watchlist |
| Posição do compressor | 2º lugar nos quatro snapshots, associados a categorias Tier A e B |
| Datas desses snapshots | Todos no mesmo dia UTC, 05/09/2026; não comprovam recorrência em quatro dias |
| Última varredura de 144 categorias registrada | 05/09/2026 às 18h09 UTC; 144 tentadas, 32 falhas, 679 candidatos únicos na execução, status PARTIAL |
| Três coletas comerciais mais recentes consultadas | COMPLETED, 24 candidatos e zero falhas cada |

Os contadores agregados não demonstram a causa das 32 falhas. É preciso distinguir categoria sem ranking, restrição de acesso, limite, indisponibilidade e erro de implementação antes de decidir o tratamento. As coletas comerciais bem-sucedidas também não comprovam, isoladamente, que o cron tenha sido o disparador. A última descoberta registrada era do dia anterior: verificar horários de ativação do deploy e logs antes de concluir que houve falha de agendamento.

### Gargalos encontrados no código

1. `seed_commercial_watchlist` só insere quando há menos de 48 monitorados. Novidades não têm orçamento próprio de avaliação. A existência de vaga depende da saída de outros produtos.
2. O balanceamento por categoria prioriza posição, mas a escolha inicial ocorre antes de avaliar a utilidade comercial do produto. Produtos promissores podem ficar atrás de candidatos menos adequados ao público.
3. A coleta consulta até 24 produtos por execução. Com duas execuções diárias, aumentar apenas o limite de monitorados reduziria a frequência individual e prejudicaria os requisitos históricos.
4. A API da vitrine lê até 200 registros da watchlist. Uma expansão acima disso exigiria paginação e avaliação no banco; não basta ampliar o coletor.
5. O executor interrompe novos lotes após 180 segundos. O campo `cursor` atual guarda métricas, não uma posição persistente de retomada. A última varredura auditada tentou todas as categorias, mas uma futura execução interrompida pode repetir o começo sem priorizar as pendentes.
6. A presença no ranking fica ligada à categoria escolhida no registro monitorado. A deduplicação inicial perde outras aparições por categoria; a observação comercial não guarda a dimensão do ranking. Ampliar fontes sem corrigir isso pode misturar rankings ou perder evidência útil.
7. `configuredMeliReader` cria um único sinal de timeout de 20 segundos antes das chamadas. Reutilizá-lo em várias consultas compartilha o prazo. Na expansão, o timeout deve ser por requisição, além de existir um orçamento total explícito.

Fontes internas: `src/server/commercial/service.ts`, `src/server/commercial/ranking.ts`, `src/server/discovery/operational.ts`, `src/server/discovery/product-preview.ts`, `src/server/discovery/orchestrator.ts` e `supabase/migrations/20260905223000_commercial_evidence.sql`.

## Viabilidade por capacidade

| Capacidade | Parecer | Evidência ou dependência |
| --- | --- | --- |
| Descobrir candidatos sem entrada manual | Viável e já parcialmente operacional | Snapshots reais e recurso oficial de destaques. |
| Dar passagem a novidades relevantes | Viável por desenvolvimento interno | Substituir a entrada limitada a vagas livres por fila com orçamento próprio. |
| Comparar o mesmo produto entre vendedores | Viável para a parcela resolvida e comparável | Integração de catálogo atual e prévias comparáveis no banco; cobertura não universal. |
| Detectar queda histórica independentemente de campanha | Viável com continuidade de coleta | Regras históricas já implementadas; precisam de observações suficientes. |
| Consultar posição de candidato conhecido | Documentado; validar no ambiente autenticado | Recurso de highlights por produto ou item, com dimensão explícita. |
| Enumerar toda a página pública de ofertas | Não confirmado | A documentação encontrada de seller-promotions trata campanhas e vendedores; não prova acesso global de afiliado. |
| Saber o término de toda oferta relâmpago | Condicional | Precisa de fonte autorizada com prazo, estado e condições daquela oferta. |
| Monitorar rapidamente uma pequena fila | Tecnicamente viável, infraestrutura a validar | Frequência, cotas, custo e scheduler precisam ser medidos antes da ativação. |
| Garantir desejo de compra ou vendas | Não garantível | As hipóteses comerciais precisam de feedback e resultados por canal. |

O recurso oficial de [mais vendidos](https://developers.mercadolivre.com.br/pt_br/mais-vendidos-no-mercado-livre) documenta até 20 resultados por categoria e consultas de posição por produto/item. O resultado pode variar por dimensão; ausência no ranking não equivale a produto inexistente.

A documentação de [promoções](https://developers.mercadolivre.com.br/pt_br/gerenciar-ofertas) e [ofertas relâmpago](https://developers.mercadolivre.com.br/pt_br/ofertas-relampago) descreve campanhas e itens no contexto de vendedores convidados. Prazo ou estoque reservado não devem ser inferidos a partir de um selo, preço riscado ou parâmetro `container_id` da página pública.

### Limite da prova realizada

Foram confirmados dados operacionais existentes e documentação oficial. Não foi concluída nesta análise uma nova chamada autenticada a `seller-promotions` com a aplicação de produção. A configuração local contém um marcador de segredo sensível em vez da credencial real do cliente ML. Não houve exportação do segredo nem mudança de produção para criar um endpoint de diagnóstico.

Os bloqueios observados ao abrir páginas pela ferramenta de pesquisa não são um teste das permissões OAuth do app. Portanto, não sustentam a conclusão de que a aplicação esteja proibida de usar qualquer API promocional.

## Arquitetura proposta

Separar descoberta, avaliação de entrada, histórico e acompanhamento rápido. Um produto pode participar do histórico e ter prioridade temporária sem duplicar sua identidade nem suas observações.

**Descoberta:** atualizar destaques das categorias elegíveis, manter procedência e todas as dimensões de ranking, normalizar identidades e registrar candidatos novos. Uma fonte promocional confirmada poderá alimentar a mesma entrada.

**Avaliação de entrada:** usar ranking recente, completude, utilidade provável, compatibilidade e diversidade para decidir quem merece observação. Não exigir desconto histórico maduro nessa etapa, pois impediria qualquer produto novo de entrar. A pontuação de entrada é separada da aprovação para divulgação.

**Histórico contínuo:** preservar produtos escolhidos para formar referência diária. Reservar orçamento antes de ampliar a coorte. Não trocar toda a seleção diariamente, pois isso impediria atingir 20 dias de evidência.

**Exploração:** reservar parte da capacidade para candidatos ainda não avaliados, mesmo quando o histórico estiver cheio. Impedir espera indefinida com ordenação por idade, prioridade e cobertura de famílias. Encerrar a tentativa com motivo explícito quando não houver acesso ou adequação comercial.

**Prioridade temporária:** acompanhar produtos já resolvidos que apresentem queda, proximidade de aprovação ou promoção de prazo confirmado. Sem prazo oficial, acompanhar o preço como candidato a queda, sem anunciar oferta relâmpago nem inventar contagem regressiva.

**Seleção e divulgação:** manter os requisitos históricos, demanda, reputação e completude. Revalidar antes de compartilhar e registrar o preço efetivamente divulgado.

## Plano de implementação

### 1 Corrigir admissão e manter o histórico

Adicionar uma fila persistida de candidatos com origem, prioridade, primeira descoberta, próxima avaliação, tentativas e motivo de conclusão. Preservar a watchlist e as observações existentes. A fila deve deduplicar o mesmo catálogo quando a identidade estiver confirmada e manter as ocorrências por categoria separadas.

Introduzir orçamento configurável para histórico e exploração. O compressor MLB57468821 será um caso de regressão: a nova seleção deve conseguir avaliá-lo a partir dos snapshots existentes, sem cadastro manual nem privilégio por ID. Entrar na avaliação não significa receber selo de desconto real.

Aceite: com as vagas históricas ocupadas, um candidato novo relevante recebe avaliação dentro do prazo planejado; um produto em formação de histórico não perde sua coleta diária por causa da exploração; nenhuma observação é apagada.

### 2 Tornar a descoberta completa dentro do escopo contratado

Persistir trabalho por categoria e próxima tentativa, com retomada das pendentes. Registrar separadamente erro transitório, categoria sem ranking, acesso restrito e limite de chamadas. Usar espera progressiva e respeitar orientação de retry quando disponível. Não repetir continuamente chamadas permanentemente indisponíveis.

Aceite: as 144 categorias têm resultado auditável, inclusive as 32 que falharam; uma interrupção retoma as pendentes; ausência de ranking não é apresentada como falha técnica genérica nem como zero vendas.

### 3 Fortalecer identidade e evidência de demanda

Guardar fonte, dimensão, categoria, instante e posição da evidência. Consultar posição por produto/item para candidatos conhecidos quando autorizado, sem comparar diretamente posição de categoria ampla com posição de marca ou subcategoria. Separar falha de consulta de ausência confirmada.

Preservar correspondência exata de catálogo, condição e variante. Não agregar por título nem transformar snapshots repetidos do mesmo dia em dias adicionais de demanda. Confirmar que duas ofertas pertencem ao mesmo produto antes de usar seus preços.

Aceite: um produto presente em duas categorias não perde uma ocorrência; dimensões incompatíveis não produzem um histórico de ranking artificial; as regras históricas atuais continuam falhando de forma conservadora quando falta evidência.

### 4 Validar a integração promocional no runtime autorizado

Executar uma prova pequena no servidor com as credenciais já protegidas: controle positivo de highlights e catálogo; consulta documentada de posição do compressor; leitura das promoções da conta autorizada; leitura de promoção por item conhecido, somente dentro do acesso permitido. Usar apenas GETs, sem criar, aderir ou alterar campanhas.

Registrar somente endpoint, status, latência e campos necessários presentes. Token, segredo, cookies e payloads pessoais não entram no relatório. Uma resposta 401 pede correção de autenticação; 403 exige revisar escopo e propriedade; lista vazia da conta não comprova inexistência de ofertas públicas.

Só testar enumeração de uma campanha após obter um identificador de fonte documentada. Não converter `container_id` da página em ID de API por suposição. Mesmo uma resposta 200 de campanhas da conta não comprova cobertura de vendedores terceiros.

Aceite para ativar a fonte promocional: acesso permitido a candidatos relevantes de terceiros, identidade resolvível, preço e condições claros, paginação conhecida e término verificável quando anunciado. Se não houver essa cobertura, registrar a limitação e seguir com descoberta por mais vendidos e detecção própria de queda. A operação principal não passa a depender de links manuais.

### 5 Implantar acompanhamento rápido com orçamento

Criar fila com `next_check_at`, prioridade, prazo opcional, tentativas e trava por trabalho. Trocar timeout compartilhado por timeout por requisição e aplicar orçamento global. Cache de vendedor e ranking pode reduzir custo, mas o preço deve cumprir a validade exigida para divulgação.

Proposta inicial para dimensionamento, não configuração já aprovada: 96 produtos em histórico diário, 24 avaliações novas por dia e até 12 candidatos prioritários a cada 15 minutos durante oito horas de operação. O piloto pode começar menor e crescer após medir as chamadas.

Isso representa 96 + 24 + (12 × 32) = 504 verificações de produto por dia. Se cada verificação gastar em média seis chamadas, serão aproximadamente 3.024 chamadas, mais descoberta, rankings, retries e outros recursos. Não é cotação nem capacidade comprovada; medir o custo real por produto e a cota disponível. As duas execuções atuais de 24 não suportam esse plano sem mudança de agendamento e processamento.

A [documentação da Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing) restringe frequência e precisão conforme o plano. Confirmar o plano efetivo antes de escolher scheduler e frequência; não ativar custos nem contratar serviços automaticamente neste estudo.

Aceite: fila histórica cumpre cobertura diária; fila prioritária cumpre o intervalo acordado; limite de chamadas é respeitado; queda do upstream reduz a carga e aparece no painel; revalidação impede compartilhar preço expirado como atual.

### 6 Pilotar antes de escalar

Executar primeiro uma simulação de seleção sobre dados existentes, depois um piloto de coleta com orçamento explícito. Comparar com a versão atual sem afrouxar a aprovação histórica.

Métricas: candidatos descobertos e efetivamente avaliados, tempo até primeira avaliação, cobertura diária do histórico, dados comparáveis, vendedores por identidade, famílias representadas, chamadas por produto resolvido, falhas por causa e atraso da fila prioritária.

Critérios propostos: todo candidato admitido tem próxima ação ou motivo de descarte; pelo menos 95% da coorte histórica recebe uma tentativa diária durante sete dias, com sucesso de evidência contabilizado separadamente; nenhum produto com dados insuficientes aparece como aprovado; preços vencidos não são divulgados sem revisão. Metas de conversão serão definidas com resultados reais, não com contagens de cópia.

Os primeiros dias validam engenharia e cobertura. A validação histórica dos novos produtos continua dependente dos dias e vendedores exigidos. Sete dias de piloto não tornam histórico de 30 dias disponível.

## Entregas e ordem sugerida

1. Migração aditiva e seleção de candidatos com exploração, testes de regressão e painel de cobertura.
2. Retomada por categoria e diagnóstico das 32 falhas; correção da evidência de demanda e timeout.
3. Prova de acesso promocional em ambiente autorizado, sem bloquear as entregas anteriores.
4. Scheduler dimensionado, fila prioritária e revalidação antes de compartilhar.
5. Piloto comparativo, ajuste de capacidade e somente então expansão de categorias e verticais.

Arquivos principais previstos: migração nova em `supabase/migrations`, serviços em `src/server/commercial`, orquestração em `src/server/discovery`, rotas em `src/app.ts` e apresentação em `src/ui/dashboard.ts`. Configuração de agendamento só deve mudar após validar infraestrutura e orçamento. Build e testes aplicáveis são requisitos de uma futura implementação; este estudo alterou apenas documentação.

## Parecer final

Recomenda-se avançar com a correção de admissão e cobertura. O compressor enviado é uma evidência concreta de que o sistema já encontra candidatos relevantes e precisa aproveitá-los melhor. A viabilidade dessa melhoria não depende de acesso integral à vitrine promocional.

Permanece em aberto a cobertura oficial de ofertas do dia e relâmpago de terceiros. O plano fornece um teste objetivo para decidir essa integração, sem prometer acesso que ainda não foi demonstrado. A captura de quedas nos produtos acompanhados pode funcionar independentemente do nome da campanha.
