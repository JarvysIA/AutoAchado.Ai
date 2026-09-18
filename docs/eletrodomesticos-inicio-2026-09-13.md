# Eletrodomésticos — piloto operacional

Início: 13/09/2026. Vertical APPLIANCES, raiz MLB5726. Capacidade de até 100 candidatos em 42 categorias oficiais verificadas; seleção inicial favorece aparelhos completos de uso doméstico. O inventário e a fonte estão em `evidence/eletrodomesticos-categorias-2026-09-13.json`.

## Escopo e seleção
Oito famílias: cozimento, preparo, café, limpeza, roupas, clima, especialidades e refrigeração. Limite de quatro por tipo, dois por marca/modelo e 25 por família. Rankings oficiais até posição 20 fornecem evidência de demanda, nunca quantidade de vendas inventada. Peças, reposições e usados ficam fora; instalação especializada ou uso industrial segue para revisão. Geladeiras grandes, lavadoras e ar-condicionado não integram esta primeira carteira.

A nota usa recorrência no ranking, adequação editorial, facilidade, reputação e faixa de preço. A ordem visual alterna tipos de qualidade semelhante e mantém aprovadas primeiro. Amostra incompleta não deve ser preenchida com itens que falhem nos critérios.

## Comparação elétrica e de preço
Exigir marca, modelo e tensão inequívoca ou alimentação por bateria/USB explicitada na API. Capacidade é exigida para domínios de fritadeiras, micro-ondas, fornos, refrigeradores e freezers. O catálogo precisa identificar uma variante ativa única. Preços guardam assinatura de atributos técnicos: marca, modelo, tensão, capacidade, potência e cor. A leitura do histórico filtra pela assinatura atual; 127 V e 220 V não compartilham preços nem se fundem com outro catálogo. Metadados ausentes/ambíguos não qualificam o candidato.

O preço exibido pode ser observado no catálogo; frete, medidas e instalação precisam ser conferidos para a região do comprador. O algoritmo não inventa custo de entrega. A regra histórica continua exigindo evidência suficiente e confirmação da oferta antes da aprovação. O campo original_price permanece desconto anunciado, nunca prova histórica isolada.

## Operação
Executor e tabelas appliances_* são isolados de Casa e Automotivo. API pública autenticada usa vertical=APPLIANCES; endpoint de operação /api/commercial/appliances-run exige CRON_SECRET. Consultas STATUS são paginadas em 50. HISTORY coleta até 25 produtos vencidos por ciclo; preços elegíveis são programados para 12 horas, falhas para uma hora. DISCOVERY percorre categorias menos recentemente verificadas em lotes com duração limitada; uma execução pode não cobrir todas as categorias.

Cron Supabase: histórico a cada hora no minuto 27; descoberta diária às 07:47 UTC / 04:47 Brasília. Não ativa enquanto enabled/executor_ready estiverem falsos. Renovação protege INTERESTED, guarda histórico e respeita capacidade. WhatsApp permanece com revisão e confirmação do usuário; não há disparo autônomo.

## Pendência independente
Automação da geração de links será retomada quando o usuário estiver com o notebook, conforme `pendencia-automacao-links-afiliado.md`.

## Validação em produção — 13/09/2026

Piloto publicado no commit cca246f e habilitado no Supabase. Após a primeira tentativa sem sucesso, a função de início foi validada em transação com rollback e o cache de esquema PostgREST foi recarregado. As duas coletas seguintes responderam HTTP 200; não foi necessária reconexão do usuário ao Mercado Livre.

- 566 candidatos únicos encontrados; 42 categorias tentadas, 40 com resposta e duas com falha de consulta (MLB457530 e MLB457810). A causa individual dessas duas falhas não foi identificada; permanecem sujeitas a novas coletas.
- Carteira inicial recomposta atomicamente após a cobertura completa, com trava contra coleta em andamento e contra qualquer feedback/divulgação do usuário: 100 monitorados, 39 tipos e oito famílias. Na composição obtida: máximo de três por tipo e um por chave de marca/modelo, abaixo dos limites configurados.
- Famílias: cozimento 25, preparo 22, café 12, especialidades 12, clima 10, roupas 8, refrigeração 6 e limpeza 5.
- Duas páginas da API publicada retornaram 50 + 50 produtos únicos, todos com título, foto, preço positivo, URL e especificações verificadas. Isso não garante que todo comprador verá o mesmo preço no catálogo; a revalidação e conferência de variante continuam necessárias.
- Script da dashboard executado com os dados reais em DOM simulado: 100 cards, preços em R$, campos de afiliado, botão de copiar e paginação conferidos. Não substitui teste visual em aparelho real.
- 2.211 observações de preço e 823 registros de ranking persistidos nesta verificação. Registros repetidos no mesmo dia não equivalem a dias adicionais de histórico. Zero ofertas historicamente aprovadas no início.
- Agendas ativas: histórico horário no minuto 27; descoberta diária às 04h47 de Brasília. Cada coleta de histórico trata até 25 vencidos e normalmente agenda elegíveis para 12 horas; não significa atualização dos 100 a cada hora.
- Grupo vinculado: Cyber Ofertas Eletrodomésticos #7. Nenhuma mensagem enviada no teste.
- Automotivo e Casa mantiveram 100 monitorados cada.

Build, testes de regras/rotas/dashboard/WhatsApp e regressão SQL passaram na implementação. A memória da automação de links permanece independente e pendente do notebook.
