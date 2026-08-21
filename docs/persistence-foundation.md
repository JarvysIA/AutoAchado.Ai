# AutoAchado.AI — Persistence Foundation 0B1

O BUILD 0B1 cria somente a fundação local de persistência. Nenhum cliente de banco é carregado pela aplicação do probe e nenhuma conexão remota é configurada.

## Decisões

- PostgreSQL local é iniciado pelo Supabase CLI versionado no projeto e pelo Docker.
- Dinheiro usa `numeric`, datas de calendário usam `date` e instantes usam `timestamptz`.
- IDs Mercado Livre ficam em `text`; `seller_id` usa `bigint`; chaves internas usam UUID ou identity.
- Exclusões em cascata não são usadas. Entidades deixam de participar por `active = false`, preservando snapshots históricos.
- `commercial_family_key` existe em categoria e produto para agrupamento futuro sem confundir categoria técnica com família comercial.
- `universal_appeal_score` é um sinal separado no candidato e não redefine a família comercial.
- cooldown, breakout e reciclagem estão modelados como estado explicável, sem implementar ranking ou agendamento.
- preços são observações de mercado. Preço efetivo após cupom será uma camada futura separada.
- timeline de preço será derivada de `price_snapshots`; não existe tabela redundante de timeline.
- feedback de conversão e cupons ficam explicitamente fora do schema 0B1.

## Segurança

As nove tabelas têm RLS habilitado e nenhuma policy para `anon` ou `authenticated`. Os dois papéis também não recebem privilégios de tabela. O papel interno `service_role` recebe somente operações de dados nas tabelas e uso das duas sequences.

Objetos futuros no schema `public` são deny-by-default: o owner `postgres` não concede automaticamente privilégios de tables, sequences ou functions a `anon`, `authenticated`, `service_role` ou `PUBLIC`. Cada migration futura deve declarar seus grants explicitamente.

O schema não contém colunas para tokens, cookies, secrets ou credenciais.

## OAuth credential control plane 0B2A

O refresh token rotativo do Mercado Livre pertence exclusivamente ao Supabase Vault. A tabela `private.meli_oauth_connections` contém apenas o UUID de referência do Vault e metadata não sensível de estado, versão, lease, falhas e reautorização. Ela não pertence aos schemas expostos pela Data API e nenhum papel de API, inclusive `service_role`, recebe acesso direto.

Quatro RPCs públicas formam a única interface do backend: `initialize_meli_oauth_connection`, `claim_meli_refresh`, `complete_meli_refresh` e `fail_meli_refresh`. Todas são `SECURITY DEFINER`, usam `search_path` vazio, referenciam objetos com schema explícito e concedem `EXECUTE` somente a `service_role`. O schema `vault` permanece fora dos schemas expostos pela Data API e a migration não amplia seus grants administrativos gerenciados por `supabase_admin`; assim, o futuro cliente Data API alcança o segredo somente pela RPC de claim. Ela nunca aceita nome ou UUID arbitrário de secret.

O claim cria um lease exclusivo de dois minutos. Um segundo claim recebe `LOCK_BUSY` sem credencial. Complete e fail exigem o mesmo `lease_id` e `token_version`; respostas antigas não podem substituir uma geração nova. Lease expirado durante `REFRESHING` vira `REFRESH_OUTCOME_UNKNOWN` e exige reautorização, pois não é seguro presumir que o token anterior ainda possa ser usado.

O 0B2A não altera callback, PKCE, cookies, probes ou Vercel e não executa OAuth live. Testes usam valores sintéticos gerados dentro de transação e fazem rollback de metadata e Vault. Nenhuma credencial real é criada.

## Server-side OAuth rotation service 0B2B

O cliente oficial `@supabase/supabase-js` existe somente sob `src/server`. Sua configuração é lazy, desativa persistência de sessão, auto-refresh e detecção de sessão em URL. A aplicação e os probes 0A continuam inicializando sem as novas variáveis; elas só são validadas quando o factory interno do serviço de rotação for chamado.

O adapter expõe apenas os quatro contratos específicos do 0B2A e valida em runtime cada row devolvida. Um outcome diferente de `CLAIMED` acompanhado de refresh token é rejeitado como `CONTROL_PLANE_RESPONSE_INVALID`. Nenhum erro copia row, payload ou mensagem remota para logs.

