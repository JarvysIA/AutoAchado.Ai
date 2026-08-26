# Commerce Discovery Orchestrator v1

O 0B3D-A prepara o discovery administrativo sem executar Mercado Livre ou OAuth ao vivo e sem persistir resultados.

## Fonte de verdade e eligibility

O Commerce Registry persistido é a única fonte de eligibility. O reader faz quatro leituras bulk/paginadas (`marketplaces`, `commerce_verticals`, `marketplace_categories` e `vertical_category_mappings`), monta o join em memória e só retorna categorias quando marketplace, vertical, categoria e mapping estão ativos, com `scope_status = ALLOWED` e `priority_tier` A ou B.

Snapshot, classifier e heurísticas de nome/path não participam do runtime. O preset `AUTOMOTIVE_MLB_DISCOVERY_V1` exige o universo materializado de 144 categorias: 28 A e 116 B.

## Planejamento

`planDiscoveryRun()` é puro. A ordem canônica é tier A, tier B e `external_category_id` ascendente. `SMOKE` seleciona as duas primeiras A e as duas primeiras B; `FULL_SWEEP` planeja as 144. O digest SHA-256 inclui identidades, tiers e versões relevantes do registry/config, nunca clock ou timings.

## Adapter de highlights

O contrato `marketplace-discovery-adapter/v1` não conhece persistência. O adapter Mercado Livre usa exclusivamente `GET /highlights/MLB/category/{CATEGORY_ID}` e valida o payload em runtime. `content` ausente equivale a vazio; mais de 20 entradas ou campos conhecidos inválidos falham fechados.

- `PRODUCT`: ocorrência e candidato elegível para normalização no 0B3E.
- `ITEM`: ocorrência auditável, não candidato.
- `USER_PRODUCT`: ocorrência auditável, não candidato.
- Tipo desconhecido: descartado como candidato e contado em métrica.

Nenhum payload bruto, token ou header é preservado nos erros.

## Deduplicação e provenance

A mesma identidade tipada na mesma categoria/run produz uma ocorrência efetiva e conserva a menor posição não nula. Um `PRODUCT` visto em várias categorias gera um candidato com várias ocorrências de provenance. IDs iguais de tipos diferentes continuam distintos. A recorrência entre runs será tratada no gate de persistência futuro.

## Orquestração e falhas

O orchestrator executa lotes com concorrência máxima 2 e não adiciona retries ao MeliClient. O cliente existente possui até três tentativas físicas para 429, 5xx e falhas transitórias.

- 401/403: parada global.
- 404: falha isolada da categoria.
- 429 esgotado: interrompe novo agendamento; inflight termina e o restante fica `NOT_ATTEMPTED`.
- Três falhas consecutivas de transporte/5xx: parada global.
- Três respostas consecutivas com schema inválido: `DISCOVERY_ADAPTER_CONTRACT_DRIFT`.
- HTTP 200 com `content: []`: `EMPTY`, não erro.

As métricas cobrem categorias, requests/retries, tipos, candidatos, duplicatas e timings. `persistenceMs` é zero neste build.

## CLI administrativa

O comando preparado é:

```text
pnpm commerce:discovery:run [--smoke|--full-sweep] [--json]
```

O default é `SMOKE` e sempre `DRY_RUN`. `--persist` falha antes de qualquer dependência externa com `DISCOVERY_PERSISTENCE_NOT_ENABLED`. Neste subgate, o runtime live permanece desabilitado; testes usam apenas DI e fakes.

Um dry-run live futuro ainda consumirá a API do Mercado Livre, e a aquisição OAuth poderá rotacionar estado de refresh token. Essa ativação pertence ao 0B3D-B.

## Limites e próximos gates

Não há migration, escrita em `scan_runs`/`highlight_snapshots`, normalização, preço, scoring, afiliado, UI, rota pública ou cron. O 0B3D-P alinhará a persistência; 0B3D-B fará smoke live limitado; 0B3D-C fará o sweep controlado.
