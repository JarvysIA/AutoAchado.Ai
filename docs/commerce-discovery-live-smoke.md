# Commerce discovery live smoke

O Runtime-A prepara a composição permanente do smoke read-only do discovery sem expor uma rota HTTP e sem executar chamadas live durante build ou testes.

## Contrato fixo

- contrato: `commerce-discovery-live-smoke/v1`;
- operação OAuth: `0b3d-b-runtime-smoke-v1`, definida no servidor;
- marketplace/site/vertical: `MERCADO_LIVRE` / `MLB` / `AUTOMOTIVE`;
- registry esperado: 144 categorias elegíveis, sendo 28 Tier A e 116 Tier B;
- seleção: modo `SMOKE`, com as duas primeiras categorias A e as duas primeiras B do planner canônico;
- concorrência: 2, herdada de `AUTOMOTIVE_MLB_DISCOVERY_V1`;
- persistência: `DRY_RUN`, desabilitada por construção.

O módulo não aceita mode, persist, IDs de categorias ou configuração de sweep do chamador. Ele não é importado por `src/app.ts` e não é uma superfície HTTP. O Runtime-B futuro deverá criar o trigger administrativo separado, sem ampliar esses inputs.

## Operation guard OAuth

O fluxo runtime usa `claim_meli_refresh_for_runtime_operation`. O RPC valida a operation ID, bloqueia a linha canônica e consome o identificador no mesmo `UPDATE` que adquire o lease. O consumo ocorre antes da chamada ao provider e permanece registrado após sucesso, falha, timeout, `OUTCOME_UNKNOWN` ou expiração do lease.

Uma repetição sequencial ou concorrente retorna `OPERATION_ALREADY_USED` sem refresh token e sem novo lease. O RPC humano `claim_meli_refresh(bigint)` permanece inalterado.

## Verificação read-only

Antes e depois do discovery, a composição lê somente as contagens de `scan_runs` e `highlight_snapshots`. Qualquer delta resulta em `DISCOVERY_LIVE_PERSISTENCE_VIOLATION`; não há tentativa automática de correção.

O resultado contém apenas contagens, outcomes sanitizados, métricas e amostras limitadas a dez IDs públicos por tipo. Tokens, headers, payloads OAuth, secrets Supabase e corpos brutos de API nunca fazem parte do contrato.

## Timeouts e chamadas

O client Supabase server-side aceita timeout opcional por `AbortController`; a composição configurada usa 10 segundos por request. O `MeliClient` existente continua responsável pelos retries físicos dos quatro GETs de highlights.

Budget futuro do Runtime-B:

- OAuth token endpoint: uma chamada lógica, sem retry;
- highlights: quatro chamadas lógicas, no máximo doze físicas pelo retry existente;
- product detail, offers e search: zero;
- scraping: zero;
- writes de discovery: zero.

## Limites deste gate

O Runtime-A apenas cria e testa a fundação. Ele não aplica a migration remotamente, não executa OAuth, não chama Mercado Livre, não habilita persistência e não cria rota, cron ou deployment manual. A aplicação remota da migration e o trigger controlado pertencem a gates posteriores.