O provider Mercado Livre faz um único `POST` form-urlencoded ao endpoint oficial de token, com timeout de dez segundos e sem o retry genérico usado pelos probes. `invalid_grant` exige reautorização; `invalid_client` desabilita por erro de configuração; timeout, reset, 429, 5xx e payload de sucesso inválido fecham como outcome desconhecido porque não há garantia de que o refresh token one-time-use permaneça reutilizável.

O serviço executa `claim → refresh → complete`. O access token só é devolvido em memória depois de `complete_meli_refresh` confirmar a nova versão no Vault. Falha ou resultado ambíguo do complete nunca libera o access token; uma tentativa best-effort de `fail_meli_refresh(OUTCOME_UNKNOWN)` é protegida pelo lease e CAS, portanto não altera uma rotação que já tenha sido confirmada. Logs usam allowlist de metadata e a sanitização cobre tokens, Authorization/Bearer, chaves `sb_secret_`, `apikey` e URLs PostgreSQL.

O 0B2B não cria endpoint público, não conecta o callback, não persiste access token, não armazena refresh token fora do Vault, não cria migration e não executa OAuth live. A integração local via Data API não faz parte do gate automático porque o perfil `pnpm db:start` inicia deliberadamente apenas PostgreSQL/Vault e exclui PostgREST; o adapter é validado com as assinaturas SQL exatas e fakes de transporte, enquanto as RPCs reais e o locking continuam cobertos pelo pgTAP do 0B2A.

## Safe initialization and reauthorization CAS 0B2A-FIX1

`initialize_meli_oauth_connection` preserva sua assinatura específica, mas agora serializa a identidade lógica antes da leitura usando advisory transaction lock derivado de `external_user_id`. Isso cobre inclusive a ausência inicial de linha, que não pode ser protegida apenas por `SELECT FOR UPDATE`, sem transformar o lock em mutex global entre sellers diferentes.

Uma conexão inexistente retorna `INITIALIZED` e começa `ACTIVE` na versão 1. Uma conexão `ACTIVE` retorna `ALREADY_INITIALIZED` sem alterar Vault, versão ou metadata. `REFRESHING` retorna `LOCK_BUSY` e preserva integralmente o lease. Somente `REAUTH_REQUIRED` e `REFRESH_OUTCOME_UNKNOWN` permitem substituição humana, retornando `REAUTHORIZED`; `DISABLED` fecha como `STATE_NOT_ALLOWED`.

A reautorização captura estado e versão sob lock e aplica update com CAS explícito de identidade, status e `token_version`, incrementando a versão exatamente uma vez. Qualquer falha inesperada do CAS gera exceção e rollback, sem declarar sucesso. As operações Vault e metadata participam da mesma transação PostgreSQL; o teste de subtransação força falha após a criação do secret e comprova ausência tanto da linha quanto de secret órfão.

Testes com duas conexões PostgreSQL reais comprovam que somente uma inicialização ou reautorização vence, a perdedora recebe outcome seguro, autorização durante refresh preserva o lease e identidades diferentes não se bloqueiam globalmente. Vault continua sendo o único armazenamento do refresh token. Callback, fluxo OAuth do navegador e rotation service permanecem inalterados; o 0B2C continua pendente.

Antes do 0B2C, configurar diretamente na Vercel, sem compartilhar valores em chat: `SUPABASE_URL` (Project URL), `SUPABASE_SECRET_KEY` (Secret Key moderna marcada Sensitive) e `MELI_EXPECTED_USER_ID`. Não criar `MELI_REFRESH_TOKEN`, `REFRESH_TOKEN`, `MELI_ACCESS_TOKEN` ou `SUPABASE_SERVICE_ROLE_KEY`. O próximo passo separado é o 0B2C, que persistirá a autorização humana inicial no Vault.

## Idempotência

- scans são únicos por `job_type + scheduled_bucket + shard_key`.
- highlights são únicos por janela, categoria e produto observado.
- preços são únicos por janela e PRODUCT.
- estatísticas são únicas por produto e dia.
- candidatos são únicos por PRODUCT, dia e versão do score.

Adapters futuros devem usar `INSERT ... ON CONFLICT ... DO UPDATE`, mantendo o mesmo registro em retries.

## Uso local

Pré-requisitos: Docker Desktop ativo e Node.js 20+.

```powershell
pnpm db:start
pnpm db:reset
pnpm test:db
pnpm db:stop
```

`db:reset` recria o banco local e reaplica todas as migrations. Nenhum desses comandos acessa ou altera um projeto Supabase remoto.
