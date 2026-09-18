# Solicitação de esclarecimento técnico — preços para curadoria de afiliados

Texto preparado em 14/09/2026. Não enviado.

Estamos construindo uma curadoria de ofertas de afiliados no Brasil e precisamos monitorar preços comparáveis de produtos ao longo do tempo, vinculados aos rankings oficiais de mais vendidos.

Com a mesma conexão OAuth autorizada, GET /users/me retorna 200 e confirma a conta esperada; GET /highlights/MLB/category/MLB108704 retorna 200. Contudo, GET /items/MLB5395837382 retorna HTTP 403 com error=access_denied. Também encontramos restrições ao consultar USER_PRODUCT dos rankings. Não enviamos access_token, refresh_token ou cookies neste relato.

Nas 14 categorias de roupas consultadas, as 280 posições de ranking retornaram ITEM/USER_PRODUCT, sem PRODUCT de catálogo. Portanto, os preços de catálogo disponíveis para outras categorias não atendem às roupas desse conjunto.

Solicitamos esclarecer:

1. O programa de afiliados oferece API, feed ou integração autorizada para consultar preço atual, forma de pagamento, variante e disponibilidade desses anúncios?
2. O 403 exige permissão funcional, aprovação da aplicação/programa ou é uma restrição de leitura de anúncios de terceiros? Qual documentação e procedimento se aplicam ao caso de uso?
3. Há mecanismo autorizado para associar a entidade do ranking ao preço observável, preservando tamanho/cor e quantidade do kit?

A intenção é consultar dados permitidos, sem alterações nas publicações, sem acessar pedidos/compradores e sem contornar restrições.
