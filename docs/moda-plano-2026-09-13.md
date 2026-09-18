# Moda Feminina e Moda Masculina — início e pendência de dados

Atualizado em 14/09/2026. Esta decisão substitui o plano anterior de um grupo único com 100 modelos.

## Escopo confirmado pelo usuário

Duas categorias independentes, cada uma com 100 modelos: 35 roupas, 35 calçados e 30 acessórios. Futura publicação: uma oferta de cada segmento por dia em cada grupo, somente quando qualificada. Um modelo ocupa uma vaga, quaisquer que sejam tamanhos e cores. Acessórios unissex podem atender ambos os grupos; evidência compartilhável e histórico de divulgação separados. Não há envio autônomo ativado.

A dashboard mantém o layout e os cards; apenas renomeia Moda para Moda Feminina e acrescenta Moda Masculina. Matriz total: 11 categorias. FASHION continua sendo a chave feminina para preservar configurações; FASHION_MEN identifica a masculina.

## Executado

- Migração 20260914010000_fashion_split aplicada: label feminina e registro masculino, capacidade 100 cada, executores de Moda ainda desabilitados.
- Dashboard e configuração WhatsApp com os dois destinos separados. Grupos já identificados e vinculados; destino masculino permanece desabilitado. Nenhuma mensagem foi enviada no diagnóstico.
- Consulta autenticada via /api/commercial/fashion-pilot, POST protegido pelo segredo operacional. Somente leitura de produtos; não admite candidatos nem grava histórico fictício.
- Build e 16 testes passaram antes da publicação inicial, incluindo isolamento das categorias inativas e identidade do produto no diagnóstico.

## Evidência real da API

Primeira amostra autenticada: 14 categorias responderam com rankings de 20 posições cada. Foram inspecionadas as três primeiras posições por categoria: 42 produtos, sem filtro de gênero na origem. Resultado agregado em evidence/moda-piloto-autenticado-2026-09-14.json.

- Roupas: 12 inspecionadas, nenhuma com título/foto/preço completos; endpoints de ITEM e USER_PRODUCT negaram acesso com 403.
- Calçados: 12 inspecionados, cinco com título/foto/preço de catálogo; havia masculino, feminino e unissex.
- Acessórios: 18 inspecionados, 11 com título/foto/preço de catálogo; também havia produtos de outros públicos.
- Nenhum preço de anúncio com link correspondente foi confirmado nessa amostra. Preço de catálogo disponível não comprova grade em estoque nem equivalência de todos os tamanhos.
- A conexão OAuth funcionou para rankings e catálogos. Não há evidência de que pedir nova conexão ao usuário resolva o 403 de detalhes. Não contornar a restrição com cookies ou credenciais alternativas.
- O ranking amplo de relógios trouxe produtos de parede/mesa; fontes do diagnóstico foram refinadas para Relógios de Pulso MLB26426, Colares MLB457383, Brincos MLB1432 e Pulseiras MLB1434, sob Joias e Relógios MLB3937. Seus resultados precisam ser verificados separadamente.

## Regras necessárias antes de admitir Moda Feminina

1. Gênero declarado e revisão de conflitos: título masculino com atributo unissex não vira feminino automaticamente. Crianças e bebês fora dessa carteira.
2. Identidade do modelo separada da variante. Comparação histórica por tamanho, cor, kit/material e identidade verificável; não misturar preços de variantes ou modelos similares.
3. Cor/tamanho específico com desconto real pode entrar, com condição explícita na copy. Grade ampla é prioridade, não requisito universal. Popularidade do modelo não comprova giro da variante específica.
4. Cotas 35/35/30 e variedade por tipo/marca/modelo. Uma variante não cria outra vaga. Nunca completar roupas com acessórios para aparentar 100.
5. Excluir relógios de casa, acessórios de reposição, infantil e itens fora do público. Relógios inteligentes exigem regra de fronteira com Eletrônicos.
6. Preço anunciado e histórico confirmado continuam distintos. Registro no mesmo dia não conta como vários dias de histórico.

## Próximo bloqueio a resolver

Há acesso aos rankings, mas faltam dados utilizáveis dos anúncios de roupas da amostra. Antes do executor e da carteira feminina, validar uma fonte autorizada de detalhes/variantes e ampliar a cobertura de categorias de roupas. A atual amostra não sustenta a promessa de 35 roupas elegíveis, muito menos 100 modelos femininos completos. Calçados/acessórios com catálogo não solucionam a lacuna de roupas.

Enquanto isso, as duas categorias existem na dashboard, mas Moda Feminina fica em validação e Moda Masculina planejada. As carteiras Automotivo, Casa e Eletrodomésticos não foram alteradas.

## Execução ampliada — 14/09/2026

Implementação publicada no commit 5d6c08b: diagnóstico por lotes, código de erro upstream limitado a campos seguros e simulação de cotas/modelos. Build e 35 testes passaram, incluindo regressão do enriquecimento usado nas outras verticais.

- Conta esperada confirmada por /users/me (HTTP 200). Anúncio de roupa /items/MLB5395837382 respondeu 403 access_denied. Não foi um erro de token expirado nessa verificação; o código por si só não identifica qual permissão/política precisa mudar.
- 26 categorias com rankings disponíveis: 520 posições, incluindo 14 categorias de roupas (280 posições), quatro de calçados e oito de acessórios.
- Nenhum PRODUCT de catálogo nos rankings das 14 categorias de roupas consultadas; apenas ITEM e USER_PRODUCT. Isso não prova que toda a taxonomia de roupas seja inacessível.
- 98 produtos únicos de catálogo enriquecidos. Após filtro feminino/unissex sem conflito, qualidade e limites por tipo/marca/modelo, a simulação selecionou 0 roupas, 8 calçados e 26 acessórios. Não se trata de carteira ativada nem de descontos históricos aprovados.
- Busca oficial de catálogo por camiseta/vestido respondeu 200, mas os primeiros resultados incluíram manequins, tecidos e outros domínios. Não foram usados como substitutos nem como evidência de demanda.
- Evidência agregada: evidence/moda-cobertura-2026-09-14.json. Respostas completas mantidas somente no diretório local ignorado .vercel.
- Pix permanece aceito, porém a fonte de catálogo testada não identifica essa condição. O simulador registra UNSPECIFIED_CATALOG_PRICE e nunca presume pagamento no Pix ou desconto histórico confirmado.

Bloqueio para ativação: falta fonte autorizada com preços dos anúncios de roupas relevantes e seus vínculos comparáveis. Repetir coleta não transforma access_denied em acesso permitido. Solicitar esclarecimento ao suporte do Mercado Livre sobre acesso autorizado para o caso de uso afiliado; não pedir cookies, usar token de outro vendedor, contornar a restrição ou preencher cotas com tipos errados. Texto de diagnóstico preparado em moda-solicitacao-acesso-ml.md; nenhuma solicitação externa enviada.
