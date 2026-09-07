# AutoAchado AI documento mestre do produto e desenvolvimento

Versão 1 — 6 de setembro de 2026. Base técnica revisada: commit `9cbb67e`. Documento consolidado a partir de AutoAchado.md, AutoAchado.docx, decisões do responsável pelo produto e implementação do repositório. Os documentos originais permanecem preservados como referências históricas.

Complemento de 6 de setembro de 2026: o [plano de descoberta automática e estudo de viabilidade](plano-descoberta-automatica-viabilidade.md) registra a auditoria de cobertura no banco, o caso do compressor encontrado mas não monitorado e a sequência de correções propostas. Esse estudo não representa implementação dessas correções.

Atualização após execução: os commits `05bbecf` e `22f9d3d` implementaram a fila de novidades, a retomada por categoria, a separação das dimensões de demanda, a revalidação antes da cópia e o piloto prioritário. Consulte o [relatório de execução](execucao-descoberta-automatica-2026-09-06.md) e [as regras operacionais atuais](commercial-ranking.md) para os limites e horários vigentes. A prova autenticada não confirmou acesso às promoções de terceiros. As seções abaixo preservam a linha de base analisada antes dessa implementação e devem ser lidas com esse complemento.

## 1 Propósito e critério de sucesso

O AutoAchado.AI seleciona oportunidades de compra para divulgação como afiliado. O robô deve encontrar produtos desejáveis, fáceis de comprar e com sinais consistentes de demanda, oferecidos por vendedores confiáveis a preços inferiores ao histórico observado do mesmo produto. A dashboard entrega uma seleção curta, explicável e pronta para revisão e divulgação pelo operador.

O objetivo comercial é gerar compras e comissão de afiliado ao ajudar o público a economizar. Desconto elevado não compensa baixa vendabilidade. Quantidade de registros minerados, posição Tier A e descontos anunciados isoladamente não medem o sucesso do sistema.

“Auto” significa automação. Automotivo é a vertical piloto; o produto foi pensado para outras categorias e, futuramente, outros marketplaces. A expansão deve preservar a qualidade da seleção e a rastreabilidade das evidências.

## 2 Estado atual confirmado no código

O projeto já ultrapassou o refinamento visual descrito como Passo 5 no roadmap antigo. Há uma primeira versão de seleção comercial e coleta histórica. A etapa atual é estabilizar a operação, acumular evidências e validar comercialmente a seleção.

| Componente | Estado e limite atual |
| --- | --- |
| Autenticação | OAuth do Mercado Livre, armazenamento seguro e renovação de tokens; credenciais somente no servidor. |
| Vertical piloto | 144 categorias automotivas elegíveis para varredura: 28 Tier A e 116 Tier B. |
| Descoberta | Varredura de destaques e persistência de execuções e snapshots no Supabase; pode terminar parcialmente pelo orçamento de execução. |
| Vitrine | Prévias com título, foto, preço e URL quando os recursos oficiais permitem resolver os dados. Registros incompletos não se tornam ofertas aprovadas. |
| Seleção comercial | Estados Aprovado, Em observação e Reprovado; motivos e evidências; seleção diversa de até 20 produtos. |
| Histórico | Observações próprias de preços comparáveis, vendedores e presença no ranking, com regras mínimas de maturidade. |
| Coleta periódica | Varredura diária e duas execuções diárias de coleta configuradas na Vercel. A execução efetiva deve ser acompanhada pelos registros do banco. |
| Afiliados | Copy para WhatsApp e link oficial inserido pelo operador, salvo no navegador. Não há geração comprovada de comissão por simples parâmetro de URL. |
| Cupons | Serviço com validação de condições e vigência. Cadastro inicial vazio até existirem campanhas verificadas. |
| Feedback | Interesse, divulgação e descarte manual; esses registros não comprovam vendas e não recalibram automaticamente o ranking. |

