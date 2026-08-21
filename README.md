# AutoAchado.AI — API Feasibility Probe

Ferramenta técnica descartável para validar, exclusivamente por APIs oficiais, a viabilidade de consultar ofertas automotivas públicas no Mercado Livre Brasil.

Este repositório não contém o produto final. A fundação PostgreSQL/Supabase e o plano de controle OAuth estão aplicados local e remotamente; não há scheduler, afiliados, WhatsApp ou scraping.

O 0A-LIVE-D testa a cadeia oficial `CATEGORY → HIGHLIGHTS(type=PRODUCT) → /products/{id} → /products/{id}/items → ITEM → sale_price → seller` pela rota `POST /probe/catalog-products`. A execução live requer OAuth na aplicação implantada e não roda automaticamente em CI.

## Segurança

- Nunca coloque credenciais em arquivos versionados.
- Nunca informe o Client Secret no chat, em issue ou commit.
- Tokens, authorization code, code verifier e cookies não são exibidos nem registrados.
- O cliente HTTP rejeita hosts e endpoints fora da allowlist oficial.
- O relatório passa por sanitização e secret scan antes de ser exibido.

## Variáveis de ambiente

Configure-as somente no ambiente local seguro ou nas configurações protegidas da Vercel:

```text
MELI_CLIENT_ID
MELI_CLIENT_SECRET
MELI_REDIRECT_URI
SESSION_SECRET
SUPABASE_URL
SUPABASE_SECRET_KEY
MELI_EXPECTED_USER_ID
```

Use `.env.example` apenas como referência. Não preencha nem versione um `.env` real.

`SESSION_SECRET` deve ser um valor aleatório com pelo menos 32 caracteres. Gere-o localmente e mantenha-o secreto.

## Desenvolvimento local

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

## Persistência local 0B1

Com o Docker Desktop ativo, a migration e os testes de banco podem ser executados sem credenciais remotas:

```powershell
pnpm db:start
pnpm db:reset
pnpm test:db
pnpm db:stop
```

O modelo, as decisões de segurança e a estratégia de idempotência estão documentados em [`docs/persistence-foundation.md`](docs/persistence-foundation.md). A aplicação do probe ainda não inicializa cliente de banco.

A Redirect URI oficial cadastrada aponta para a Vercel. Portanto, o servidor local serve para testes unitários e inspeção da página; o OAuth real não deve ser simulado em localhost.

## Deploy manual na Vercel

O projeto está preparado para o domínio cujo callback cadastrado é:

```text
https://autoachado-ai.vercel.app/auth/mercadolivre/callback
```

No checkpoint de deploy, o usuário deverá:

1. conectar manualmente o repositório `JarvysIA/AutoAchado.Ai` à Vercel;
2. garantir que o projeto/domínio usado corresponda a `autoachado-ai.vercel.app`;
3. cadastrar as variáveis de ambiente listadas acima no painel da Vercel;
4. inserir o Client Secret diretamente no painel, nunca no chat;
5. fazer o primeiro deploy;
6. abrir a aplicação e iniciar o OAuth pelo botão oficial.

`SUPABASE_SECRET_KEY`, `MELI_CLIENT_SECRET` e `SESSION_SECRET` são exclusivamente server-side. Não crie `MELI_REFRESH_TOKEN`, `REFRESH_TOKEN` ou `MELI_ACCESS_TOKEN` na Vercel: o refresh token rotativo é armazenado somente no Supabase Vault.

## Autorização persistente 0B2C

O callback oficial valida `state` e PKCE, troca o authorization code uma única vez, confirma a identidade tanto na resposta do token quanto em `/users/me` e chama a RPC específica de inicialização do control plane. O refresh token é encaminhado diretamente ao Vault e não entra em cookie, página, log ou tabela operacional. O access token existe somente em memória durante a validação de `/users/me`.

Após sucesso, o navegador recebe apenas uma sessão cifrada de confirmação com `user_id` e instante de autorização. Os probes manuais antigos foram desativados porque não é seguro manter tokens no cookie; a futura coleta server-side usará o serviço de rotação do 0B2B.

## Live probe

Os probes manuais 0A não são mais executáveis após o 0B2C, pois a sessão do navegador não contém tokens. Os respectivos módulos e evidências históricas permanecem no repositório, sem scraping ou rotas privadas.

