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

O schema não contém colunas para tokens, cookies, secrets ou credenciais.

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