Ainda não estão concluídos: fonte automática de ofertas do dia e relâmpago, revalidação imediatamente antes da divulgação, histórico de publicações por canal, medição de conversão e comissão, distribuição automática e expansão das outras verticais.

## 3 Como uma oportunidade é aprovada hoje

### Identidade e qualidade da oferta

A comparação histórica exige identidade de catálogo confirmada e ofertas comparáveis do mesmo produto. O sistema não une produtos por semelhança de título. Diferenças de variação, condição e contexto do preço precisam ser respeitadas.

A oferta precisa apresentar título comercial, imagem, preço positivo em reais, URL válida para o marketplace, condição e identidade comparáveis, situação ativa e reputação verde confirmada. A evidência de preço pode ter no máximo 24 horas. Isso não garante disponibilidade contínua até o clique; a revalidação no momento de compartilhar é uma próxima entrega.

### Desconto histórico

A referência atual é a mediana dos menores preços diários observados em ofertas comparáveis e de vendedores confiáveis, nos 30 dias anteriores, excluindo o dia atual. O agrupamento diário usa UTC.

São exigidos pelo menos 20 dias distintos de observação, cobertura temporal mínima de 27 dias e dois vendedores. O desconto mínimo é de 10%, aplicado antes do arredondamento. A referência descreve o universo observado pelo robô, não todo o mercado.

O campo `original_price` serve para desconto anunciado. Ele não prova desconto histórico. Cupons, frete e condições particulares da conta não entram automaticamente na referência de preço do produto.

Após 30 dias poderá haver histórico suficiente para parte dos produtos. O tempo decorrido não garante aprovação: faltas de coleta, bloqueios de acesso, ausência de vendedores comparáveis ou preço sem queda podem manter o produto em observação ou reprovação.

### Demanda e potencial comercial

O critério atual exige presença no ranking oficial em pelo menos sete dias dos últimos 14, com posição mediana até dez. Esse é um sinal de demanda relativo à categoria, não uma medição de vendas por dia. Tier A, BuyBox e Full não comprovam, sozinhos, giro ou conversão no canal.

Após os requisitos mínimos, os pesos são: demanda 30%, desconto 25%, apelo 15%, facilidade de compra 15%, reputação 10% e valor comercial 5%. Apelo e facilidade são hipóteses editoriais explícitas, ainda não previsões treinadas com conversões.

Produtos de uso especializado, instalação complexa ou recorrência indesejada podem ser excluídos do perfil amplo inicial. Famílias ainda não avaliadas permanecem em observação. A lista aprovada limita cada grupo a três produtos e não é preenchida artificialmente com reprovados.

## 4 Operação e formação do histórico

| Rotina | Horário configurado em Brasília | Escopo |
| --- | --- | --- |
| Descoberta | 03h diariamente | Varredura das categorias elegíveis, limitada pelo orçamento de execução. |
| Coleta comercial | 06h e 18h diariamente | Até 24 candidatos por execução, priorizando os menos recentemente consultados. |

A coorte inicial tem até 48 candidatos balanceados por categoria, originados de snapshots recentes. Portanto, duas execuções de 24 não significam que todos os produtos sejam consultados duas vezes por dia: a cobertura nominal é aproximadamente uma consulta por candidato por dia, sujeita a falhas, substituições e duração da execução.

A coleta usa trava no banco, limites de tempo e registro de resultado. Produtos especializados saem do monitoramento; candidatos sem título e sem preço após três tentativas podem liberar espaço. As observações anteriores são preservadas.

A próxima auditoria operacional deve medir execuções previstas versus concluídas, cobertura de candidatos, idade do último preço, taxa de dados comparáveis, diversidade de vendedores, respostas bloqueadas e dias históricos acumulados. A configuração de cron, isoladamente, não comprova coleta bem-sucedida.

## 5 Fontes de dados e responsabilidades

O fluxo vigente é: categorias elegíveis → destaques → candidatos monitorados → resolução de ofertas → observações históricas e demanda → requisitos comerciais → ranking e diversidade → revisão humana → copy com link de afiliado.