O probe alternativo `0A-LIVE-B` é iniciado separadamente pelo botão `Executar 0A-LIVE-B`. Ele não usa `/sites/MLB/search`: testa a cadeia oficial `categoria → highlights → User Product → busca de itens do seller por user_product_id → item → sale_price → seller`.

O probe `0A-LIVE-C` é iniciado pelo botão `Executar 0A-LIVE-C`. Ele usa exclusivamente entradas `type=ITEM` devolvidas diretamente por Highlights e mantém `PRODUCT` e `USER_PRODUCT` apenas como observações separadas.

Na Vercel, o relatório é mantido apenas na resposta e oferecido para download. O filesystem serverless não é considerado persistente. O arquivo `reports/0A-LIVE-report.md` só deve ser adicionado após uma execução real e sanitizada.

## Endpoints oficiais em escopo

- `GET /users/me`
- `GET /sites/MLB/categories`
- `GET /sites/MLB/categories/all`
- `GET /categories/{CATEGORY_ID}`
- `GET /sites/MLB/search?category={CATEGORY_ID}`
- `GET /items/{ITEM_ID}`
- `GET /items?ids=...`
- `GET /items/{ITEM_ID}/sale_price`
- `GET /items/{ITEM_ID}/prices`
- `GET /users/{SELLER_ID}`
- `GET /highlights/MLB/category/{CATEGORY_ID}`
- `GET /user-products/{USER_PRODUCT_ID}`
- `GET /users/{SELLER_ID}/items/search?user_product_id={USER_PRODUCT_ID}`

Referências oficiais validadas para o 0A-LIVE-B:

- [Mais vendidos no Mercado Livre](https://developers.mercadolibre.com.mx/en_us/products-analitics-benchmarking/best-sellers-in-mercado-libre)
- [User Products e preço por variação](https://developers.mercadolibre.com.ar/en_us/products-sync-listings/price-per-variation)
- [API de preços](https://developers.mercadolivre.com.br/devcenter/api-de-precos)
- [Reputação de vendedores](https://developers.mercadolibre.com.ar/es_ar/reputacion-de-vendedores)

Referência oficial específica para o 0A-LIVE-C:

- [Highlights: ITEM, PRODUCT e USER_PRODUCT](https://developers.mercadolivre.com.br/pt_br/gerenciamento-perguntas-respostas/mais-vendidos-no-mercado-livre)

Respostas restritas são registradas como evidência; não há tentativa de contorno.

## Taxonomia normalizada 0B3B1

O módulo 0B3B1 prepara, sem persistência, a leitura server-side da taxonomia oficial do Mercado Livre Brasil. Ele suporta apenas `MLB`, valida exclusivamente os três endpoints oficiais de categorias, aceita Bearer opcional por injeção e aplica timeout, retry limitado, allowlist, limites de tamanho e validação de conteúdo.

O dump é convertido em uma árvore imutável com integridade de IDs, relações pai/filho, paths, profundidade, ciclos e presença da raiz automotiva `MLB5672`. `X-Content-MD5` e `X-Content-Created` são apenas capturados como metadata neste estágio; a versão interna usa SHA-256 de uma representação canônica. A semântica do MD5 oficial será determinada somente no gate read-only `0B3B-LIVE`.

Os testes são integralmente offline, usam apenas categorias sintéticas claramente identificadas e não precisam de credenciais, Supabase, Vercel ou internet. O 0B3B1 não cria rota pública, ruleset comercial, classificação, migration ou escrita no registry.

Referências oficiais: [dump de categorias](https://developers.mercadolivre.com.br/pt_br/dump-de-categorias) e [categorias de veículos](https://developers.mercadolivre.com.br/pt_br/convivencia-me1-me2/categorias-e-atributos-veiculos).

Falhas de resposta da taxonomia carregam somente diagnóstico estrutural por allowlist: status, operação, Content-Type/Encoding limitados, Content-Length numérico, contagem de bytes, presença de magic bytes gzip e tipo do JSON no topo. `transportBytes` significa os bytes entregues ao adapter pelo runtime e não afirma representar os bytes comprimidos na rede quando o `fetch` já realizou auto-decode. Body, objeto `Response`, headers arbitrários e tokens nunca entram no erro.
