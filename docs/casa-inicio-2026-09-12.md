# Casa — início da implantação

Estado: configuração e diagnóstico publicados; monitoramento HOME ainda não ativado.

## Recorte

29 categorias candidatas, identificadas na árvore oficial obtida em 09/09, em cinco famílias: cozinha (8), organização (6), limpeza manual (6), lavanderia (6), banheiro (3). Cada execução revalida a ascendência MLB1574 antes de consultar o ranking. Configuração: src/server/commercial/home-config.ts.

Meta: até 100 identidades, máximo de 25 por família. Não se exigem 100 ofertas aprovadas no início e não se inventa histórico. O diagnóstico examina até seis produtos distintos por categoria, exige posição oficial entre 1 e 20, registra completude, comparabilidade e reputação disponível. Um produto completo é candidato, não comprovação de desconto nem de desejo de compra. Itens elétricos, móveis e instalação especializada ficam em revisão por título; a curadoria por atributos ainda é necessária.

## Entrega técnica

POST /api/commercial/home-pilot, protegido por CRON_SECRET, aceita apenas o escopo fixo do servidor. Não grava carteira, fila, preço, mapeamentos nem publicações. Limite de início de trabalho: 210 segundos. Cada chamada tem o timeout já usado pela integração. Não substitui execução contínua ou prova de carga para 100 produtos.

14 testes passaram e build validado. As duas primeiras chamadas reais em 12/09 responderam 503 antes de retornar a amostra. Nenhuma quantidade atual de candidatos foi comprovada. A resposta distingue indisponibilidade de autenticação do ML de falha do diagnóstico.

## Trabalho necessário para ativação

1. Concluir a amostra autenticada e revisar categorias/produtos selecionados; ampliar amostragem se a diversidade não comportar 100.
2. Substituir vínculos fixos AUTOMOTIVE no coletor, fila, renovação, feedback, listagem e envio por escopo validado. Preservar os históricos existentes e compartilhar apenas identidades equivalentes.
3. Implementar regras comerciais de Casa por família, capacidade transacional e orçamento de coleta próprio. Testar concorrência e ausência de interferência em Automotivo.
4. Ativar HOME na dashboard, configurar destino Casa e validar coleta, histórico, cópia e revisão de envio. Não enviar mensagens de teste sem autorização específica.

Não há cron de Casa ativo nesta entrega. O prazo de formação do histórico começa nas observações efetivamente persistidas, não na criação desta configuração.