| Área | Fonte atual no banco | Responsabilidade |
| --- | --- | --- |
| Taxonomia | `marketplace_categories`, `vertical_category_mappings` | Identidade de categoria e associação à vertical. |
| Descoberta | `scan_runs`, `highlight_snapshots` | Auditoria das buscas e evidência bruta de descoberta. |
| Monitoramento | `commercial_watchlist` | Coorte, identidade, última prévia e acompanhamento. |
| Evidência comercial | `commercial_observations` | Observações de preço, vendedor, comparabilidade e posição. |
| Operação comercial | `commercial_collection_runs` | Execuções e contagens da coleta. |
| Avaliação manual | `commercial_feedback` | Última ação do operador por identidade; não é um diário completo de publicações. |

O desenho original também contém `automotive_categories`, `catalog_products`, `seller_profiles`, `marketplace_offers`, `price_snapshots`, `product_daily_stats` e `opportunity_candidates`. A existência dessas tabelas não significa que o coletor comercial atual alimente todo esse modelo. Para o ranking em execução, a fonte operacional é o conjunto `commercial_*`.

A evolução deve definir uma única responsabilidade para cada entidade antes de migrar dados. Uma eventual convergência exige mapeamento de identidades, preservação de datas e procedência, migração idempotente e conferência de contagens e resultados. Este documento não autoriza apagar ou renomear tabelas, nem modifica o esquema atual.

Referências de implementação: `src/server/commercial/ranking.ts`, `src/server/commercial/service.ts`, `src/server/discovery/product-preview.ts`, `src/server/affiliate/coupon-service.ts`, `src/app.ts`, `src/ui/dashboard.ts` e `vercel.json`. As regras operacionais detalhadas permanecem em [commercial-ranking.md](commercial-ranking.md) e [affiliate/README.md](affiliate/README.md).

## 6 Ofertas do dia e ofertas relâmpago

### Como podem contribuir

As vitrines promocionais podem fornecer candidatos adicionais. O motor deve cruzar cada candidato com a identidade do produto, o histórico próprio e a demanda observada. Uma promoção oficial pode ser interessante, mas sua participação na campanha não substitui nenhum requisito comercial.

Exemplo: um produto aparece por R$ 80 em uma promoção com preço anunciado anterior de R$ 120. Se a referência histórica observada for R$ 82, a redução histórica será de aproximadamente 2,4%, insuficiente para o critério atual. Se a referência for R$ 100, a redução será de 20%; ainda será necessário confirmar demanda, vendedor, disponibilidade e demais requisitos.

Um produto já monitorado pode aproveitar imediatamente seu histórico quando entra em promoção. Um produto recém-descoberto continua sem histórico suficiente, mesmo que exiba desconto elevado ou cronômetro.

### O que precisa ser validado antes da integração

A documentação oficial descreve promoções DOD e LIGHTNING no contexto de vendedores e campanhas autorizadas. Isso não comprova que nossa aplicação tenha acesso a uma API que enumere toda a vitrine pública de afiliados. Também não há confirmação de que o `container_id` da URL pública seja um identificador aceito na API de promoções.

As páginas públicas fornecidas não puderam ser inspecionadas de forma confiável pela ferramenta de consulta nesta análise. Portanto, não foram confirmados produtos, descontos ou contadores atuais dessas páginas. A integração automática da vitrine ainda depende de uma prova de acesso oficial e de cobertura dos dados necessários.

O primeiro incremento pode permitir ao operador colar a URL ou ID de um produto encontrado nessas páginas. O app resolveria o candidato pelos recursos oficiais disponíveis e aplicaria o mesmo motor de avaliação. Essa importação ainda precisa ser implementada; não é uma função já entregue.

### Dados e comportamento propostos

