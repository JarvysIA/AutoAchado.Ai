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

O 0B2A não altera callback, PKCE, cookies, probes ou Vercel, não adiciona cliente Supabase à aplicação e não executa OAuth live. Testes usam valores sintéticos gerados dentro de transação e fazem rollback de metadata e Vault. Nenhuma credencial real é criada. O próximo passo separado é o 0B2B, com adapter Supabase estritamente server-side e provider HTTP falso antes de qualquer gate live.

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
