# Casa — variedade na carteira e na vitrine

Revisão de 12/09/2026.

O recorte inicial tinha 29 categorias, cinco famílias e limite de 25 produtos por família. Isso não limitava repetições dentro de cada tipo. A auditoria encontrou nove organizadores de maquiagem, oito esponjas e oito organizadores de roupa entre os 100 monitorados.

A descoberta passa a consultar 55 categorias oficiais. As 26 adições abrangem preparo de alimentos, mesa, café, varais e cama e banho. IDs e pais verificados na API estão em `evidence/casa-ampliacao-categorias-2026-09-12.json`. O executor revalida a ancestralidade em MLB1574 a cada consulta. Cadastro de categoria não garante ranking ou candidato elegível disponível.

A carteira mantém capacidade de 100 e limite de 25 por família. Novas admissões respeitam três produtos por tipo; mops, potes, panos, esponjas, cabides e escorredores são agrupados também entre categorias diferentes. Os demais tipos usam a categoria. Essa regra ainda não identifica todas as variantes de marca, tamanho e modelo.

A renovação corrige primeiro tipos acima do limite, escolhendo substitutos elegíveis e com preço observado nas últimas 24 horas. Produtos marcados INTERESTED são protegidos; por isso podem existir exceções ao limite. Nenhum histórico é apagado. Renovação normal corrige até cinco posições por execução; substituições por nota seguem o limite diário existente. O rebalanceamento operacional permite até 100 alterações de diversidade, mantendo a vantagem mínima e o limite diário para trocas apenas por nota. Não reduz a carteira sem ter substituto.

Na vitrine, ofertas aprovadas vêm primeiro. Entre produtos do mesmo estado, cada repetição do tipo recebe penalidade de exibição de 12 pontos. A nota comercial armazenada não muda. Portanto a ordem equilibra qualidade e variedade, sem ser uma ordenação estrita pela nota exibida. A ordenação ocorre antes da paginação de 50.

A aprovação de desconto histórico, a coleta de demanda e a confirmação de envio ao WhatsApp não foram flexibilizadas. As categorias novas começam seu histórico na primeira coleta efetiva, sem preencher dias retroativamente. Automotivo permanece isolado.

Validação: build, testes de Casa, endpoint, ordenação e regressão SQL com rollback (capacidade, limite por tipo/família, proteção INTERESTED e isolamento de Automotivo).