Registrar origem da descoberta, tipo da promoção, identificador oficial quando confirmado, início e término com fuso, condições de elegibilidade, preço consultado e instante da última validação. Relacionar catálogo, anúncio, vendedor e variação sem combinar ofertas incompatíveis.

O cartão deve distinguir desconto anunciado de histórico verificado e explicar as condições de cupom. Só exibir contagem regressiva quando o término vier de evidência confiável. Ao expirar ou perder disponibilidade, retirar a oportunidade da seleção de divulgação.

Ofertas de poucas horas podem passar entre as coletas das 06h e 18h. O desenho futuro deve usar uma fila prioritária pequena para promoções acompanhadas, com frequência compatível com acesso autorizado, cotas e infraestrutura. Não é necessário aumentar indiscriminadamente a frequência da varredura inteira.

O adaptador de origem promocional poderá atender outras verticais; os critérios de público, famílias de produto e elegibilidade continuam específicos de cada vertical.

## 7 Roadmap consolidado com critérios de conclusão

### Etapa 1 Documentação e alinhamento

Entregue por este documento: propósito, estado real, limites das evidências, responsabilidades das tabelas e sequência de desenvolvimento. Os roadmaps antigos ficam como histórico; alterações futuras devem atualizar esta referência e a documentação operacional correspondente.

### Etapa 2 Estabilidade da coleta e transparência do histórico

Auditar a rotina diária, apresentar saúde da coleta e cobertura por produto e ampliar a coorte de maneira controlada. Adicionar gráfico de preço e explicação da referência, tratamento de anomalias e análise de economia absoluta antes de alterar critérios de aprovação.

Conclusão: o operador consegue verificar quais produtos estão sendo acompanhados, por que ainda não possuem histórico suficiente e se houve falha de coleta. Uma coleta com falha não conta como evidência nova.

### Etapa 3 Entrada de oportunidades promocionais

Implementar importação de produto por URL ou ID e validar o acesso oficial a campanhas. Se houver uma fonte autorizada adequada, conectar ofertas do dia e relâmpago como outra origem de candidatos, com metadados e vencimento. Se o acesso não cobrir a vitrine pública, manter a entrada assistida sem prometer captura integral.

Conclusão: um candidato importado passa pelo mesmo avaliador, mantém identidade e procedência, não duplica o histórico existente e não recebe aprovação apenas por estar em promoção.

### Etapa 4 Preparação segura para compartilhar

Revalidar preço e disponibilidade imediatamente antes da cópia. Persistir os links oficiais de afiliado por usuário e produto no Supabase para uso entre dispositivos. Separar validade da oferta de evento de publicação e guardar as condições efetivamente divulgadas.

Conclusão: mudança de preço, término de promoção ou indisponibilidade exige revisão da copy; link validado apenas por domínio não é tratado como prova de atribuição de comissão.

### Etapa 5 Vendabilidade e seleção por canal

Revisar famílias, compatibilidade, universalidade, faixa de preço e utilidade para o público. Implementar limite de repetição, intervalo entre publicações e seleção por canal. Usar rejeições do operador para revisar hipóteses, preservando os requisitos mínimos de qualidade.

Conclusão: a seleção apresenta variedade relevante, explica as restrições e evita dominar a vitrine com produtos especializados ou repetidos. A aprovação histórica permanece separada da adequação ao canal.

### Etapa 6 Resultados e monetização observável

Registrar publicações e, quando houver fonte autorizada, cliques, pedidos atribuídos e comissões. Separar essas métricas de interesse manual e quantidade de cópias. Usar resultados suficientes para recalibrar o ranking.

Conclusão: o sistema consegue relacionar resultado, produto, canal e publicação sem inventar taxas de conversão ou comissão.

### Etapa 7 Alertas e distribuição

Criar fila de revisão e alertas de oportunidades qualificadas. Automatizar envio somente após definição de canais, autorização e controles de duplicidade, validade e frequência. O primeiro fluxo continua com aprovação humana.

