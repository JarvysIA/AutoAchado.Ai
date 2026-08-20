# AutoAchado.AI — API Feasibility Probe

Ferramenta técnica descartável para validar, exclusivamente por APIs oficiais, a viabilidade de consultar ofertas automotivas públicas no Mercado Livre Brasil.

Este repositório não contém o produto final. Não há banco de dados, Supabase, afiliados, WhatsApp, scraping ou histórico persistente.

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

A Redirect URI oficial cadastrada aponta para a Vercel. Portanto, o servidor local serve para testes unitários e inspeção da página; o OAuth real não deve ser simulado em localhost.

## Deploy manual na Vercel

O projeto está preparado para o domínio cujo callback cadastrado é:

```text
https://autoachado-ai.vercel.app/auth/mercadolivre/callback
```

No checkpoint de deploy, o usuário deverá:

1. conectar manualmente o repositório `JarvysIA/AutoAchado.Ai` à Vercel;
2. garantir que o projeto/domínio usado corresponda a `autoachado-ai.vercel.app`;
3. cadastrar as quatro variáveis de ambiente no painel da Vercel;
4. inserir o Client Secret diretamente no painel, nunca no chat;
5. fazer o primeiro deploy;
6. abrir a aplicação e iniciar o OAuth pelo botão oficial.

Nenhum deploy é executado automaticamente por este BUILD.

## Live probe

O live probe só é iniciado pelo botão `Executar 0A-LIVE`, após OAuth válido. Ele não roda em testes, build ou CI.

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
