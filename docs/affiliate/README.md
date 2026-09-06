# Inteligência de afiliado

A dashboard consulta os IDs em /api/discovery/latest-snapshots e enriquece cada registro em /api/discovery/preview. Os campos discount_percent, has_advertised_discount e matched_coupon acompanham a prévia, onde estão os preços e a categoria externa MLB. Não compare a UUID marketplace_category_id do snapshot com códigos MLB.

O desconto anunciado usa original_price e price da mesma resposta de preço (item, oferta de catálogo ou sale_price). Ao trocar de fonte, a referência anterior é descartada. Isso não prova o menor preço histórico. A elegibilidade de 5% é calculada antes do arredondamento.

## Campanhas

Cadastre campanhas em couponRegistry, em src/server/affiliate/coupon-service.ts, somente após conferir os termos oficiais. O registro inicia vazio: VALE10, APP15, MELI20, AUTO10 e RODAS15 não foram confirmados.

Cada entrada precisa de código, descrição, discountValue para exibição, discountType PERCENT ou FIXED, amount numérico, categoryMatch com IDs MLB exatos ou ALL, início, expiração e verificação em ISO 8601, sourceUrl oficial e restrictions. Informe minPurchase e maxDiscount quando aplicáveis. A seleção compara economia monetária respeitando o teto; não infere descendentes de categoria nem garante elegibilidade da conta, app, vendedor ou carrinho. Valores de cupons são em BRL. O endpoint autenticado GET /api/affiliate/coupons retorna apenas campanhas verificadas e vigentes. Alterações no cadastro requerem build e publicação.

## Divulgação

Ofertas completas exigem título descritivo, URL de imagem, preço positivo, moeda válida e link do produto. Registros incompletos continuam acessíveis em seu filtro; isso não corrige restrições 403 da API. Os filtros abrangem as prévias já consultadas, com contadores e carregamento de mais produtos.

Cole o link do produto criado pelo gerador oficial de afiliados. Ele é salvo por produto no localStorage, somente neste navegador. A validação de domínio não comprova atribuição de comissão nem que o destino pertence ao produto: confira o link no gerador antes de usá-lo. Não são fabricados parâmetros de afiliado. A cópia contém texto, preço, condições de cupom quando cadastrado e aviso de que preço e estoque podem mudar; não copia a imagem. Se a área de transferência estiver bloqueada, a interface oferece seleção manual.
