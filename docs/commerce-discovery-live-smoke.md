# Commerce discovery live smoke

O Runtime-A prepara a composição permanente do smoke read-only do discovery. O subgate B1 adiciona temporariamente o trigger HTTP protegido `/__internal/0b3d-b/live-smoke`, sem executar chamadas live durante build ou testes.

## Contrato fixo

- contrato: `commerce-discovery-live-smoke/v1`;
- operação OAuth: `0b3d-b-runtime-smoke-v1`, definida no servidor;
- marketplace/site/vertical: `MERCADO_LIVRE` / `MLB` / `AUTOMOTIVE`;
- registry esperado: 144 categorias elegíveis, sendo 28 Tier A e 116 Tier B;
- seleção: modo `SMOKE`, com as duas primeiras categorias A e as duas primeiras B do planner canônico;
- concorrência: 2, herdada de `AUTOMOTIVE_MLB_DISCOVERY_V1`;
- persistência: `DRY_RUN`, desabilitada por construção.

O módulo permanente não aceita mode, persist, IDs de categorias ou configuração de sweep do chamador. A rota B1 também não aceita input operacional: exige `POST`, query vazia, `Content-Type: application/json` e body exatamente `{}` com limite bruto de 32 bytes. A operation ID permanece fixada exclusivamente no serviço.

## Trigger temporário B1

A rota fica oculta com 404 salvo quando `VERCEL_ENV` e `VERCEL_TARGET_ENV` são `production`, e o `Host` normalizado coincide com o `VERCEL_URL` imutável. O domínio customizado público não satisfaz esse guard. O serviço é carregado por import dinâmico somente depois de todos os guards e o correlation ID é gerado no servidor.

O wrapper `commerce-discovery-live-smoke-http/v1` limita a resposta a 64 KiB, usa somente campos allowlisted e nunca inclui request, headers, cookies, tokens, secrets ou erros brutos. A Function única `api/index.js` usa temporariamente `maxDuration: 240`; rota e duração serão removidas no B3, enquanto o hardening permanente abaixo será preservado.

## Operation guard OAuth

O fluxo runtime usa `claim_meli_refresh_for_runtime_operation`. O RPC valida a operation ID, bloqueia a linha canônica e consome o identificador no mesmo `UPDATE` que adquire o lease. O consumo ocorre antes da chamada ao provider e permanece registrado após sucesso, falha, timeout, `OUTCOME_UNKNOWN` ou expiração do lease.

Uma repetição sequencial ou concorrente retorna `OPERATION_ALREADY_USED` sem refresh token e sem novo lease. O RPC humano `claim_meli_refresh(bigint)` permanece inalterado.

## Verificação read-only

Antes e depois do discovery, a composição lê somente as contagens de `scan_runs` e `highlight_snapshots`. Qualquer delta resulta em `DISCOVERY_LIVE_PERSISTENCE_VIOLATION`; não há tentativa automática de correção.

O resultado contém apenas contagens, outcomes sanitizados, métricas e amostras limitadas a dez IDs públicos por tipo. `COMPLETED` exige zero categorias falhas, zero não tentadas e nenhum erro fatal. O contrato expõe `fatalErrorCode`, duração OAuth, contagem de candidatos com provenance em múltiplas categorias e métricas por categoria (tipos, requests, retries e duração). Tokens, headers, payloads OAuth, secrets Supabase e corpos brutos de API nunca fazem parte do contrato.

## Timeouts e chamadas

O client Supabase server-side aceita timeout opcional por `AbortController`; a composição configurada usa 10 segundos por request. O `MeliClient` existente continua responsável pelos retries físicos dos quatro GETs de highlights.

Budget futuro do Runtime-B:

- OAuth token endpoint: uma chamada lógica, sem retry;
- highlights: quatro chamadas lógicas, no máximo doze físicas pelo retry existente;
- product detail, offers e search: zero;
- scraping: zero;
- writes de discovery: zero.

## Limites do B1

O B1 cria, testa e publica a superfície temporária por integração Git. Ele não executa um POST válido, não consome a operation ID, não chama OAuth ou Mercado Livre, não escreve discovery, não cria bypass de proteção e não faz deployment manual. A única execução live pertence ao B2 após revisão; a remoção do trigger temporário pertence ao B3.
