# Execução da descoberta automática

Implementação publicada em main nos commits `05bbecf` e `22f9d3d`. Produção confirmada READY na Vercel. Validação iniciada em 6 de setembro de 2026 e concluída às 21h de Brasília; alguns registros finais possuem data UTC de 7 de setembro.

## Entregas por item

| Item | Entrega e comprovação |
| --- | --- |
| Admissão de novidades | Fila separada da coleta histórica, com até 20 produtos de catálogo e 4 de outros tipos por lote. A coorte pode crescer automaticamente até 96; observações existentes preservadas. |
| Cobertura das categorias | Retomada de pendentes, erro HTTP e próxima tentativa persistidos. Na varredura de validação: 112 categorias com sucesso e 32 com HTTP 404 no recurso de ranking. |
| Evidências de demanda | Observações por identidade e categoria; dias de dimensões diferentes não são combinados para aprovar demanda. |
| Acompanhamento rápido | Até seis produtos ativos, orçamento separado e Supabase Cron habilitado no horário de piloto de 09h05 a 16h35, a cada 30 minutos. |
| Revalidação para divulgar | Consulta nova antes da cópia; dados indisponíveis interrompem a ação e condições alteradas exigem revisão. |
| Acesso a promoções | Prova autenticada executada. Catálogo e ranking acessíveis; promoções do anúncio de terceiro retornaram 403. A vitrine global não foi integrada por falta de acesso confirmado. |

## Resultado do caso do compressor

O produto MLB57468821, antes descoberto e excluído da coorte, entrou automaticamente no monitoramento. A prévia registrada continha título comercial, identidade comparável e preço de R$ 62,98. Essa é uma observação de preço, sujeita a mudança, e não comprovação de desconto histórico.

Na consulta final, o banco continha 1.852 candidatos na fila de descoberta, 96 novidades avaliadas e 54 produtos monitorados. Os limites são de processamento, não garantia de que todos os candidatos se tornarão oportunidades aprovadas. A lista pode continuar sem aprovados enquanto o histórico amadurece.

## Prova autenticada das fontes

Consulta executada em 06/09/2026 às 18h47 UTC, pelo servidor, sem exportar o token:

| Recurso | Resultado |
| --- | --- |
| Produto de catálogo MLB57468821 | HTTP 200 |
| Ofertas do mesmo catálogo | HTTP 200, três resultados solicitados |
| Posição do produto nos destaques | HTTP 200, posição 2 |
| Campanhas da conta autorizada | HTTP 200, lista vazia |
| Promoções do anúncio MLB4690712449 | HTTP 403 |

Uma lista vazia de campanhas da conta não comprova ausência de promoções no marketplace. O 403 do anúncio de terceiro não foi contornado. Não há prazo de oferta relâmpago confirmado nem contagem regressiva fabricada. O robô pode detectar queda nos preços acompanhados sem depender do nome de uma campanha.

## Validação técnica e operacional

- Build TypeScript, bundle da função e verificação isolada do artefato concluídos.
- Suíte completa: 64 arquivos e 676 testes aprovados. Após os ajustes do piloto, 21 testes direcionados aprovados novamente.
- Migrações de fila, cobertura, ranking e scheduler testadas em transação com rollback antes da aplicação inicial.
- Teste SQL de limite prioritário e permissões públicas aprovado com rollback.
- Lote inicial: 48 históricos e 24 novidades avaliados, sem falhas de execução; as novidades não tinham evidência suficiente para promoção.
- Lote com reserva para catálogo: 46 históricos e 24 novidades avaliados, quatro promovidos, sem falhas de execução.
- Cron real registrou execuções bem-sucedidas às 19h05 e 19h35 UTC. A execução das 19h05 coletou quatro produtos.
- Disparo adicional pelo Supabase retornou HTTP 200, sem timeout; o coletor prioritário concluiu seis consultas com zero falhas.

## Limites e acompanhamento

A prioridade temporária dura oito horas, mas somente recebe consultas automáticas dentro do horário do piloto. Ampliar para a noite ou para 24 horas é uma próxima decisão de capacidade; não está habilitado nesta configuração. O segredo do agendamento está no Vault e o job contém apenas a chamada da função fixa.

A coorte histórica não sofre troca diária automática: preservar continuidade é necessário para acumular os dias exigidos. Candidatos qualificados que excederem 96 aguardam vaga e aparecem no contador da dashboard. Uma revisão de capacidade e renovação da coorte deve ser feita após observar cobertura, custo e qualidade, sem confundir avaliação de entrada com aprovação histórica.

O acompanhamento de sete dias proposto no plano ainda depende de tempo transcorrido; não foi apresentado como concluído nesta entrega. Verificar diariamente cobertura de preços, erros, idade da fila, vendedores comparáveis e a adequação dos candidatos ao público. Os requisitos de desconto histórico e demanda permanecem conservadores.

Documentação operacional atualizada em [commercial-ranking.md](commercial-ranking.md). O [plano de viabilidade](plano-descoberta-automatica-viabilidade.md) permanece como registro da decisão anterior à implementação.