Conclusão: a publicação não repete ofertas indevidamente e revalida condições antes de enviar.

### Etapa 8 Expansão gradual

Ativar uma nova vertical por vez, validando categorias, cobertura de dados, qualidade dos candidatos e resposta do público. Reutilizar o motor de evidências e ajustar critérios comerciais por vertical. Outros marketplaces exigem adaptação explícita de identidade, fontes e atribuição de afiliado.

Conclusão: cada expansão mantém os requisitos de qualidade e apresenta cobertura operacional e resultado comercial acompanháveis.

## 8 Matriz de expansão

| Ordem | Vertical planejada | Categoria raiz ML | Situação |
| --- | --- | --- | --- |
| 1 | Automotivo | MLB5672 | Piloto ativo com 144 categorias |
| 2 | Casa, utilidades e organização | MLB1574 | Planejada |
| 3 | Eletrodomésticos | MLB5726 | Planejada |
| 4 | Moda | MLB1430 | Planejada |
| 5 | Beleza e cuidado pessoal | MLB1246 | Planejada |
| 6 | Eletrônicos, celulares e acessórios | MLB1051 | Planejada |
| 7 | Infantil, bebês e brinquedos | MLB1132 | Planejada |
| 8 | Games | MLB1144 | Planejada |
| 9 | Esportes e fitness | MLB1276 | Planejada |
| 10 | Pet | MLB1071 | Planejada |

Esses códigos representam a matriz planejada; a ativação exige validar a cobertura real da taxonomia e os descendentes desejados. A existência da vertical na interface não significa coleta ativa. No piloto, o escopo é acessórios e peças para veículos leves e motos, respeitando exclusões; não inclui veículos completos nem serviços.

## 9 Decisões que substituem o roadmap antigo

- Desconto histórico depende de observações comparáveis próprias; `original_price` continua sendo referência anunciada.
- O modelo de monetização é afiliado. Margem de revenda e comparação de peças com FIPE não integram o objetivo atual.
- Trinta dias não garantem que todos os produtos amadureçam nem que exista uma oferta aprovada diariamente.
- Ranking, Tier A e selos logísticos são sinais distintos; nenhum equivale sozinho a vendas ou desejo de compra comprovados.
- A aprovação exige conteúdo completo. Garantir que um link continue funcional para sempre não é possível; o produto precisa de revalidação e validade explícita.
- Cupons só entram após confirmação de condições e vigência. Códigos exemplificativos não são campanhas ativas.
- A automação básica já está configurada. As próximas entregas são observabilidade, cobertura e prioridade para oportunidades curtas.
- A integração promocional e os demais incrementos deste roadmap são propostas de desenvolvimento, não funcionalidades entregues por esta atualização documental.

## 10 Referências

Base interna: AutoAchado.md e AutoAchado.docx fornecidos pelo responsável; decisões desta tarefa; código e documentos operacionais do repositório no commit indicado.

Documentação oficial para a prova de integração promocional:

- [Gerenciar ofertas](https://developers.mercadolivre.com.br/pt_br/gerenciar-ofertas)
- [Ofertas do dia](https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br/ofertas-do-dia)
- [Ofertas relâmpago](https://developers.mercadolivre.com.br/pt_br/publicacao-de-produtos/ofertas-relampago)
- [Concorrência em catálogo](https://developers.mercadolivre.com.br/pt_br/concorrencia-em-catalogo)

Páginas indicadas pelo responsável como fontes candidatas:

- [Ofertas do Mercado Livre](https://www.mercadolivre.com.br/ofertas)
- [Ofertas da categoria automotiva](https://www.mercadolivre.com.br/ofertas?category=MLB5672)
- [Filtro de ofertas relâmpago informado](https://www.mercadolivre.com.br/ofertas?category=MLB5672&container_id=MLB779362-1&promotion_type=lightning)

Os parâmetros das páginas e as condições comerciais podem mudar. Links de navegação pública não constituem contrato de API.
